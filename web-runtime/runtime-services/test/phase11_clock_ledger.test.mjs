// Phase11: Ubuntu RED-first reproduction and genuine native WebAssembly gates.
// Synthetic public test only. Not original Wii OSGetTime/gameplay.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import factory from '../dist/joined_tick.mjs';
import {createSyntheticTickClock} from '../tick_host.mjs';
const wasm=fileURLToPath(new URL('../dist/joined_tick.wasm',import.meta.url));
async function fresh(){
 const m=await factory({locateFile:()=>wasm});m._nsmbw_loop_reset();return m;
}
const ram=(m)=>m._nsmbw_mem_read32(0x80008000)>>>0;
test('RED first: real Wasm cannot rewind high64 legacy sample via native direct Time64',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 assert.equal(c.publish(0x100000002n).written,true);assert.equal(ram(m),2);
 assert.equal(m._nsmbw_services_time64_publish(0,0x80008000,0,1),0);
 assert.equal(m._nsmbw_services_time64_status(),10);assert.equal(ram(m),2);
 assert.deepEqual([m._nsmbw_services_time64_gpr(0,3),m._nsmbw_services_time64_gpr(0,4)],[0,0]);
 assert.equal(m._nsmbw_interop_device_invoked(),0);assert.equal(c.ticks,0x100000002n);
});
test('raw lowword cannot bypass native u64 ledger, with typed status12',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 assert.equal(m._nsmbw_services_tick_store32(0x80008000,0xFFFFFFFF),0);
 assert.equal(m._nsmbw_services_tick_status(),12);assert.equal(m._nsmbw_mem_pages(),0);
 assert.equal(c.publish(0x100000002n).written,true);
 assert.equal(m._nsmbw_services_tick_store32(0xC0008000,1),0);
 assert.equal(m._nsmbw_services_tick_status(),12);assert.equal(ram(m),2);
});
test('malformed registration magic and unsupported addresses remain typed status7',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 assert.equal(m._nsmbw_services_tick_store32(0xFFFFFFFC,0x5449434A),0);
 assert.equal(m._nsmbw_services_tick_status(),7);
 assert.equal(m._nsmbw_services_tick_store32(0xCC008000,9),0);
 assert.equal(m._nsmbw_services_tick_status(),7);
 assert.equal(m._nsmbw_interop_device_invoked(),0);
 assert.equal(c.publish(0x100000002n).written,true);
});
test('failed staged highword/MMIO consumes stage, never writes ghost pages',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 assert.equal(m._nsmbw_services_tick_store32(0xFFFFFFF8,2),1);
 assert.equal(m._nsmbw_services_tick_store32(0xCC008000,2),0);
 assert.equal(m._nsmbw_services_tick_status(),7);
 assert.equal(m._nsmbw_services_tick_store32(0x80008000,1),0);
 assert.equal(m._nsmbw_services_tick_status(),12);
 assert.equal(m._nsmbw_mem_pages(),0);assert.equal(m._nsmbw_interop_device_invoked(),0);
 assert.equal(c.publish(0x200000001n).written,true);
});
test('native direct and legacy aliases see same monotonic state',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 assert.equal(c.publish(0x100000002n).written,true);
 assert.equal(m._nsmbw_services_time64_publish(1,0xC0008000,1,1),0);
 assert.equal(m._nsmbw_services_time64_status(),10);
 assert.equal(m._nsmbw_services_time64_publish(1,0xC0008000,1,3),1);
 assert.equal(ram(m),3);
 assert.equal(c.publish(0x100000002n).written,false);
 assert.equal(m._nsmbw_services_tick_status(),10);
 assert.equal(ram(m),3);assert.equal(c.publish(0x100000004n).written,true);
});
test('Time64 CpuContext returns high in r3 low in r4 across three slots',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 for(let i=0;i<3;i++){
  const r=c.publishCpu(i,(BigInt(i+1)<<32n)|BigInt(i+30));
  assert.equal(r.written,true);
  assert.deepEqual([r.reg3,r.reg4],[i+1,i+30]);
 }
 assert.equal(ram(m),32);
 assert.equal(m._nsmbw_services_time64_gpr(0,4),30);
});
test('quota0 prevents both native and legacy commit without RAM, GPR or device events',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 assert.equal(m._nsmbw_mem_set_page_budget(0),1);
 const r=c.publishCpu(0,0x100000002n);
 assert.equal(r.written,false);assert.equal(r.status,3);
 assert.equal(m._nsmbw_mem_pages(),0);
 assert.equal(m._nsmbw_services_time64_gpr(0,3),0);
 assert.equal(m._nsmbw_interop_device_invoked(),0);
 assert.equal(c.publish(0x100000002n).written,false);
 assert.equal(m._nsmbw_mem_set_page_budget(1),1);
 assert.equal(c.publish(0x100000002n).written,true);
});
test('low32 rollover increments high32 correctly, max u64 cannot advance',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m,{initial:0xFFFFFFFEn});
 assert.equal(c.advance(1n).low32,0xFFFFFFFF);
 const r=c.advanceCpu(0,1n);
 assert.deepEqual([r.reg3,r.reg4,r.rolledOver],[1,0,true]);
 const max=(1n<<64n)-1n;
 assert.equal(c.publish(max).written,true);
 assert.equal(m._nsmbw_services_time64_publish(1,0x80008000,0xFFFFFFFF,0xFFFFFFFE),0);
 assert.equal(m._nsmbw_services_time64_status(),10);
 assert.throws(()=>c.advance(1n),/TICK_OVERFLOW/);
});
test('global guest reset permits epoch reset, native clock claim never released',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 assert.equal(c.publish(0x200000002n).written,true);
 assert.throws(()=>c.reset(0n),/TICK_GUEST_EPOCH_NOT_RESET/);
 m._nsmbw_loop_reset();c.reset(0n);
 assert.equal(m._nsmbw_services_tick_claim(),0);
 assert.equal(c.publish(1n).written,true);
 assert.equal(m._nsmbw_services_time64_publish(0,0x80008000,0,0),0);
 assert.equal(m._nsmbw_services_time64_status(),10);
});
test('128 real C++ Wasm guest frames with shared u64 clock and reset remain bounded',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 assert.equal(m._nsmbw_mem_set_page_budget(7),1);
 for(let i=0;i<128;i++){
  m._nsmbw_loop_reset();c.reset(0n);
  assert.equal(c.publishCpu(i%3,BigInt(i)).written,true);
  assert.equal(m._nsmbw_loop_cpu_spawn(1,0x80010000,0x80005010,0x80008000,0x80009000,1),1);
  assert.equal(m._nsmbw_loop_frame(11),11);
  assert.equal(m._nsmbw_mem_read32(0x80009000),i+1);
  assert.equal(m._nsmbw_mem_pages(),3);
 }
});
