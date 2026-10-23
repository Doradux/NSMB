// Reviewer-owned native clock authority gates on ONE actual C++ Emscripten module.
// The accepted contract is trusted-host synthetic 32-bit low tick ONLY.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.NSMB_PHASE7_TICK_ROOT||process.cwd(),'web-runtime/runtime-services');
const js=resolve(root,'dist/joined_tick.mjs'),wasm=resolve(root,'dist/joined_tick.wasm');
async function fresh(){
 assert.ok(existsSync(js)&&existsSync(wasm),'exact candidate build required');
 assert.equal(readFileSync(wasm).subarray(0,4).toString('hex'),'0061736d');
 const m=await (await import(pathToFileURL(js).href)).default({locateFile:()=>wasm});
 const create=(await import(pathToFileURL(resolve(root,'tick_host.mjs')).href)).createSyntheticTickClock;
 m._nsmbw_loop_reset();return {m,create};
}
test('rejected fake magic never claims native clock, allocates a page or touches guest memory',async()=>{
 const {m,create}=await fresh();
 assert.equal(m._nsmbw_services_tick_store32(0xFFFFFFFC,0x5449434A),0);
 assert.equal(m._nsmbw_services_tick_status(),7);
 assert.equal(m._nsmbw_mem_pages(),0);
 const owner=create(m,{address:0x80008000});
 assert.equal(owner.publish(200n).written,true);
 assert.equal(m._nsmbw_mem_read32(0xC0008000),200);
});
test('direct native claim blocks JS adapter and persists after W03 guest reset without pages',async()=>{
 const {m,create}=await fresh();
 assert.equal(typeof m._nsmbw_services_tick_claim,'function','compiled native owner claim required');
 assert.equal(m._nsmbw_services_tick_claim(),1);
 assert.equal(m._nsmbw_services_tick_claim(),0,'native duplicate must fail');
 assert.equal(m._nsmbw_mem_pages(),0);
 assert.throws(()=>create(m,{address:0xC0008000}),/TICK_CLOCK_ALREADY_OWNED/);
 m._nsmbw_loop_reset();
 assert.equal(m._nsmbw_mem_pages(),0);
 assert.throws(()=>create(m,{address:0x80008000}),/TICK_CLOCK_ALREADY_OWNED/,
   'guest W03 reset must NOT release native host authority');
});
test('two separately created real Wasm modules have independent native owner and time',async()=>{
 const first=await fresh(),second=await fresh();
 const a=first.create(first.m,{address:0x80008000});
 const b=second.create(second.m,{address:0xC0008000});
 assert.equal(a.publish(200n).written,true);
 assert.equal(b.publish(100n).written,true);
 assert.equal(first.m._nsmbw_mem_read32(0x80008000),200);
 assert.equal(second.m._nsmbw_mem_read32(0x80008000),100);
 assert.equal(first.m._nsmbw_services_tick_claim(),0);
 assert.equal(second.m._nsmbw_services_tick_claim(),0);
 first.m._nsmbw_loop_reset();
 assert.throws(()=>first.create(first.m),/TICK_CLOCK_ALREADY_OWNED/);
 assert.equal(b.advance(1n).written,true);
 assert.equal(second.m._nsmbw_mem_read32(0x80008000),101);
});
