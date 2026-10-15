import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import create from '../dist/frame_loop_translated_readwrite_fixture.mjs';
import {createFrameHost} from '../host.mjs';
const WASM=fileURLToPath(new URL('../dist/frame_loop_translated_readwrite_fixture.wasm',import.meta.url));
async function fresh(){
 const m=await create({locateFile:()=>WASM});
 const c=(name,...args)=>{
  const f=m['_nsmbw_'+name];assert.equal(typeof f,'function',name);return f(...args);
 };c('loop_reset');return {m,c};
}
const spawn=(c,id,a,b,value=0x12345678,sp=0x80005010+id*0x1000)=>
 c('loop_translated_store_spawn',id,sp,a,b,value,0x81002000+id,0x81003000+id);
test('actual C# generated STW->LWZ forwards NEW staged word to r5, not old RAM',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_write32',0x80010000,0xDEADBEEF),1);
 assert.equal(spawn(c,1,0xC0010000,0x80011000,0x01020304),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('loop_cpu_gpr',1,5)>>>0,0x01020304);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0x01020304);
 assert.equal(c('mem_read32',0x80010000)>>>0,0x01020304);
 assert.equal(c('mem_read32',0xC0011000)>>>0,0x01020304);
 assert.deepEqual([0,1,2,3].map(i=>c('mem_read8',0x80010000+i)),[1,2,3,4]);
 assert.equal(c('loop_pc',1)>>>0,0x8001FFF0);
});
test('zero-value overwrite forwards zero, cached/uncached aliases coalesce',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_write32',0x80010000,0xFFFFFFFF),1);
 assert.equal(spawn(c,1,0x80010000,0xC0010000,0),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('loop_cpu_gpr',1,5),0);
 assert.equal(c('mem_read32',0x80010000),0);
 assert.equal(c('mem_pages'),1);
});
test('late denied MMIO second store MUST rollback forwarded r5, PC, original RAM and callbacks',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_write32',0x80010000,0xCAFEBABE),1);
 assert.equal(spawn(c,1,0x80010000,0xCC008000,0x01020304),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('loop_guest_error',1),7);
 assert.equal(c('loop_pc',1)>>>0,0x80001000);
 assert.equal(c('loop_cpu_gpr',1,5),0,'forwarded value MUST not escape failed transaction');
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0x01020304);
 assert.equal(c('mem_read32',0xC0010000)>>>0,0xCAFEBABE);
 assert.equal(c('interop_device_invoked'),0);
 assert.equal(c('loop_retry_quota',1),0);
});
test('quota0 rejects first staged store, no ghost page and unchanged r5',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_set_page_budget',0),1);
 assert.equal(spawn(c,1,0x80010000,0x80011000,0xABCDEF00),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('loop_guest_error',1),3);
 assert.equal(c('loop_cpu_gpr',1,5),0);
 assert.equal(c('loop_pc',1)>>>0,0x80001000);
 assert.equal(c('mem_pages'),0);
});
test('late second page quota failure rolls back staged read result and both new page allocations',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_set_page_budget',1),1);
 assert.equal(spawn(c,1,0x80010000,0x80011000,0xAABBCCDD),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('loop_guest_error',1),3);
 assert.equal(c('loop_cpu_gpr',1,5),0);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0xAABBCCDD);
 assert.equal(c('loop_pc',1)>>>0,0x80001000);
 assert.equal(c('mem_pages'),0);
 assert.equal(c('mem_read32',0x80010000),0);
 assert.equal(c('mem_read32',0x80011000),0);
 assert.equal(c('loop_retry_quota',1),0);
 assert.equal(c('mem_write32',0x80012000,7),1,'no blank ghost page used quota');
 assert.equal(c('mem_pages'),1);
});
test('late quota with existing first word preserves original even after forwarded load',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_write32',0x80010000,0xFFAA0001),1);
 assert.equal(c('mem_set_page_budget',1),1);
 assert.equal(spawn(c,1,0x80010000,0x80011000,0x7F00AA10),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('mem_read32',0x80010000)>>>0,0xFFAA0001);
 assert.equal(c('loop_cpu_gpr',1,5),0);
 assert.equal(c('mem_pages'),1);
});
test('3 contexts source-generated STW/LWZ/STW isolate per context and bounded frame scheduler',async()=>{
 const {m,c}=await fresh();
 const words=[0xFFFFFFFF,0x13572468,0];
 for(let id=1;id<=3;id++){
  const addr=0x80010000+id*0x2000;
  assert.equal(spawn(c,id,id===2?(addr|0x40000000):addr,addr+0x1000,words[id-1]),1);
 }
 const host=createFrameHost(m,{ids:[1,2,3],budget:2,maxFrames:4,
  requestFrame:cb=>setImmediate(cb),cancelFrame:h=>clearImmediate(h)});
 const result=await host.start();
 assert.equal(result.reason,'completed');
 assert.equal(result.frames,2);
 assert.equal(result.done,3);
 for(let id=1;id<=3;id++){
  const addr=0x80010000+id*0x2000;
  assert.equal(c('loop_cpu_gpr',id,5)>>>0,words[id-1]);
  assert.equal(c('mem_read32',addr)>>>0,words[id-1]);
  assert.equal(c('mem_read32',addr+0x1000)>>>0,words[id-1]);
 }
 host.dispose();
});
test('128 full resets reclaim pages/registers and maintain transaction isolation',async()=>{
 const {c}=await fresh();
 for(let i=0;i<128;i++){
  c('loop_reset');
  assert.equal(c('mem_set_page_budget',2),1);
  assert.equal(spawn(c,1,0x80010000,0x80011000,i),1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_cpu_gpr',1,5),i);
  assert.equal(c('mem_read32',0x80011000),i);
  assert.equal(c('loop_reap',1),1);
  assert.equal(c('loop_cpu_gpr',1,5),0);
 }
 c('loop_reset');
 assert.equal(c('mem_pages'),0);
});
test('normal/module older fixture does not export new transactional code accidentally',async()=>{
 for(const name of ['frame_loop','frame_loop_translated_fixture','frame_loop_translated_load_fixture']){
  const f=(await import('../dist/'+name+'.mjs')).default;
  const wasm=await f({locateFile:()=>fileURLToPath(new URL('../dist/'+name+'.wasm',import.meta.url))});
  assert.equal(wasm._nsmbw_loop_translated_store_spawn,undefined,name);
 }
});
