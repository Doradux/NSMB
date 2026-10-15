import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import factory from '../dist/joined_tick.mjs';
import {createSyntheticTickClock} from '../tick_host.mjs';
const wasm=fileURLToPath(new URL('../dist/joined_tick.wasm',import.meta.url));
async function fresh(){const m=await factory({locateFile:()=>wasm});m._nsmbw_loop_reset();return m}
test('one checked RAM timeword is published by host, read by the real compiled CPU',async()=>{
 const m=await fresh(), clock=createSyntheticTickClock(m);
 const step=clock.advance(61n);
 assert.deepEqual(step,{written:true,status:0,low32:61,elapsedTicks:61n,rolledOver:false});
 assert.equal(m._nsmbw_mem_read32(0xC0008000),61);
 assert.equal(m._nsmbw_loop_cpu_spawn(1,0x80010000,0x80005010,
  0x80008000,0x80009000,0),1);
 assert.equal(m._nsmbw_loop_frame(11),11);
 assert.equal(m._nsmbw_loop_state(1),3);
 // The fixed public synthetic CPU uses low byte + upper byte + salt.
 assert.equal(m._nsmbw_loop_cpu_gpr(1,3),61);
 assert.equal(m._nsmbw_mem_read32(0x80009000),61);
});
test('low 32-bit timebase wraps exactly while host 64-bit counter remains monotonic',async()=>{
 const m=await fresh();
 const c=createSyntheticTickClock(m,{initial:0xFFFFFFFEn});
 assert.equal(c.advance(1n).low32,0xFFFFFFFF);
 const result=c.advance(1n);
 assert.deepEqual(result,{written:true,status:0,low32:0,elapsedTicks:0x100000000n,rolledOver:true});
 assert.equal(c.ticks,0x100000000n);
 assert.equal(m._nsmbw_mem_read32(0xC0008000),0);
 assert.equal(c.advance(1n).rolledOver,false);
 assert.equal(c.advance(1n).low32,2);
});
test('quota0 write does not allocate memory, advance tick or cause ghost device callbacks',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m,{initial:10n});
 assert.equal(m._nsmbw_mem_set_page_budget(0),1);
 const denied=c.advance(61n);
 assert.deepEqual(denied,{written:false,status:3,low32:71,elapsedTicks:10n,rolledOver:false});
 assert.equal(c.ticks,10n);assert.equal(m._nsmbw_mem_pages(),0);
 assert.equal(m._nsmbw_interop_device_invoked(),0);
 assert.equal(m._nsmbw_mem_set_page_budget(1),1);
 assert.equal(c.advance(61n).written,true);
 assert.equal(c.ticks,71n);
 assert.equal(m._nsmbw_mem_read32(0x80008000),71);
 assert.equal(m._nsmbw_mem_pages(),1);
});
test('MMIO/GX/misaligned/underflow guest addresses fail closed without invoking handlers',async()=>{
 for(const address of [0xCC000000,0xCC008000,0xCC007FFC,0x817FFFFF,0x80008001,
  0x40000000,0x88000000,0xFFFFFFFF]) {
  const m=await fresh();
  if((address&3)===0) {
    const c=createSyntheticTickClock(m,{address});
    const result=c.advance(1n);
    assert.equal(result.written,false,'reject '+address.toString(16));
    assert.equal(result.status,7);
    assert.equal(c.ticks,0n);
    assert.equal(m._nsmbw_mem_pages(),0);
    assert.equal(m._nsmbw_interop_device_invoked(),0);
  } else {
    assert.throws(()=>createSyntheticTickClock(m,{address}),/INVALID_TICK_ADDRESS/);
  }
 }
});
test('invalid host samples, regressions, tick overflow, giant deltas are rejected BEFORE guest mutation',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 for(const bad of [-1n,7,1.5,NaN,Infinity,'1',2n**64n]) {
  assert.throws(()=>c.publish(bad),/INVALID_TICK/);
 }
 assert.equal(c.advance(2n).written,true);
 assert.throws(()=>c.publish(1n),/TICK_REGRESSION/);
 assert.throws(()=>c.advance(-1n),/INVALID_TICK_STEP/);
 assert.throws(()=>c.advance(60750001n),/TICK_STEP_TOO_LARGE/);
 assert.equal(c.ticks,2n);
 assert.equal(m._nsmbw_mem_read32(0x80008000),2);
 const other=await fresh();
 const near=createSyntheticTickClock(other,{initial:(2n**64n)-1n});
 assert.throws(()=>near.advance(1n),/TICK_OVERFLOW/);
});
test('single checked clock page and CPU guest stack quota fault isolate three contexts',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 assert.equal(m._nsmbw_mem_set_page_budget(1),1);
 assert.equal(c.publish(100n).written,true);
 for(let i=0;i<3;i++)
  assert.equal(m._nsmbw_loop_cpu_spawn(i+1,0x80010000,0x80005010+i*0x1000,
  0xC0008000,0x80009000+i*0x1000,i),1);
 assert.equal(m._nsmbw_loop_frame(3),3);
 for(let i=0;i<3;i++) {
  assert.equal(m._nsmbw_loop_state(i+1),4);
  assert.equal(m._nsmbw_loop_guest_error(i+1),3);
  assert.equal(m._nsmbw_loop_pc(i+1)>>>0,0x80010000);
  assert.equal(m._nsmbw_loop_retry_safe(i+1),1);
 }
 assert.equal(m._nsmbw_mem_read32(0x80008000),100);
 assert.equal(m._nsmbw_mem_pages(),1);
 assert.equal(m._nsmbw_mem_set_page_budget(7),1);
 for(let i=0;i<3;i++)assert.equal(m._nsmbw_loop_retry_quota(i+1),1);
 assert.equal(m._nsmbw_loop_frame(33),33);
 for(let i=0;i<3;i++) {
  assert.equal(m._nsmbw_loop_state(i+1),3);
  assert.equal(m._nsmbw_mem_read32(0x80009000+i*0x1000),100+i);
 }
});
test('128 repeated frames/reset cycles bound clock state and never share RAM across Wasm instances',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 for(let i=0;i<128;i++) {
  m._nsmbw_loop_reset();c.reset();
  assert.equal(c.publish(BigInt(i)).written,true);
  assert.equal(m._nsmbw_mem_read32(0x80008000),i);
  assert.equal(m._nsmbw_mem_pages(),1);
  assert.equal(m._nsmbw_loop_cpu_spawn(5,0x80010000,0x80005010,
    0x80008000,0x80009000,5),1);
  assert.equal(m._nsmbw_loop_frame(11),11);
  assert.equal(m._nsmbw_loop_state(5),3);
  assert.equal(m._nsmbw_mem_read32(0x80009000),i+5);
 }
 m._nsmbw_loop_reset();assert.equal(m._nsmbw_mem_pages(),0);
 const other=await fresh();assert.equal(other._nsmbw_mem_read32(0x80008000),0);
});
test('synthetic clock host cannot be reentered from hostile WASM provider',()=>{
 let clock, lastStatus=0;
 const provider={
  _nsmbw_services_tick_store32(address,value) {
    if(address===0xFFFFFFFC && value===0x5449434B)return 1;
    assert.throws(()=>clock.advance(1n),/REENTRANT_TICK_SERVICE/);
    lastStatus=3;
    return 0;
  },
  _nsmbw_services_tick_status(){return lastStatus;}
 };
 clock=createSyntheticTickClock(provider);
 const failed=clock.advance(1n);
 assert.equal(failed.written,false);
 assert.equal(clock.ticks,0n);
});

