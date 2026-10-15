import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import create from '../dist/frame_loop_translated_load_fixture.mjs';
import {createFrameHost} from '../host.mjs';
const file=fileURLToPath(new URL('../dist/frame_loop_translated_load_fixture.wasm',import.meta.url));
async function fresh(){
 const m=await create({locateFile:()=>file});
 const c=(name,...args)=>{
  const fn=m['_nsmbw_'+name];assert.equal(typeof fn,'function',name);return fn(...args);
 };
 c('loop_reset');return {m,c};
}
const spawn=(c,id,guest)=>c('loop_translated_load_spawn',id,
  0x80004010+id*0x1000,guest,0x81002000+id,0x81003000+id);
test('REAL generated lwz r3,0(r4) reads checked big-endian cached/uncached guest RAM',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_write32',0x80004000,0x12345678),1);
 assert.equal(spawn(c,1,0xC0004000),1);
 assert.equal(c('loop_pc',1)>>>0,0x80001000);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0xDEADBEEF);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0x12345678);
 assert.equal(c('loop_pc',1)>>>0,0x8001FFF0);
 assert.equal(c('loop_cpu_gpr',1,2)>>>0,0x81002001);
 assert.equal(c('mem_read8',0x80004000),0x12);
});
test('REAL generated lwz denied MMIO/unmapped preserves guest PC and r3 on failure',async()=>{
 for(const [addr,expected] of [[0xCC008000,4],[0x88000000,1]]){
  const {c}=await fresh();
  assert.equal(spawn(c,1,addr),1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_state',1),4);
  assert.equal(c('loop_guest_error',1),expected,'typed source W07 fault');
  assert.equal(c('loop_pc',1)>>>0,0x80001000,'no guest PC commitment');
  assert.equal(c('loop_cpu_gpr',1,3)>>>0,0xDEADBEEF,
   'failed translator output must not overwrite original GPR3');
  assert.equal(c('loop_retry_quota',1),0);
 }
});
test('three real generated lwz calls fair and bounded in one Emscripten guest host',async()=>{
 const {m,c}=await fresh();
 const words=[0xABCDEF01,0x01020304,0xFFFFFFFF];
 for(let id=1;id<=3;id++){
  const addr=0x80010000+id*0x1000;
  assert.equal(c('mem_write32',addr,words[id-1]),1);
  assert.equal(spawn(c,id,id===2?(addr|0x40000000):addr),1);
 }
 const host=createFrameHost(m,{ids:[1,2,3],budget:2,maxFrames:3,
  requestFrame:cb=>setImmediate(cb),cancelFrame:h=>clearImmediate(h)});
 const end=await host.start();
 assert.equal(end.reason,'completed');
 assert.equal(end.frames,2);
 assert.equal(end.done,3);
 for(let id=1;id<=3;id++){
  assert.equal(c('loop_cpu_gpr',id,3)>>>0,words[id-1]);
  assert.equal(c('loop_cpu_steps',id),1);
 }
 host.dispose();
});
test('synthetic real lwz abort never creates ghost memory pages, 128 resets',async()=>{
 const {c}=await fresh();
 for(let i=0;i<128;i++){
  c('loop_reset');
  const value=(i*0x01010101)>>>0;
  assert.equal(c('mem_write32',0x80004000,value),1);
  assert.equal(spawn(c,1,0x80004000),1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_cpu_gpr',1,3)>>>0,value);
  assert.equal(c('loop_reap',1),1);
  assert.equal(c('loop_state',1),0);
 }
 c('loop_reset');
 assert.equal(c('mem_pages'),0);
});
