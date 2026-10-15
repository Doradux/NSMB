import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import create from '../dist/frame_loop_translated_fixture.mjs';
import {createFrameHost} from '../host.mjs';
const wasmPath=fileURLToPath(new URL('../dist/frame_loop_translated_fixture.wasm',import.meta.url));
const ENTRY=0x80001000,EXIT=0x8001FFF0;
async function fresh(){
 const wasm=await create({locateFile:()=>wasmPath});
 const c=(name,...args)=>{
   const fn=wasm['_nsmbw_'+name];
   assert.equal(typeof fn,'function','Missing translated ABI fixture export '+name);
   return fn(...args);
 };
 c('loop_reset');return {wasm,c};
}
const spawn=(c,id,initial)=>c('loop_translated_spawn',id,0x80004010+id*0x1000,
  initial,0x81002000+id,0x81003000+id);
test('actual C# translator two-op source executes through Emscripten CpuContext* ABI',async()=>{
 const {c}=await fresh();
 assert.equal(c('loop_cpu_abi_layout',0),464);
 assert.equal(spawn(c,1,0x7FFFFFFF),1);
 assert.equal(c('loop_pc',1)>>>0,ENTRY);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0x7FFFFFFF);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('loop_pc',1)>>>0,EXIT);
 assert.equal(c('loop_cpu_steps',1),1,'ONE translated C++ function call covering two PPC instructions');
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0x80000000);
 assert.equal(c('loop_cpu_gpr',1,2)>>>0,0x81002001);
 assert.equal(c('loop_cpu_gpr',1,13)>>>0,0x81003001);
 assert.equal(c('loop_cpu_lr',1)>>>0,EXIT);
 assert.equal(c('loop_cpu_gpr',1,1)>>>0,0x80005010);
 assert.equal(c('mem_pages'),0,'the source has no load/store or MMIO calls');
});
test('three real translated fixture invocations round-robin, separate CpuContext allocations',async()=>{
 const {c,wasm}=await fresh();
 const starts=[0,7,0xFFFFFFFF];
 for(let id=1;id<=3;id++)assert.equal(spawn(c,id,starts[id-1]),1);
 const host=createFrameHost(wasm,{ids:[1,2,3],budget:2,maxFrames:5,
   requestFrame:f=>setImmediate(f),cancelFrame:f=>clearImmediate(f)});
 const finished=await host.start();
 assert.equal(finished.reason,'completed');
 assert.equal(finished.frames,2);
 assert.equal(finished.done,3);
 assert.equal(finished.faulted,0);
 for(let id=1;id<=3;id++){
   assert.equal(c('loop_cpu_gpr',id,3)>>>0,((starts[id-1]+1)>>>0));
   assert.equal(c('loop_pc',id)>>>0,EXIT);
   assert.equal(c('loop_cpu_gpr',id,2)>>>0,0x81002000+id);
   assert.equal(c('loop_cpu_gpr',id,13)>>>0,0x81003000+id);
 }
 assert.deepEqual(Array.from({length:c('loop_trace_length')},(_,n)=>c('loop_trace_at',n)>>>16),
   [1,2,3]);
 host.dispose();
});
test('translator fixture cannot create context with unaligned or MMIO guest stack',async()=>{
 const {c}=await fresh();
 for(const stack of [0,0x80005004,0xCC008010]){
   assert.equal(c('loop_translated_spawn',1,stack,1,0,0),0);
   assert.equal(c('loop_state',1),0);
   assert.equal(c('mem_pages'),0);
 }
});
test('128 resets using actual translated C++ never keep prior guest function return',async()=>{
 const {c}=await fresh();
 for(let cycle=0;cycle<128;cycle++){
   c('loop_reset');
   assert.equal(c('loop_state',1),0);
   assert.equal(spawn(c,1,cycle),1);
   assert.equal(c('loop_frame',1),1);
   assert.equal(c('loop_cpu_gpr',1,3),cycle+1);
   assert.equal(c('loop_reap',1),1);
   assert.equal(c('loop_cpu_gpr',1,3),0);
 }
 c('loop_reset');
 assert.equal(c('mem_pages'),0);
 assert.equal(c('loop_trace_length'),0);
});
test('normal Wasm builds contain no original-translator test-only spawn ABI',async()=>{
 const regular=(await import('../dist/frame_loop.mjs')).default;
 const instance=await regular({locateFile:()=>fileURLToPath(new URL('../dist/frame_loop.wasm',import.meta.url))});
 assert.equal(typeof instance._nsmbw_loop_translated_spawn,'undefined',
   'test synthetic real-translator generated fixture must never enter normal Wasm');
 assert.equal(typeof instance._nsmbw_test_policy_install,'undefined',
   'normal browser runtime cannot register synthetic MMIO callbacks');
});