test('RED-first: one canonical clock owner per Wasm, including cached/uncached aliases',async()=>{
 const m=await fresh();
 const first=createSyntheticTickClock(m,{address:0x80008000});
 assert.equal(first.publish(200n).written,true);
 const before=m._nsmbw_mem_read32(0xC0008000)>>>0;
 assert.equal(before,200);
 assert.throws(()=>createSyntheticTickClock(m,{address:0xC0008000,initial:0n}),
  /TICK_CLOCK_ALREADY_OWNED/,'alias MUST NOT create independent stale clock');
 assert.throws(()=>createSyntheticTickClock(m,{address:0x90008000,initial:0n}),
  /TICK_CLOCK_ALREADY_OWNED/,'one module has one authoritative synthetic virtual timebase');
 assert.equal(m._nsmbw_mem_read32(0xC0008000)>>>0,before);
 assert.equal(first.advance(61n).low32,261);
 assert.equal(m._nsmbw_mem_read32(0x80008000),261);
 const other=await fresh(), independent=createSyntheticTickClock(other);
 assert.equal(independent.publish(100n).written,true,'different Wasm module has independent clock');
});

test('phase6 RED: URL-distinct JS ESM evaluations cannot own same Wasm tick service',async()=>{
 const m=await fresh();
 const a=(await import(new URL('../tick_host.mjs?phase6=A',import.meta.url))).createSyntheticTickClock;
 const b=(await import(new URL('../tick_host.mjs?phase6=B',import.meta.url))).createSyntheticTickClock;
 const owner=a(m,{address:0x80008000});
 assert.throws(()=>b(m,{address:0xC0008000}),/TICK_CLOCK_ALREADY_OWNED/);
 assert.equal(owner.publish(200n).written,true);
 assert.equal(m._nsmbw_mem_read32(0xC0008000)>>>0,200);
});
test('phase6 RED: host-only reset cannot rewind live shared RAM; module-wide reset permits fresh epoch',async()=>{
 const m=await fresh(),owner=createSyntheticTickClock(m);
 assert.equal(owner.publish(200n).written,true);
 assert.throws(()=>owner.reset(0n),/TICK_GUEST_EPOCH_NOT_RESET/);
 assert.equal(owner.ticks,200n);
 assert.equal(m._nsmbw_mem_read32(0xC0008000),200);
 assert.throws(()=>owner.publish(100n),/TICK_REGRESSION/);
 m._nsmbw_loop_reset();
 assert.equal(m._nsmbw_mem_pages(),0);
 owner.reset(0n);
 assert.equal(owner.publish(100n).written,true);
 assert.equal(m._nsmbw_mem_read32(0x80008000),100);
});

