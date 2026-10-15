// Real joined C++ Wasm adversarial host-clock ownership gates.
// Use NSMB_TOAD_PHASE5_ROOT from an exact CLEAN candidate checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.NSMB_TOAD_PHASE5_ROOT||process.cwd());
const base=resolve(root,'web-runtime/runtime-services');
const bin=resolve(base,'dist/joined_tick.wasm');
const js=resolve(base,'dist/joined_tick.mjs');
const host=resolve(base,'tick_host.mjs');
async function fresh(){
 for(const file of [bin,js,host])assert.equal(existsSync(file),true,'requires exact compiled Toad candidate: '+file);
 assert.equal(readFileSync(bin).subarray(0,4).toString('hex'),'0061736d');
 const mod=await (await import(pathToFileURL(js).href)).default({locateFile:()=>bin});
 const {createSyntheticTickClock}=await import(pathToFileURL(host).href);
 mod._nsmbw_loop_reset();
 return {mod,createSyntheticTickClock};
}
test('real Wasm clock publishes checked RAM, alias, quota rollback, and low32 wrap',async()=>{
 const {mod:m,createSyntheticTickClock:create}=await fresh();
 const c=create(m,{initial:0xFFFFFFFEn,address:0x80008000});
 assert.equal(c.publish(0xFFFFFFFFn).written,true);
 assert.equal(m._nsmbw_mem_read32(0xC0008000)>>>0,0xFFFFFFFF);
 const next=c.publish(0x100000000n);
 assert.equal(next.written,true);assert.equal(next.rolledOver,true);
 assert.equal(next.low32,0);
 assert.equal(m._nsmbw_mem_read32(0x80008000),0);
 m._nsmbw_loop_reset();c.reset(0n);
 assert.equal(m._nsmbw_mem_set_page_budget(0),1);
 assert.deepEqual(c.advance(1n),{written:false,status:3,low32:1,elapsedTicks:0n,rolledOver:false});
 assert.equal(m._nsmbw_mem_pages(),0);
 assert.equal(m._nsmbw_mem_set_page_budget(1),1);
 assert.equal(c.advance(1n).written,true);
 assert.equal(m._nsmbw_mem_read32(0x80008000),1);
});
test('RED: multiple host clocks must not regress shared W04 tick even through guest aliases',async()=>{
 const {mod:m,createSyntheticTickClock:create}=await fresh();
 const first=create(m,{address:0x80008000});
 // Either reject duplicate ownership of aliased checked guest word up front
 // OR safely synchronize/arbitrate monotonic writes between host handles.
 let second;
 try{second=create(m,{address:0xC0008000})}
 catch(e){
   assert.match(String(e?.message||e),/TICK|CLOCK|OWNER|ALIAS|BUSY|DUPLICATE/);
   return;
 }
 assert.equal(first.publish(200n).written,true);
 assert.equal(m._nsmbw_mem_read32(0x80008000)>>>0,200);
 let rejected=false;
 try {
   const reply=second.publish(100n);
   rejected=reply.written===false;
 }catch{rejected=true}
 const seen=m._nsmbw_mem_read32(0xC0008000)>>>0;
 assert.equal(seen,200,'stale second clock MUST NOT overwrite a later guest tick with 100');
 assert.equal(rejected,true,'stale competing writer must explicitly reject or stay behind current tick');
});
