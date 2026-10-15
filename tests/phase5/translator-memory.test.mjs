// QA-only independent real public synthetic Translator.Cli lwz -> C++ ->
// Emscripten Wasm. Not game translation, no original Nintendo binary.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {existsSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const base=resolve(process.env.NSMB_LUIGI_PHASE5_ROOT||process.cwd(),'web-runtime/frame-host');
const cpp=resolve(base,'translator-fixture/out/memory_fixture/generated_functions/func_80001000.cpp');
const esm=resolve(base,'dist/frame_loop_translated_load_fixture.mjs');
const wasmFile=resolve(base,'dist/frame_loop_translated_load_fixture.wasm');
async function fresh(){
 for(const p of [cpp,esm,wasmFile])assert.ok(existsSync(p),'must compile real public 2-op translator fixture: '+p);
 const src=readFileSync(cpp,'utf8');
 assert.match(src,/extern "C" void func_80001000\(CpuContext\* MKW_RESTRICT ctx\)/);
 assert.match(src,/MemoryInline::FlatRead32\(r4\)/,'a real C# translator emitted this read');
 assert.equal(readFileSync(wasmFile).subarray(0,4).toString('hex'),'0061736d');
 const m=await (await import(pathToFileURL(esm).href)).default({locateFile:()=>wasmFile});
 const c=(name,...args)=>{
   assert.equal(typeof m['_nsmbw_'+name],'function','missing real C++ export '+name);
   return m['_nsmbw_'+name](...args);
 };
 c('loop_reset');
 return {m,c};
}
const spawn=(c,id,addr)=>c('loop_translated_load_spawn',id,0x80020010+id*0x1000,addr,0x81002000+id,0x81003000+id);
test('same compiled generator function isolates valid zero, unallocated RAM, unmapped and MMIO among three concurrent guests',async()=>{
 const {c}=await fresh();
 const valid=0x80004000;
 assert.equal(c('mem_write32',valid,0),1);
 assert.equal(spawn(c,1,valid),1);
 assert.equal(spawn(c,2,0xCC008000),1);
 assert.equal(spawn(c,3,0x88000000),1);
 assert.equal(c('loop_frame',3),3);
 assert.equal(c('loop_state',1),3,'real zero is a legal guest word, not a fault');
 assert.equal(c('loop_cpu_gpr',1,3),0);
 for(const [id,code] of [[2,4],[3,1]]){
   assert.equal(c('loop_state',id),4,'only faulty CPU context must fault');
   assert.equal(c('loop_guest_error',id),code);
   assert.equal(c('loop_pc',id)>>>0,0x80001000,'failed checked lwz cannot commit PC');
   assert.equal(c('loop_cpu_gpr',id,3)>>>0,0xDEADBEEF,'failed read cannot overwrite r3');
   assert.equal(c('loop_retry_quota',id),0);
 }
 assert.equal(c('mem_pages'),1,'only explicit input store allocated backing W04 RAM');
 assert.equal(c('loop_reap',1),1);
 assert.equal(c('loop_reap',2),1);
 assert.equal(c('loop_reap',3),1);
 assert.equal(c('mem_write32',valid,0xFEEDBEEF),1);
 assert.equal(spawn(c,4,0xC0004000),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_cpu_gpr',4,3)>>>0,0xFEEDBEEF,'reusing guest memory after errors is independent');
 assert.equal(c('loop_guest_error',4),0);
});
test('unallocated valid address reads actual synthetic sparse zero without creating a page',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_set_page_budget',0),1);
 assert.equal(spawn(c,5,0x80004000),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',5),3);
 assert.equal(c('loop_cpu_gpr',5,3),0);
 assert.equal(c('mem_pages'),0);
 assert.equal(c('loop_guest_error',5),0);
});