test('phase6: a nonextensible Wasm facade fails closed and cannot claim an unrecorded owner',async()=>{
 const m=await fresh();
 Object.preventExtensions(m);
 assert.throws(()=>createSyntheticTickClock(m),/TICK_CLOCK_REGISTRATION_FAILED/);
 assert.equal(m._nsmbw_mem_pages(),0);
 assert.equal(m._nsmbw_loop_ready(),0);
});
test('phase6: guest clock ownership descriptor cannot be erased or replaced',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 const key=Symbol.for('nsmbw.runtime.synthetic.tick.owner.v1');
 const desc=Object.getOwnPropertyDescriptor(m,key);
 assert.equal(desc?.configurable,false);
 assert.equal(desc?.writable,false);
 assert.equal(desc?.enumerable,false);
 assert.equal(c.publish(200n).written,true);
 assert.equal(Reflect.defineProperty(m,key,{value:false}),false);
 assert.equal(m._nsmbw_mem_read32(0xC0008000),200);
});

test('phase7 RED: two structural forwarding facades cannot regress one real guest Wasm',async()=>{
 const m=await fresh();
 const names=['_nsmbw_services_tick_store32','_nsmbw_services_tick_status',
   '_nsmbw_mem_pages','_nsmbw_loop_ready','_nsmbw_loop_paused',
   '_nsmbw_loop_done','_nsmbw_loop_faulted','_nsmbw_loop_cancelled',
   '_nsmbw_loop_trace_length'];
 const facade=()=>Object.fromEntries(names.map(n=>[n,m[n].bind(m)]));
 const a=createSyntheticTickClock(facade(),{address:0x80008000});
 const bFacade=facade();
 let rejected=false;
 try {
  const b=createSyntheticTickClock(bFacade,{address:0xC0008000});
  assert.equal(a.publish(200n).written,true);
  try{const r=b.publish(100n);rejected=r.written===false}catch{rejected=true}
 }catch(err) {
  assert.match(String(err.message),/TICK|CLOCK|OWNER|MISSING|REGISTRATION/);
  rejected=true;
  assert.equal(a.publish(200n).written,true);
 }
 assert.equal(rejected,true);
 assert.equal(m._nsmbw_mem_read32(0x80008000)>>>0,200);
});
test('phase7 RED: facade forwarding native claim must be rejected after first owner',async()=>{
 const m=await fresh();
 const names=['_nsmbw_services_tick_store32','_nsmbw_services_tick_status',
 '_nsmbw_services_tick_claim','_nsmbw_mem_pages','_nsmbw_loop_ready',
 '_nsmbw_loop_paused','_nsmbw_loop_done','_nsmbw_loop_faulted',
 '_nsmbw_loop_cancelled','_nsmbw_loop_trace_length'];
 const wrapper=()=>Object.fromEntries(names.filter(n=>typeof m[n]==='function')
   .map(n=>[n,m[n].bind(m)]));
 const a=createSyntheticTickClock(wrapper());
 assert.equal(a.publish(200n).written,true);
 assert.throws(()=>createSyntheticTickClock(wrapper(),{address:0xC0008000}),
 /TICK_CLOCK_ALREADY_OWNED|MISSING_CHECKED_TICK_SERVICE/);
 assert.equal(m._nsmbw_mem_read32(0xC0008000),200);
});

test('phase7: a facade spoofing only the optional claim export cannot bypass native ownership',async()=>{
 const m=await fresh();
 const first=createSyntheticTickClock(m,{address:0x80008000});
 assert.equal(first.publish(200n).written,true);
 const names=['_nsmbw_services_tick_store32','_nsmbw_services_tick_status',
   '_nsmbw_mem_pages','_nsmbw_loop_ready','_nsmbw_loop_paused',
   '_nsmbw_loop_done','_nsmbw_loop_faulted','_nsmbw_loop_cancelled',
   '_nsmbw_loop_trace_length'];
 const facade=Object.fromEntries(names.map(n=>[n,m[n].bind(m)]));
 facade._nsmbw_services_tick_claim=()=>1; // not an actual native claim
 assert.throws(()=>createSyntheticTickClock(facade,{address:0xC0008000}),
  /TICK_CLOCK_ALREADY_OWNED/);
 assert.equal(m._nsmbw_mem_read32(0x80008000),200);
});
test('phase7: guest reset does not relinquish the native lifetime claim',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 assert.equal(c.publish(200n).written,true);
 m._nsmbw_loop_reset();
 c.reset(0n);
 assert.equal(c.publish(100n).written,true);
 assert.equal(m._nsmbw_services_tick_claim(),0);
 assert.equal(m._nsmbw_services_tick_store32(0xFFFFFFFC,0x5449434B),0);
 assert.equal(m._nsmbw_services_tick_status(),8);
 assert.equal(m._nsmbw_mem_read32(0x80008000),100);
});
