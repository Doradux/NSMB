// Peach Phase10 — independent direct low-word bypass negative oracle.
// All samples synthetic; no original Nintendo Wii guest code or game data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
const root=resolve(process.env.NSMB_P10_CLOCK_ROOT||process.cwd(),'web-runtime/runtime-services');
async function fresh(){
 const wasm=resolve(root,'dist/joined_tick.wasm');
 assert.equal(readFileSync(wasm).subarray(0,4).toString('hex'),'0061736d');
 const m=await(await import(pathToFileURL(resolve(root,'dist/joined_tick.mjs')).href)).default({locateFile:()=>wasm});
 m._nsmbw_loop_reset();
 const {createSyntheticTickClock}=await import(pathToFileURL(resolve(root,'tick_host.mjs')).href);
 return {m,clock:createSyntheticTickClock(m)};
}
test('raw low32 export cannot bypass authoritative 64bit clock before first publish',async()=>{
 const {m,clock}=await fresh();
 const before=m._nsmbw_mem_pages();
 assert.equal(m._nsmbw_services_tick_store32(0x80008000,0xFFFFFFFF),0);
 assert.equal(m._nsmbw_services_tick_status(),12);
 assert.equal(m._nsmbw_mem_pages(),before);
 assert.equal(m._nsmbw_mem_read32(0x80008000),0);
 assert.equal(m._nsmbw_interop_device_invoked(),0);
 assert.equal(clock.publish(0x100000001n).written,true,
  'invalid raw request must not poison later valid legacy sample');
 assert.equal(m._nsmbw_mem_read32(0x80008000),1);
});
test('after >32bit published time an unpaired native lowword cannot roll guest RAM backward',async()=>{
 const {m,clock}=await fresh();
 assert.equal(clock.publish(0x100000002n).written,true);
 const before=m._nsmbw_mem_read32(0x80008000);
 assert.equal(m._nsmbw_services_tick_store32(0xC0008000,1),0);
 assert.equal(m._nsmbw_services_tick_status(),12);
 assert.equal(m._nsmbw_mem_read32(0x80008000),before);
 assert.equal(clock.ticks,0x100000002n);
 assert.equal(m._nsmbw_interop_device_invoked(),0);
 assert.equal(clock.advanceCpu(0,1n).written,true);
 assert.deepEqual([m._nsmbw_services_time64_gpr(0,3),m._nsmbw_services_time64_gpr(0,4)],[1,3]);
});
test('invalid paired high/low guest address consumes native stage without dirty pages',async()=>{
 const {m,clock}=await fresh();
 assert.equal(m._nsmbw_services_tick_store32(0xFFFFFFF8,1),1);
 assert.equal(m._nsmbw_services_tick_status(),0);
 assert.equal(m._nsmbw_services_tick_store32(0xCC008000,2),0);
 assert.equal(m._nsmbw_services_tick_status(),7);
 assert.equal(m._nsmbw_mem_pages(),0);
 assert.equal(m._nsmbw_interop_device_invoked(),0);
 assert.equal(clock.publish(0x100000002n).written,true,
  'failed paired sample must consume staged high and leave valid clock operative');
 assert.equal(m._nsmbw_mem_read32(0x80008000),2);
});
