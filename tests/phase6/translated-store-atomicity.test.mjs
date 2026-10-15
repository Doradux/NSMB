// Peach independent Phase6: C# Translator.Cli-generated STW/BL/BLR -> Emscripten.
// Copyright-free tiny synthetic DOL only; no original Nintendo code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.NSMB_PHASE6_STW_ROOT||process.cwd(),'web-runtime/frame-host');
const cpp=resolve(root,'translator-fixture/out/store_fixture/generated_functions/func_80001000.cpp');
const js=resolve(root,'dist/frame_loop_translated_store_fixture.mjs');
const wasmFile=resolve(root,'dist/frame_loop_translated_store_fixture.wasm');
async function create(){
 for(const path of [cpp,js,wasmFile])assert.ok(existsSync(path),'actual generated C++/Wasm source required: '+path);
 const source=readFileSync(cpp,'utf8');
 assert.match(source,/extern "C" void func_80001000\(CpuContext\* MKW_RESTRICT ctx\)/,
  'actual upstream translator C++ output required');
 assert.match(source,/FlatWrite32/,'real generated guest STW, not JS arithmetic');
 assert.equal(readFileSync(wasmFile).subarray(0,4).toString('hex'),'0061736d');
 const m=await (await import(pathToFileURL(js).href)).default({locateFile:()=>wasmFile});
 const c=(symbol,...args)=>{
   assert.equal(typeof m['_nsmbw_'+symbol],'function','missing compiled C++ symbol '+symbol);
   return m['_nsmbw_'+symbol](...args);
 };
 c('loop_reset');return {m,c};
}
const PC=0x80001000, EXIT=0x8001fff0;
const spawn=(c,id,a,b,v=0x12345678,sp=0x80020010+id*0x1000)=>
 c('loop_translated_store_spawn',id,sp,a,b,v,0x81002000+id,0x81003000+id);
test('actual translated two-STW + branch writes big-endian and merges cached/uncached aliases',async()=>{
 const {m,c}=await create();
 assert.equal(spawn(c,1,0x80010000,0xC0010000,0xFEDCBA98),1);
 assert.equal(c('loop_pc',1)>>>0,PC);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('loop_pc',1)>>>0,EXIT);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0xFEDCBA99);
 assert.equal(c('loop_cpu_gpr',1,2)>>>0,0x81002001);
 assert.equal(c('loop_cpu_gpr',1,13)>>>0,0x81003001);
 assert.equal(c('mem_read32',0xC0010000)>>>0,0xFEDCBA98);
 assert.deepEqual([0,1,2,3].map(i=>c('mem_read8',0x80010000+i)),[0xFE,0xDC,0xBA,0x98]);
 assert.equal(c('mem_pages'),1,'two physical aliases must stage ONE RAM write/page');
 assert.equal(typeof m._nsmbw_test_policy_install,'undefined','actual translated STW must not activate fake devices');
});
test('late quota failure after first checked RAM store restores exact old word, pages and CPU state',async()=>{
 const {c}=await create();
 assert.equal(c('mem_write32',0x80010000,0xBEADCAFE),1);
 assert.equal(c('mem_pages'),1);
 assert.equal(c('mem_set_page_budget',1),1);
 assert.equal(spawn(c,7,0xC0010000,0x80011000,0x89ABCDEF),1);
 const pc=c('loop_pc',7),r3=c('loop_cpu_gpr',7,3),sp=c('loop_cpu_gpr',7,1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',7),4);
 assert.equal(c('loop_guest_error',7),3);
 assert.equal(c('loop_pc',7),pc,'failed generated STW must not commit PC');
 assert.equal(c('loop_cpu_gpr',7,3)>>>0,r3>>>0,'generated BL helper must not commit GPR after failed STW');
 assert.equal(c('loop_cpu_gpr',7,1),sp,'stack must remain unchanged');
 assert.equal(c('mem_read32',0x80010000)>>>0,0xBEADCAFE,'rollback restores original word, not zero');
 assert.equal(c('mem_read32',0xC0011000),0);
 assert.equal(c('mem_pages'),1,'no ghost new page after partial commit rollback');
 assert.equal(c('interop_device_invoked'),0,'no fake device MMIO callbacks');
 assert.equal(c('loop_retry_quota',7),0,'never rerun already committed device effects after late fault');
 assert.equal(c('mem_set_page_budget',2),1);
 assert.equal(c('loop_reap',7),1);
 assert.equal(spawn(c,7,0x80010000,0x80011000,0x89ABCDEF),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_cpu_gpr',7,3)>>>0,0x89ABCDF0);
 assert.equal(c('mem_read32',0x80010000)>>>0,0x89ABCDEF);
 assert.equal(c('mem_read32',0x80011000)>>>0,0x89ABCDEF);
});
test('second MMIO/GX or invalid pointer must fail BEFORE first store; unrelated contexts remain runnable',async()=>{
 const {c}=await create();
 assert.equal(c('mem_write32',0x80010000,0x13579BDF),1);
 assert.equal(spawn(c,1,0x80010000,0xCC008000,0x12345678),1);
 assert.equal(spawn(c,2,0x80012000,0x80013000,0),1);
 assert.equal(c('loop_frame',2),2);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('loop_guest_error',1),7);
 assert.equal(c('loop_pc',1)>>>0,PC);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,0x12345678);
 assert.equal(c('interop_device_invoked'),0);
 assert.equal(c('mem_read32',0xC0010000)>>>0,0x13579BDF);
 assert.equal(c('loop_state',2),3);
 assert.equal(c('mem_read32',0x80012000),0);
 assert.equal(c('mem_read32',0x80013000),0);
});
test('128 reset and guest reuse cycles do not accumulate staged RAM or context state',async()=>{
 const {c}=await create();
 for(let i=0;i<128;i++){
   c('loop_reset');
   assert.equal(c('mem_pages'),0);
   assert.equal(spawn(c,1,0x80010000,0xC0011000,i),1);
   assert.equal(c('loop_frame',1),1);
   assert.equal(c('loop_state',1),3);
   assert.equal(c('mem_read32',0x80010000),i);
   assert.equal(c('mem_read32',0x80011000),i);
   assert.equal(c('loop_cpu_gpr',1,3),i+1);
   assert.equal(c('loop_reap',1),1);
   assert.equal(c('loop_state',1),0);
 }
 c('loop_reset');assert.equal(c('mem_pages'),0);
});
