import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import create from '../dist/frame_loop_translated_sth_fixture.mjs';
import {createFrameHost} from '../host.mjs';
const W=fileURLToPath(new URL('../dist/frame_loop_translated_sth_fixture.wasm',import.meta.url));
async function fresh(){
 const m=await create({locateFile:()=>W});
 const c=(n,...a)=>{const f=m['_nsmbw_'+n];assert.equal(typeof f,'function',n);return f(...a)};
 c('loop_reset');return {m,c};
}
const spawn=(c,id,a,b,v=0x1234BEEF)=>
 c('loop_translated_store_spawn',id,0x80005010+id*0x1000,a,b,v,0x81002000+id,0x81003000+id);
test('genuine Translator.Cli STH matches big-endian high and low halfword, aliases',async()=>{
 for(const offset of [0,2]){
  const {c}=await fresh();
  assert.equal(c('mem_write32',0x80010000,0x11223344),1);
  assert.equal(spawn(c,1,(0x80010000+offset)|0x40000000,0x80011000),1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_state',1),3);
  assert.equal(c('mem_read32',0x80010000)>>>0,offset===0?0xBEEF3344:0x1122BEEF);
  assert.equal(c('mem_read16',0x80010000+offset),0xBEEF);
  assert.equal(c('mem_read32',0xC0011000)>>>0,0x1234BEEF);
  assert.equal(c('loop_pc',1)>>>0,0x8001FFF0);
 }
});
test('STH truncates 32-bit input, zero and max halfword work exactly',async()=>{
 const {c}=await fresh();
 c('mem_write32',0x80010000,0x12345678);
 assert.equal(spawn(c,1,0x80010000,0x80011000,0xABCD0000),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('mem_read32',0x80010000)>>>0,0x00005678);
 c('loop_reset');
 assert.equal(spawn(c,1,0x80010002,0x80011000,0xFFFFFFFF),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('mem_read32',0x80010000)>>>0,0x0000FFFF);
});
test('unaligned halfword at byte offsets 1 and 3 fails BEFORE reading or callbacks',async()=>{
 for(const offset of [1,3]){
  const {c}=await fresh();
  assert.equal(spawn(c,1,0x80010000+offset,0x80011000),1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_state',1),4);
  assert.equal(c('loop_guest_error',1),7);
  assert.equal(c('mem_pages'),0);
  assert.equal(c('interop_device_invoked'),0);
  assert.equal(c('loop_pc',1)>>>0,0x80001000);
  assert.equal(c('loop_cpu_gpr',1,3)>>>0,0x1234BEEF);
 }
});
test('last aligned halfword in 4KiB page is checked (no cross-page overrun)',async()=>{
 const {c}=await fresh();
 c('mem_write32',0x80010FFC,0x11223344);
 assert.equal(spawn(c,1,0xC0010FFE,0x80011000,0xAABBCCDD),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('mem_read32',0x80010FFC)>>>0,0x1122CCDD);
 assert.equal(c('mem_read32',0x80011000)>>>0,0xAABBCCDD);
 assert.equal(c('mem_pages'),2);
});
test('last aligned halfword in physical MEM1 remains in-range, beyond edge rejects',async()=>{
 const {c}=await fresh();
 assert.equal(spawn(c,1,0x817FFFFE,0x90010000,0x0000BEEF),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('mem_read16',0x817FFFFE),0xBEEF);
 c('loop_reset');
 assert.equal(spawn(c,1,0x81800000,0x80011000),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_guest_error',1),7);
 assert.equal(c('mem_pages'),0);
});
test('invalid/MMIO/GX STH fails closed, typed callbacks never called',async()=>{
 for(const addr of [0xCC008000,0xCC008002,0x88000000,0xFFFFFFFF,0x40000000]){
  const {c}=await fresh();
  assert.equal(spawn(c,1,addr,0x80011000),1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_state',1),4);
  assert.equal(c('loop_guest_error',1),7);
  assert.equal(c('interop_device_invoked'),0);
  assert.equal(c('mem_pages'),0);
 }
});
test('zero quota after translated STH staging leaves no pages or CPU mutations',async()=>{
 const {c}=await fresh();
 c('mem_set_page_budget',0);
 assert.equal(spawn(c,1,0x80010002,0x80011000),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_guest_error',1),3);
 assert.equal(c('mem_pages'),0);
 assert.equal(c('loop_pc',1)>>>0,0x80001000);
});
test('quota1 later STW failure rolls back STH and no ghost pages',async()=>{
 const {c}=await fresh();
 c('mem_set_page_budget',1);
 assert.equal(spawn(c,1,0x80010002,0x80011000),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_guest_error',1),3);
 assert.equal(c('mem_pages'),0);
 assert.equal(c('mem_read16',0x80010002),0);
 assert.equal(c('loop_pc',1)>>>0,0x80001000);
 assert.equal(c('loop_retry_quota',1),0);
});
test('second page allocation failure retains original STH word and registers',async()=>{
 const {c}=await fresh();
 c('mem_write32',0x80010000,0x11223344);
 c('mem_set_page_budget',1);
 assert.equal(spawn(c,1,0x80010002,0x80011000),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_guest_error',1),3);
 assert.equal(c('mem_read32',0x80010000)>>>0,0x11223344);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0x1234BEEF);
 assert.equal(c('mem_pages'),1);
});
test('late MMIO STW failure rolls back first staged STH without handler',async()=>{
 const {c}=await fresh();
 c('mem_write32',0x80010000,0x11223344);
 assert.equal(spawn(c,1,0x80010002,0xCC008000),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_guest_error',1),7);
 assert.equal(c('mem_read32',0x80010000)>>>0,0x11223344);
 assert.equal(c('loop_pc',1)>>>0,0x80001000);
 assert.equal(c('interop_device_invoked'),0);
});
test('later STW overlapping STH same physical word wins with quota1',async()=>{
 const {c}=await fresh();
 c('mem_set_page_budget',1);
 assert.equal(spawn(c,1,0x80010002,0xC0010000,0xFEEDABCD),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('mem_pages'),1);
 assert.equal(c('mem_read32',0x80010000)>>>0,0xFEEDABCD);
});
test('three generated STH contexts retain bounded schedule and endian results',async()=>{
 const {c,m}=await fresh();
 const v=[0x12345678,0,0xFFFFFFFF];
 for(let id=1;id<=3;id++){
  const a=0x80010000+id*0x2000;
  assert.equal(spawn(c,id,a+2,a+0x1000,v[id-1]),1);
 }
 const host=createFrameHost(m,{ids:[1,2,3],budget:2,maxFrames:4,
  requestFrame:cb=>setImmediate(cb),cancelFrame:handle=>clearImmediate(handle)});
 const out=await host.start();
 assert.equal(out.reason,'completed');assert.equal(out.frames,2);
 for(let id=1;id<=3;id++){
  const a=0x80010000+id*0x2000;
  assert.equal(c('mem_read16',a+2),v[id-1]&0xFFFF);
  assert.equal(c('mem_read32',a+0x1000)>>>0,v[id-1]>>>0);
 }
 host.dispose();
});
test('128 resets clear journal, typed fault and page state',async()=>{
 const {c}=await fresh();
 for(let i=0;i<128;i++){
  c('loop_reset');
  c('mem_set_page_budget',2);
  assert.equal(spawn(c,1,0x80010002,0x80011000,i),1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_state',1),3);
  assert.equal(c('mem_read16',0x80010002),i);
  assert.equal(c('mem_read32',0x80011000),i);
  assert.equal(c('loop_reap',1),1);
 }
 c('loop_reset');assert.equal(c('mem_pages'),0);
});
test('normal release does not export test-only synthetic STH translator dispatcher',async()=>{
 const f=(await import('../dist/frame_loop.mjs')).default;
 const mod=await f({locateFile:()=>fileURLToPath(new URL('../dist/frame_loop.wasm',import.meta.url))});
 assert.equal(mod._nsmbw_loop_translated_store_spawn,undefined);
});
