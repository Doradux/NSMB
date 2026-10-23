// Luigi Phase10: real synthetic Emscripten Time64 native-vs-legacy regression.
// Uses a compiled Wasm candidate from NSMB_PHASE10_TIME64_ROOT. No Nintendo data.
// This is intentionally RED against local integrated main b12af83; it must be
// GREEN only on Toad's independently reviewed fixed exact commit SHA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = process.env.NSMB_PHASE10_TIME64_ROOT;
assert.ok(root,'Provide NSMB_PHASE10_TIME64_ROOT to an EXACT clean Time64 candidate checkout');
const dir=resolve(root,'web-runtime','runtime-services');
const wasm=join(dir,'dist','joined_tick.wasm');
const esm=join(dir,'dist','joined_tick.mjs');
assert.ok(existsSync(wasm)&&existsSync(esm),'Compiled Emscripten Time64 artifact missing');

async function fresh() {
  const create=(await import(pathToFileURL(esm).href)).default;
  const {createSyntheticTickClock}=await import(pathToFileURL(join(dir,'tick_host.mjs')).href);
  const m=await create({locateFile:()=>wasm});
  m._nsmbw_loop_reset();
  const c=createSyntheticTickClock(m);
  return {m,c};
}
const bits=(m,slot)=>[m._nsmbw_services_time64_gpr(slot,3)>>>0,
                       m._nsmbw_services_time64_gpr(slot,4)>>>0];

test('direct native Time64 CANNOT rewind RAM after LEGACY high64 clock published',async()=>{
 const {m,c}=await fresh();
 assert.equal(c.publish(0x100000002n).written,true);
 assert.equal(m._nsmbw_mem_read32(0x80008000)>>>0,2);
 const before=bits(m,0);
 const ticks=c.ticks;
 const accepted=m._nsmbw_services_time64_publish(0,0x80008000,0,1);
 assert.equal(accepted,0,'BUG: native service accepted stale 64-bit time after legacy publish');
 assert.notEqual(m._nsmbw_services_time64_status(),0,'No typed refusal status on native rewind');
 assert.deepEqual(bits(m,0),before,'Failed native publish mutated diagnostic CpuContext');
 assert.equal(m._nsmbw_mem_read32(0xC0008000)>>>0,2,'Failed native publish rolled back checked guest RAM');
 assert.equal(c.ticks,ticks,'Failed native publish rewound JS ledger');
 assert.equal(m._nsmbw_interop_device_invoked(),0,'Denied call invoked unsupported MMIO callback');
});

test('cached/uncached alias cannot bypass native monotonic guard after legacy publication',async()=>{
 const {m,c}=await fresh();
 assert.equal(c.publish(0x20000000An).written,true);
 assert.equal(m._nsmbw_mem_read32(0x80008000)>>>0,10);
 const before=bits(m,1);
 assert.equal(m._nsmbw_services_time64_publish(1,0xC0008000,1,9),0,
   'uncached mirror of same RAM bypassed native monotonicity');
 assert.notEqual(m._nsmbw_services_time64_status(),0);
 assert.equal(m._nsmbw_mem_read32(0x80008000)>>>0,10);
 assert.deepEqual(bits(m,1),before);
});

test('native regressive call after a prior valid native publish remains forbidden',async()=>{
 const {m,c}=await fresh();
 const first=c.publishCpu(2,0x100000002n);
 assert.equal(first.written,true);
 const before=bits(m,2);
 assert.deepEqual(before,[1,2]);
 assert.equal(m._nsmbw_services_time64_publish(2,0x80008000,1,1),0);
 assert.notEqual(m._nsmbw_services_time64_status(),0);
 assert.deepEqual(bits(m,2),before);
 assert.equal(m._nsmbw_mem_read32(0x80008000)>>>0,2);
});

test('failed native MMIO after legacy publication preserves RAM and CPU sidecar',async()=>{
 const {m,c}=await fresh();
 assert.equal(c.publish(0x100000002n).written,true);
 const before=bits(m,0);
 assert.equal(m._nsmbw_services_time64_publish(0,0xCC008000,1,3),0);
 assert.notEqual(m._nsmbw_services_time64_status(),0);
 assert.equal(m._nsmbw_mem_read32(0x80008000)>>>0,2);
 assert.deepEqual(bits(m,0),before);
 assert.equal(m._nsmbw_interop_device_invoked(),0);
});
