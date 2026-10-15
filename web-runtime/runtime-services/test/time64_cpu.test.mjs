import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import factory from '../dist/joined_tick.mjs';
import {createSyntheticTickClock} from '../tick_host.mjs';
import {readFile} from 'node:fs/promises';
const wasm=fileURLToPath(new URL('../dist/joined_tick.wasm',import.meta.url));
async function fresh(){const m=await factory({locateFile:()=>wasm});m._nsmbw_loop_reset();return m;}
test('REAL CpuContext ABI: zero and full 64-bit r3 high / r4 low',async()=>{
 const m=await fresh(), clock=createSyntheticTickClock(m);
 assert.equal(m._nsmbw_services_time64_context_bytes(),m._nsmbw_loop_cpu_abi_layout(0));
 assert.equal(m._nsmbw_services_time64_context_bytes(),464);
 assert.equal(m._nsmbw_services_time64_context_alignment(),8);
 let s=clock.publishCpu(0,0n);
 assert.deepEqual([s.written,s.reg3,s.reg4,s.low32,s.high32],[true,0,0,0,0]);
 s=clock.publishCpu(1,0x123456789ABCDEF0n);
 assert.deepEqual([s.written,s.reg3,s.reg4],[true,0x12345678,0x9ABCDEF0]);
 assert.equal(m._nsmbw_mem_read32(0xC0008000)>>>0,0x9ABCDEF0);
 assert.equal(m._nsmbw_services_time64_gpr(1,3)>>>0,0x12345678);
 assert.equal(m._nsmbw_services_time64_gpr(1,4)>>>0,0x9ABCDEF0);
 assert.equal(m._nsmbw_services_time64_gpr(1,1),0,'SP untouched');
 assert.equal(m._nsmbw_services_time64_gpr(1,2),0,'SDA untouched');
 assert.equal(m._nsmbw_services_time64_gpr(1,13),0,'SDA untouched');
 assert.equal(m._nsmbw_services_time64_gpr(0,3),0,'independent context');
});
test('real low32 rollover advances high32 exactly and preserves stable pair',async()=>{
 const m=await fresh(),clock=createSyntheticTickClock(m,{initial:0xFFFFFFFEn});
 const a=clock.advanceCpu(0,1n),b=clock.advanceCpu(0,1n);
 assert.deepEqual([a.reg3,a.reg4,a.rolledOver],[0,0xFFFFFFFF,false]);
 assert.deepEqual([b.reg3,b.reg4,b.rolledOver],[1,0,true]);
 assert.equal(clock.ticks,0x100000000n);
 assert.equal(m._nsmbw_mem_read32(0x80008000),0);
 assert.equal(clock.advanceCpu(0,1n).reg4,1);
});
test('native status: absent clock owner or direct native monotonic regression is denied',async()=>{
 const m=await fresh();
 assert.equal(m._nsmbw_services_time64_publish(0,0x80008000,1,23),0);
 assert.equal(m._nsmbw_services_time64_status(),9);
 assert.equal(m._nsmbw_mem_pages(),0);
 const c=createSyntheticTickClock(m);
 assert.equal(c.publishCpu(0,200n).written,true);
 assert.equal(m._nsmbw_services_time64_publish(0,0x80008000,0,100),0);
 assert.equal(m._nsmbw_services_time64_status(),10);
 assert.equal(m._nsmbw_mem_read32(0x80008000),200);
 assert.equal(m._nsmbw_services_time64_gpr(0,4),200);
 assert.throws(()=>c.publishCpu(0,100n),/TICK_REGRESSION/);
});
test('zero page quota: rollback BOTH guest RAM and CpuContext r3/r4 without callbacks',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 assert.equal(m._nsmbw_mem_set_page_budget(0),1);
 const r=c.publishCpu(1,0x100000009n);
 assert.deepEqual([r.written,r.status,r.reg3,r.reg4,c.ticks],[false,3,0,0,0n]);
 assert.equal(m._nsmbw_mem_pages(),0);
 assert.equal(m._nsmbw_interop_device_invoked(),0);
 assert.equal(m._nsmbw_mem_set_page_budget(1),1);
 assert.equal(c.publishCpu(1,0x100000009n).written,true);
 assert.deepEqual([m._nsmbw_services_time64_gpr(1,3),m._nsmbw_services_time64_gpr(1,4)],[1,9]);
});
test('MMIO/GX/invalid guest store fails with no register updates or device invocation',async()=>{
 for(const addr of [0xCC000000,0xCC008000,0x88000000,0x80008001,0xFFFFFFFF]){
  const m=await fresh();
  if((addr&3)!==0){
   assert.throws(()=>createSyntheticTickClock(m,{address:addr}),/INVALID_TICK_ADDRESS/);
   assert.equal(m._nsmbw_mem_pages(),0);
   continue;
  }
  const c=createSyntheticTickClock(m,{address:addr});
  const before=m._nsmbw_services_time64_gpr(2,4);
  const r=c.publishCpu(2,99n);
  assert.equal(r.written,false,'bad addr '+addr.toString(16));
  assert.equal(r.status,7);
  assert.equal(m._nsmbw_services_time64_gpr(2,4),before);
  assert.equal(m._nsmbw_interop_device_invoked(),0);
  assert.equal(m._nsmbw_mem_pages(),0);
 }
});
test('three CpuContext slots AND W03 guest tasks share checked lowword in one Wasm',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 for(let i=0;i<3;i++){
  const r=c.publishCpu(i,BigInt(0x100+i)*0x100000000n+BigInt(21+i));
  assert.equal(r.written,true);
  assert.deepEqual([r.reg3,r.reg4],[0x100+i,21+i]);
 }
 const last=m._nsmbw_mem_read32(0xC0008000);
 assert.equal(last,23);
 for(let i=0;i<3;i++)
  assert.equal(m._nsmbw_loop_cpu_spawn(i+1,0x80010000,
   0x80005010+i*0x1000,0xC0008000,0x80009000+i*0x1000,i),1);
 assert.equal(m._nsmbw_loop_frame(33),33);
 for(let i=0;i<3;i++){
  assert.equal(m._nsmbw_loop_state(i+1),3);
  assert.equal(m._nsmbw_mem_read32(0x80009000+i*0x1000),23+i);
  assert.equal(m._nsmbw_services_time64_gpr(i,3),0x100+i);
  assert.equal(m._nsmbw_services_time64_gpr(i,4),21+i);
 }
});
test('reset refuses live RAM and guest contexts; legitimate global reset clears native CpuContext',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 assert.equal(c.publishCpu(0,200n).written,true);
 assert.equal(m._nsmbw_services_time64_reset(),0);
 assert.equal(m._nsmbw_services_time64_status(),11);
 assert.throws(()=>c.reset(0n),/TICK_GUEST_EPOCH_NOT_RESET/);
 assert.equal(m._nsmbw_services_time64_gpr(0,4),200);
 m._nsmbw_loop_reset();
 c.reset(0n);
 assert.equal(m._nsmbw_services_time64_gpr(0,4),0);
 assert.equal(c.publishCpu(0,100n).written,true);
 assert.equal(m._nsmbw_services_tick_claim(),0,'native owner survives reset');
});
test('boundary ticks 64-bit maximum, invalid slot, overflow rejected BEFORE changes',async()=>{
 const m=await fresh(),c=createSyntheticTickClock(m);
 assert.throws(()=>c.publishCpu(-1,4n),/INVALID_CPU_SLOT/);
 assert.throws(()=>c.publishCpu(3,4n),/INVALID_CPU_SLOT/);
 assert.throws(()=>c.publishCpu(0,-1n),/INVALID_TICK/);
 const max=(1n<<64n)-1n;
 const r=c.publishCpu(2,max);
 assert.deepEqual([r.written,r.reg3,r.reg4],[true,0xFFFFFFFF,0xFFFFFFFF]);
 assert.throws(()=>c.advanceCpu(2,1n),/TICK_OVERFLOW/);
 assert.equal(m._nsmbw_mem_read32(0x80008000)>>>0,0xFFFFFFFF);
});
test('independent Wasm modules have independent native claimed clock/ABI state',async()=>{
 const a=await fresh(),b=await fresh();
 const ca=createSyntheticTickClock(a),cb=createSyntheticTickClock(b);
 assert.equal(ca.publishCpu(0,300n).written,true);
 assert.equal(cb.publishCpu(0,17n).written,true);
 assert.equal(a._nsmbw_services_time64_gpr(0,4),300);
 assert.equal(b._nsmbw_services_time64_gpr(0,4),17);
 assert.equal(b._nsmbw_mem_read32(0x80008000),17);
});
test('distinct structural facades cannot acquire a second owner and rewind high/low',async()=>{
 const m=await fresh();
 const exported=Object.keys(m).filter(k=>k.startsWith('_nsmbw_')&&typeof m[k]==='function');
 const wrap=()=>Object.fromEntries(exported.map(k=>[k,m[k].bind(m)]));
 const first=createSyntheticTickClock(wrap());
 assert.equal(first.publishCpu(0,0x1000000C8n).written,true);
 assert.throws(()=>createSyntheticTickClock(wrap(),{address:0xC0008000}),
 /TICK_CLOCK_ALREADY_OWNED/);
 assert.deepEqual([m._nsmbw_services_time64_gpr(0,3),m._nsmbw_services_time64_gpr(0,4)],[1,200]);
 assert.equal(m._nsmbw_mem_read32(0x80008000),200);
});
test('compiled Wasm exports typed synthetic 64-bit CpuContext and has no fixture mocks',async()=>{
 const wasmModule=await WebAssembly.compile(await readFile(wasm));
 const exports=WebAssembly.Module.exports(wasmModule).map(x=>x.name);
 for(const name of ['nsmbw_services_time64_publish','nsmbw_services_time64_status',
 'nsmbw_services_time64_gpr','nsmbw_services_time64_reset',
 'nsmbw_services_time64_context_bytes','nsmbw_services_tick_claim',
 'nsmbw_loop_cpu_spawn_abi','nsmbw_loop_cpu_abi_layout'])
 assert.ok(exports.includes(name),name);
 assert.ok(!exports.some(name=>/mock_device|test_policy_install|fixture_handler/.test(name)));
 assert.deepEqual(WebAssembly.Module.imports(wasmModule),
  [{module:'env',name:'emscripten_resize_heap',kind:'function'}]);
});
