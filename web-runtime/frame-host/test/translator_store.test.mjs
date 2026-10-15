import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import factory from '../dist/frame_loop_translated_store_fixture.mjs';
import {createFrameHost} from '../host.mjs';
const file=fileURLToPath(new URL('../dist/frame_loop_translated_store_fixture.wasm',import.meta.url));
const ENTRY=0x80001000,EXIT=0x8001FFF0;
async function fresh(){
 const m=await factory({locateFile:()=>file});
 const c=(n,...args)=>{
   const fn=m['_nsmbw_'+n];
   assert.equal(typeof fn,'function','missing actual Wasm export '+n);
   return fn(...args);
 };
 c('loop_reset');return {m,c};
}
const spawn=(c,id,a,b,value=0x12345678,sp=0x80005010+id*0x1000)=>
 c('loop_translated_store_spawn',id,sp,a,b,value,0x81002000+id,0x81003000+id);
test('real Translator.Cli STW + BL(inlined) + BLR writes big endian to two W04 RAM words',async()=>{
 const {c}=await fresh();
 assert.equal(spawn(c,1,0x80010000,0xC0011000),1);
 assert.equal(c('loop_pc',1)>>>0,ENTRY);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('loop_pc',1)>>>0,EXIT);
 assert.equal(c('loop_cpu_steps',1),1,'one atomic C++ translated function invocation');
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0x12345679,
    'C# translator inlines public branch-link helper increment');
 assert.equal(c('loop_cpu_gpr',1,2)>>>0,0x81002001);
 assert.equal(c('loop_cpu_gpr',1,13)>>>0,0x81003001);
 assert.equal(c('mem_read32',0xC0010000)>>>0,0x12345678);
 assert.equal(c('mem_read32',0x80011000)>>>0,0x12345678);
 assert.deepEqual([0,1,2,3].map(i=>c('mem_read8',0x80010000+i)),[0x12,0x34,0x56,0x78]);
});
test('MEM1 cached/uncached same physical word coalesces two staged writes',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_write32',0x80009000,0xAABBCCDD),1);
 assert.equal(spawn(c,1,0x80009000,0xC0009000,0x01020304),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('mem_read32',0xC0009000)>>>0,0x01020304);
 assert.equal(c('mem_pages'),1);
});
test('MMIO second destination denied BEFORE first RAM store; no callbacks, PC or register commit',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_write32',0x80010000,0xDEC0ADDE),1);
 assert.equal(spawn(c,1,0x80010000,0xCC008000,42),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('loop_guest_error',1),7,'transaction disallows device and MMIO outright');
 assert.equal(c('loop_pc',1)>>>0,ENTRY);
 assert.equal(c('loop_cpu_gpr',1,3),42);
 assert.equal(c('mem_read32',0xC0010000)>>>0,0xDEC0ADDE);
 assert.equal(c('mem_pages'),1);
 assert.equal(c('interop_device_invoked'),0);
 assert.equal(c('loop_retry_quota',1),0);
});
test('budget ZERO: generated C++ first stw failure never creates ghost pages or changes registers',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_set_page_budget',0),1);
 assert.equal(spawn(c,1,0x80010000,0x80011000,7),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('loop_guest_error',1),3);
 assert.equal(c('loop_pc',1)>>>0,ENTRY);
 assert.equal(c('loop_cpu_gpr',1,3),7);
 assert.equal(c('mem_pages'),0);
 assert.equal(c('mem_read32',0x80010000),0);
 assert.equal(c('mem_read32',0x80011000),0);
 assert.equal(c('loop_retry_quota',1),0,'write path abort conservatively after quota');
});
test('late quota fault after FIRST successful committed guest store rolls it back exactly',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_write32',0x80010000,0xDEADBEEF),1);
 assert.equal(c('mem_pages'),1);
 assert.equal(c('mem_set_page_budget',1),1);
 assert.equal(spawn(c,1,0x80010000,0x80011000,0x12345678),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),4,'second W07 write quota failure');
 assert.equal(c('loop_guest_error',1),3);
 assert.equal(c('loop_pc',1)>>>0,ENTRY);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0x12345678,'helper increment never committed');
 assert.equal(c('loop_cpu_gpr',1,4)>>>0,0x80010000);
 assert.equal(c('loop_cpu_gpr',1,6)>>>0,0x80011000);
 assert.equal(c('mem_read32',0xC0010000)>>>0,0xDEADBEEF,
  'first write must undo after later failure');
 assert.equal(c('mem_read32',0x80011000),0);
 assert.equal(c('mem_pages'),1);
 assert.equal(c('interop_device_invoked'),0);
 assert.equal(c('loop_retry_quota',1),0,'post-write faults are not auto replayable');
 assert.equal(c('mem_set_page_budget',2),1);
 assert.equal(c('loop_reap',1),1);
 assert.equal(spawn(c,1,0x80010000,0x80011000,5),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('mem_read32',0x80010000),5);
 assert.equal(c('mem_read32',0x80011000),5);
});
test('three real translated guest contexts, aliases, bounded host frames, strict independent words',async()=>{
 const {m,c}=await fresh();
 const vals=[0x12345678,0xFFFFFFFF,0];
 for(let id=1;id<=3;id++){
  const a=0x80010000+id*0x2000,b=a+0x1000;
  assert.equal(spawn(c,id,id===2?(a|0x40000000):a,b,vals[id-1]),1);
 }
 const host=createFrameHost(m,{ids:[1,2,3],budget:2,maxFrames:3,
   requestFrame:cb=>setImmediate(cb),cancelFrame:h=>clearImmediate(h)});
 const done=await host.start();
 assert.equal(done.reason,'completed');
 assert.equal(done.frames,2);
 assert.equal(done.done,3);
 for(let id=1;id<=3;id++){
  const a=0x80010000+id*0x2000;
  assert.equal(c('mem_read32',a)>>>0,vals[id-1]);
  assert.equal(c('mem_read32',a+0x1000)>>>0,vals[id-1]);
  assert.equal(c('loop_cpu_gpr',id,3)>>>0,(vals[id-1]+1)>>>0);
 }
 host.dispose();
});
test('conflicting live context guest RAM output reservations and stack deny before writes',async()=>{
 const {c}=await fresh();
 assert.equal(spawn(c,1,0x80010000,0x80011000,3),1);
 assert.equal(spawn(c,2,0xC0010000,0x80013000,7),0);
 assert.equal(c('loop_state',2),0);
 assert.equal(spawn(c,2,0x80017000,0x80016000,7,0x80016010),0,
   'store would hit second guest stack');
 assert.equal(c('mem_pages'),0);
});
test('128 real translated STW+call resets clear all guest RAM pages and CPU state',async()=>{
 const {c}=await fresh();
 for(let i=0;i<128;i++){
  c('loop_reset');
  const src=i>>>0;
  assert.equal(spawn(c,1,0x80010000,0xC0011000,src),1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_cpu_gpr',1,3),src+1);
  assert.equal(c('mem_read32',0x80010000),src);
  assert.equal(c('mem_read32',0x80011000),src);
  assert.equal(c('loop_reap',1),1);
  assert.equal(c('loop_state',1),0);
 }
 c('loop_reset');
 assert.equal(c('mem_pages'),0);
});
test('regular and previous translated fixtures contain NO new phase6 store dispatcher',async()=>{
 for(const name of ['frame_loop','frame_loop_translated_fixture','frame_loop_translated_load_fixture']){
  const fileName=name+'.mjs';
  const create=(await import('../dist/'+fileName)).default;
  const wasm=await create({locateFile:()=>fileURLToPath(new URL('../dist/'+name+'.wasm',import.meta.url))});
  assert.equal(typeof wasm._nsmbw_loop_translated_store_spawn,'undefined',name);
 }
});
