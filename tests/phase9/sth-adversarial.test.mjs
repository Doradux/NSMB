// Peach P9: independently execute PUBLIC C#-generated STH/STW C++/Wasm.
// No copyrighted Nintendo guest code or original executable.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.NSMB_PHASE9_STH_ROOT||process.cwd(),'web-runtime/frame-host');
const cpp=resolve(root,'translator-fixture/out/sth_fixture/generated_functions/func_80001000.cpp');
const wasm=resolve(root,'dist/frame_loop_translated_sth_fixture.wasm');
const js=resolve(root,'dist/frame_loop_translated_sth_fixture.mjs');
async function fresh(){
 const cxx=readFileSync(cpp,'utf8');
 assert.match(cxx,/extern "C" void func_80001000\(CpuContext\* MKW_RESTRICT ctx\)/);
 const first=cxx.indexOf('MemoryInline::FlatWrite16(');
 const second=cxx.indexOf('MemoryInline::FlatWrite32(');
 assert.ok(first>=0&&second>first,'require real generated STH before STW');
 assert.equal(readFileSync(wasm).subarray(0,4).toString('hex'),'0061736d');
 const m=await (await import(pathToFileURL(js).href)).default({locateFile:()=>wasm});
 const c=(name,...args)=>{const f=m['_nsmbw_'+name];assert.equal(typeof f,'function',name);return f(...args)};
 c('loop_reset');return {c,m};
}
const spawn=(c,id,a,b,v)=>c('loop_translated_store_spawn',id,
 0x80020010+id*0x1000,a,b,v,0x81002000+id,0x81003000+id);
test('STH cached/uncached MEM2 lower-halfword and separate MEM1 STW preserve big-endian',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_write32',0x90010000,0x12345678),1);
 const v=0xDEADBEEF;
 assert.equal(spawn(c,1,0xD0010002,0x80011000,v),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('mem_read32',0x90010000)>>>0,0x1234BEEF);
 assert.equal(c('mem_read32',0x80011000)>>>0,v);
 assert.deepEqual([0,1,2,3].map(i=>c('mem_read8',0x90010000+i)),[0x12,0x34,0xBE,0xEF]);
 assert.equal(c('mem_pages'),2);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,v);
});
test('last valid MEM1 halfword + separate MEM2 write and fault atomic PC',async()=>{
 const {c}=await fresh(),v=0xCAFE0077;
 assert.equal(spawn(c,1,0xC17FFFFE,0x90011000,v),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('mem_read32',0x817FFFFC)>>>0,0x00000077);
 assert.equal(c('mem_read32',0x90011000)>>>0,v);
 assert.equal(c('loop_pc',1)>>>0,0x8001FFF0);
 assert.equal(c('mem_pages'),2);
});
test('late MMIO STW refuses even when earlier STH targeted physical MEM1 last halfword',async()=>{
 const {c}=await fresh(),v=0x98ABCD34;
 assert.equal(c('mem_write32',0x817FFFFC,0xAABBCCDD),1);
 assert.equal(spawn(c,2,0xC17FFFFE,0xCC008000,v),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',2),4);
 assert.equal(c('loop_guest_error',2),7);
 assert.equal(c('loop_pc',2)>>>0,0x80001000);
 assert.equal(c('loop_cpu_gpr',2,3)>>>0,v);
 assert.equal(c('mem_read32',0x817FFFFC)>>>0,0xAABBCCDD);
 assert.equal(c('interop_device_invoked'),0);
 assert.equal(c('mem_pages'),1);
});
test('same never-allocated sparse page alias STH then STW needs only quota1',async()=>{
 const {c}=await fresh(),v=0xFADE1234;
 assert.equal(c('mem_set_page_budget',1),1);
 assert.equal(spawn(c,3,0xC0010002,0x80010000,v),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',3),3);
 assert.equal(c('mem_read32',0x80010000)>>>0,v);
 assert.equal(c('mem_pages'),1);
 assert.equal(c('loop_guest_error',3),0);
});
