// Peach Phase10: independent RED-first native Time64 monotonicity regression.
// Genuine compiled Emscripten C++ on ONE shared Wasm module, synthetic only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const source=resolve(process.env.NSMB_P10_CLOCK_ROOT||process.cwd(),'web-runtime/runtime-services');
const js=resolve(source,'dist/joined_tick.mjs');
const wasm=resolve(source,'dist/joined_tick.wasm');
async function fresh(){
 assert.equal(readFileSync(wasm).subarray(0,4).toString('hex'),'0061736d');
 const m=await(await import(pathToFileURL(js).href)).default({locateFile:()=>wasm});
 const {createSyntheticTickClock}=await import(pathToFileURL(resolve(source,'tick_host.mjs')).href);
 m._nsmbw_loop_reset();
 return {m,clock:createSyntheticTickClock(m)};
}
function snapshot(m){
 return {
  ram:m._nsmbw_mem_read32(0x80008000)>>>0,
  r3:m._nsmbw_services_time64_gpr(0,3)>>>0,
  r4:m._nsmbw_services_time64_gpr(0,4)>>>0,
  callbacks:m._nsmbw_interop_device_invoked(),
  pages:m._nsmbw_mem_pages()
 };
}
test('RED: legacy high64 publish MUST prevent direct native rewind of full timebase',async()=>{
 const {m,clock}=await fresh();
 assert.equal(clock.publish(0x100000002n).written,true);
 assert.equal(clock.ticks,0x100000002n);
 assert.equal(snapshot(m).ram,2);
 const before=snapshot(m);
 assert.equal(m._nsmbw_services_time64_publish(0,0x80008000,0,1),0,
  'native direct publish cannot accept time < JS legacy published64 ledger');
 assert.equal(m._nsmbw_services_time64_status(),10);
 assert.deepEqual(snapshot(m),before,'native failed publish must not mutate RAM/CPU/callbacks/pages');
 assert.equal(clock.ticks,0x100000002n);
 const good=clock.publishCpu(0,0x100000003n);
 assert.equal(good.written,true);
 assert.deepEqual([good.reg3,good.reg4],[1,3]);
});
test('RED: legacy update AFTER native publication cannot desync the shared monotonic ledger',async()=>{
 const {m,clock}=await fresh();
 assert.equal(clock.publishCpu(0,0x100000002n).written,true);
 assert.equal(clock.publish(0x100000004n).written,true);
 const before=snapshot(m);
 assert.equal(m._nsmbw_services_time64_publish(0,0xC0008000,1,3),0,
  'native ledger must include subsequent legacy64 forward publication');
 assert.equal(m._nsmbw_services_time64_status(),10);
 assert.deepEqual(snapshot(m),before);
 assert.equal(clock.publishCpu(0,0x100000005n).written,true);
 assert.deepEqual([m._nsmbw_services_time64_gpr(0,3),m._nsmbw_services_time64_gpr(0,4)],[1,5]);
});
test('native rejection after a legacy rollover must preserve all contexts',async()=>{
 const {m,clock}=await fresh();
 assert.equal(clock.publishCpu(1,0xFFFFFFFFn).written,true);
 assert.equal(clock.publish(0x100000002n).written,true);
 const previous={
  memory:m._nsmbw_mem_read32(0x80008000),
  cpu1:[m._nsmbw_services_time64_gpr(1,3),m._nsmbw_services_time64_gpr(1,4)],
  cpu2:[m._nsmbw_services_time64_gpr(2,3),m._nsmbw_services_time64_gpr(2,4)],
  callbacks:m._nsmbw_interop_device_invoked()
 };
 assert.equal(m._nsmbw_services_time64_publish(2,0x80008000,0,0xFFFFFFFF),0);
 assert.equal(m._nsmbw_services_time64_status(),10);
 assert.equal(m._nsmbw_mem_read32(0x80008000),previous.memory);
 assert.deepEqual([m._nsmbw_services_time64_gpr(1,3),m._nsmbw_services_time64_gpr(1,4)],previous.cpu1);
 assert.deepEqual([m._nsmbw_services_time64_gpr(2,3),m._nsmbw_services_time64_gpr(2,4)],previous.cpu2);
 assert.equal(m._nsmbw_interop_device_invoked(),previous.callbacks);
});
