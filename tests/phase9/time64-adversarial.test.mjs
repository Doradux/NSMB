// Independent REAL compiled-CpuContext native 64bit public synthetic clock tests.
// NOT original Nintendo OSGetTime, Wii oscillator, or Wii ROM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.NSMB_PHASE9_TIME64_ROOT||process.cwd(),'web-runtime/runtime-services');
const wasm=resolve(root,'dist/joined_tick.wasm'),js=resolve(root,'dist/joined_tick.mjs');
async function fresh(){
 assert.equal(readFileSync(wasm).subarray(0,4).toString('hex'),'0061736d');
 const m=await (await import(pathToFileURL(js).href)).default({locateFile:()=>wasm});
 const create=(await import(pathToFileURL(resolve(root,'tick_host.mjs')).href)).createSyntheticTickClock;
 m._nsmbw_loop_reset();return {m,c:create(m)};
}
test('legacy lowword and CpuContext64 host paths maintain 64bit monotonic state across rollover',async()=>{
 const {m,c}=await fresh();
 assert.equal(c.publish(0xFFFFFFFFn).written,true);
 assert.equal(m._nsmbw_mem_read32(0x80008000)>>>0,0xFFFFFFFF);
 assert.equal(m._nsmbw_services_time64_gpr(0,3),0,'legacy lowword does not forge CPU high register');
 const first=c.advanceCpu(0,1n);
 assert.deepEqual([first.written,first.reg3,first.reg4,first.rolledOver],[true,1,0,true]);
 const second=c.advance(1n);
 assert.deepEqual([second.written,second.low32,second.elapsedTicks],[true,1,0x100000001n]);
 const third=c.advanceCpu(1,1n);
 assert.deepEqual([third.reg3,third.reg4,third.written],[1,2,true]);
 assert.equal(m._nsmbw_services_time64_gpr(0,4),0,
   'CPU slot0 remains unchanged when slot1 is published');
 assert.equal(m._nsmbw_services_time64_gpr(1,4),2);
 assert.equal(m._nsmbw_mem_read32(0xC0008000),2);
});
test('rejected native regression leaves 64bit register pair AND last lowword guest memory unchanged',async()=>{
 const {m,c}=await fresh();
 assert.equal(c.publishCpu(2,0x234567890ABCn).written,true);
 const before=[m._nsmbw_services_time64_gpr(2,3),m._nsmbw_services_time64_gpr(2,4),
  m._nsmbw_mem_read32(0x80008000)];
 assert.equal(m._nsmbw_services_time64_publish(2,0xC0008000,0x2345,0x67890ABB),0);
 assert.equal(m._nsmbw_services_time64_status(),10);
 assert.deepEqual([m._nsmbw_services_time64_gpr(2,3),m._nsmbw_services_time64_gpr(2,4),
  m._nsmbw_mem_read32(0x80008000)],before);
 assert.equal(m._nsmbw_interop_device_invoked(),0);
});
test('failed native publish to device after valid full64 snapshot does not change CPU or clock',async()=>{
 const {m,c}=await fresh();
 assert.equal(c.publishCpu(0,0x100000020n).written,true);
 const before=[m._nsmbw_services_time64_gpr(0,3),m._nsmbw_services_time64_gpr(0,4)];
 assert.equal(m._nsmbw_services_time64_publish(0,0xCC008000,1,33),0);
 assert.equal(m._nsmbw_services_time64_status(),7);
 assert.deepEqual([m._nsmbw_services_time64_gpr(0,3),m._nsmbw_services_time64_gpr(0,4)],before);
 assert.equal(m._nsmbw_mem_read32(0x80008000),32);
 assert.equal(m._nsmbw_interop_device_invoked(),0);
 assert.equal(c.advanceCpu(1,1n).reg4,33,
  'after native MMIO-denied publish, legitimate guest clock may continue');
});
