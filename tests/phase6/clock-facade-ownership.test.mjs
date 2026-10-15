// Isolated Phase6 review of real Emscripten tick clock single-owner contract.
// No original Nintendo game bytes; checked sparse W04 RAM and W03 scheduler.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {existsSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.NSMB_PHASE6_TICK_ROOT||process.cwd(),'web-runtime/runtime-services');
const path=resolve(root,'dist/joined_tick.wasm');
const esm=resolve(root,'dist/joined_tick.mjs');
const clockURL=pathToFileURL(resolve(root,'tick_host.mjs')).href;
async function fresh(){
 assert.ok(existsSync(path));assert.ok(existsSync(esm));
 assert.equal(readFileSync(path).subarray(0,4).toString('hex'),'0061736d');
 const factory=(await import(pathToFileURL(esm).href)).default;
 const m=await factory({locateFile:()=>path});
 const {createSyntheticTickClock}=await import(clockURL);
 m._nsmbw_loop_reset();
 return {m,createSyntheticTickClock};
}
function forwardedFacade(m){
 const names=['_nsmbw_services_tick_store32','_nsmbw_services_tick_status',
 '_nsmbw_mem_pages','_nsmbw_loop_ready','_nsmbw_loop_paused',
 '_nsmbw_loop_done','_nsmbw_loop_faulted','_nsmbw_loop_cancelled',
 '_nsmbw_loop_trace_length'];
 return Object.fromEntries(names.map(name=>[name,m[name].bind(m)]));
}
test('real module and separate JS ESM imports each refuse same-instance double clock',async()=>{
 const {m,createSyntheticTickClock:create}=await fresh();
 const a=create(m,{address:0x80008000});
 const b=(await import(clockURL+'?phase6ExternalReview=B')).createSyntheticTickClock;
 assert.throws(()=>b(m,{address:0xC0008000}),/TICK_CLOCK_ALREADY_OWNED/);
 assert.equal(a.publish(200n).written,true);
 assert.throws(()=>a.reset(0n),/TICK_GUEST_EPOCH_NOT_RESET/);
 assert.equal(m._nsmbw_mem_read32(0x80008000),200);
 m._nsmbw_loop_reset();
 a.reset(0n);
 assert.equal(a.publish(100n).written,true);
 assert.equal(m._nsmbw_mem_read32(0x80008000),100);
});
test('RED: two structural JS facades of same Wasm must not silently regress one guest clock',async()=>{
 const {m,createSyntheticTickClock:create}=await fresh();
 // Forwarding provider facade is supported structurally by the clock API,
 // and correctly delegates its operations to the SAME underlying C++ Wasm.
 const facade1=forwardedFacade(m),facade2=forwardedFacade(m);
 const owner1=create(facade1,{address:0x80008000});
 let owner2;
 try{owner2=create(facade2,{address:0xC0008000})}
 catch(e){
   assert.match(String(e.message),/TICK|CLOCK|OWNER|REGISTRATION/);
   assert.equal(owner1.publish(200n).written,true);return;
 }
 assert.equal(owner1.publish(200n).written,true);
 assert.equal(m._nsmbw_mem_read32(0xC0008000),200);
 let refused=false;
 try{const reply=owner2.publish(100n);refused=reply.written===false}
 catch{refused=true}
 assert.equal(m._nsmbw_mem_read32(0x80008000),200,
   'two wrappers cannot make a single underlying guest Wasm clock go backwards');
 assert.equal(refused,true,'a second guest-clock authority must be refused explicitly');
});
