import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import create from '../dist/frame_loop_translated_stb_fixture.mjs';
import {createFrameHost} from '../host.mjs';
const WASM=fileURLToPath(new URL('../dist/frame_loop_translated_stb_fixture.wasm',import.meta.url));
async function fresh(){
 const m=await create({locateFile:()=>WASM});
 const c=(n,...a)=>{const f=m['_nsmbw_'+n];assert.equal(typeof f,'function',n);return f(...a)};
 c('loop_reset');return {m,c};
}
const spawn=(c,id,dstA,dstB,payload=0xABCDEF12)=>
 c('loop_translated_store_spawn',id,0x80005010+id*0x1000,dstA,dstB,payload,0x81002000+id,0x81003000+id);
test('actual Translator.Cli STB edits exactly one big-endian byte, STW uses full 32-bit payload',async()=>{
 for(let offset=0;offset<4;offset++){
  const {c}=await fresh();
  assert.equal(c('mem_write32',0x80010000,0x11223344),1);
  const a=0x80010000+offset;
  assert.equal(spawn(c,1,offset%2?(a|0x40000000):a,0x80011000),1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_state',1),3);
  const masks=[0xFF000000,0x00FF0000,0x0000FF00,0x000000FF];
  const mask=masks[offset];
  const expect=(0x11223344&~mask)|((0x12<<(24-8*offset))>>>0);
  assert.equal(c('mem_read32',0xC0010000)>>>0,expect>>>0,'PPC big endian offset '+offset);
  assert.equal(c('mem_read8',a),0x12);
  assert.equal(c('mem_read32',0x80011000)>>>0,0xABCDEF12);
  assert.equal(c('loop_pc',1)>>>0,0x8001FFF0);
 }
});
test('truncation and zero are exact: upper three r3 bytes do not affect STB',async()=>{
 const {c}=await fresh();
 c('mem_write32',0x80010000,0xFFFFFFFF);
 assert.equal(spawn(c,1,0x80010002,0x80011000,0xF0A0B000),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('mem_read32',0x80010000)>>>0,0xFFFF00FF);
 assert.equal(c('mem_read32',0x80011000)>>>0,0xF0A0B000);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0xF0A0B000);
});
test('STB exactly on last byte of 4KiB page updates only that page',async()=>{
 const {c}=await fresh();
 c('mem_write32',0x80010FFC,0x11223344);
 assert.equal(spawn(c,1,0xC0010FFF,0x80011000,0x000000A5),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('mem_read32',0x80010FFC)>>>0,0x112233A5);
 assert.equal(c('mem_read32',0x80011000),0xA5);
 assert.equal(c('mem_pages'),2);
});
test('MMIO STB rejects before callback or page allocations',async()=>{
 const {c}=await fresh();
 assert.equal(spawn(c,1,0xCC008003,0x80011000),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('loop_guest_error',1),7);
 assert.equal(c('loop_pc',1)>>>0,0x80001000);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0xABCDEF12);
 assert.equal(c('interop_device_invoked'),0);
 assert.equal(c('mem_pages'),0);
 assert.equal(c('loop_retry_quota',1),0);
});
test('unmapped and overflow address STB fail closed; no guest memory touched',async()=>{
 for(const a of [0x88000001,0xFFFFFFFF,0x18000000,0x40000000]){
  const {c}=await fresh();
  assert.equal(spawn(c,1,a,0x80011000),1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_state',1),4);
  assert.equal(c('loop_pc',1)>>>0,0x80001000);
  assert.equal(c('mem_pages'),0);
 }
});
test('quota 0 denies two unallocated page writes with zero ghost pages',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_set_page_budget',0),1);
 assert.equal(spawn(c,1,0x80010003,0x80011000),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_guest_error',1),3);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('mem_pages'),0);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0xABCDEF12);
});
test('later instruction fails quota1 on second unallocated page: first staged byte rolled back',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_set_page_budget',1),1);
 assert.equal(spawn(c,1,0x80010003,0x80011000),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_guest_error',1),3);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('mem_pages'),0);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0xABCDEF12);
 assert.equal(c('loop_pc',1)>>>0,0x80001000);
 assert.equal(c('mem_read8',0x80010003),0);
 assert.equal(c('mem_read32',0x80011000),0);
});
test('existing first page and late second-page quota preserves all original bytes',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_write32',0x80010000,0x11223344),1);
 assert.equal(c('mem_set_page_budget',1),1);
 assert.equal(spawn(c,1,0x80010002,0x80011000),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_guest_error',1),3);
 assert.equal(c('mem_read32',0xC0010000)>>>0,0x11223344);
 assert.equal(c('mem_pages'),1);
 assert.equal(c('loop_pc',1)>>>0,0x80001000);
});
test('later MMIO STW error rolls back staged STB, no device callbacks',async()=>{
 const {c}=await fresh();
 c('mem_write32',0x80010000,0x55667788);
 assert.equal(spawn(c,1,0x80010001,0xCC008000),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('loop_guest_error',1),7);
 assert.equal(c('mem_read32',0x80010000)>>>0,0x55667788);
 assert.equal(c('interop_device_invoked'),0);
 assert.equal(c('loop_pc',1)>>>0,0x80001000);
});
test('overlapping STB and STW to same guest word: later STW wins, only one page',async()=>{
 const {c}=await fresh();
 c('mem_write32',0x80010000,0x12345678);
 assert.equal(spawn(c,1,0xC0010001,0x80010000,0xAABBCCDD),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('mem_read32',0x80010000)>>>0,0xAABBCCDD);
 assert.equal(c('mem_pages'),1);
});
test('3 contexts execute source-generated STB+STW with separate stacks and fair bounded host',async()=>{
 const {m,c}=await fresh();
 const words=[0,0xFFFFFFFF,0x1234AB56];
 for(let id=1;id<=3;id++){
  const base=0x80010000+id*0x2000;
  assert.equal(spawn(c,id,base+id-1,base+0x1000,words[id-1]),1);
 }
 const host=createFrameHost(m,{ids:[1,2,3],budget:2,maxFrames:4,
  requestFrame:cb=>setImmediate(cb),cancelFrame:h=>clearImmediate(h)});
 const result=await host.start();
 assert.equal(result.reason,'completed');
 assert.equal(result.frames,2);assert.equal(result.done,3);
 for(let id=1;id<=3;id++){
  const base=0x80010000+id*0x2000;
  assert.equal(c('mem_read8',base+id-1),words[id-1]&0xFF);
  assert.equal(c('mem_read32',base+0x1000)>>>0,words[id-1]>>>0);
 }
 host.dispose();
});
test('128 resets have no stale journal, page or register state',async()=>{
 const {c}=await fresh();
 for(let i=0;i<128;i++){
  c('loop_reset');
  assert.equal(c('mem_set_page_budget',2),1);
  assert.equal(spawn(c,1,0x80010003,0x80011000,i),1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_state',1),3);
  assert.equal(c('mem_read8',0x80010003),i&0xFF);
  assert.equal(c('mem_read32',0x80011000),i);
  assert.equal(c('loop_reap',1),1);
 }
 c('loop_reset');assert.equal(c('mem_pages'),0);
});
test('normal release and older generated fixture never expose test-only mutation control',async()=>{
 for(const name of ['frame_loop','frame_loop_translated_readwrite_fixture']){
  const f=(await import('../dist/'+name+'.mjs')).default;
  const module=await f({locateFile:()=>fileURLToPath(new URL('../dist/'+name+'.wasm',import.meta.url))});
  assert.equal(module._nsmbw_loop_translated_stb_spawn,undefined);
 }
});
