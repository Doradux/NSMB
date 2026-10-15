// Independent Peach Phase8 REAL PUBLIC Translator.Cli-generated STB/STW C++ Wasm.
// Synthetic tiny PowerPC DOL; no original Nintendo translated functions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.NSMB_PHASE8_STB_ROOT||process.cwd(),'web-runtime/frame-host');
const generated=resolve(root,'translator-fixture/out/stb_fixture/generated_functions/func_80001000.cpp');
const esm=resolve(root,'dist/frame_loop_translated_stb_fixture.mjs');
const wasmPath=resolve(root,'dist/frame_loop_translated_stb_fixture.wasm');
async function fresh(){
 for(const p of [generated,esm,wasmPath])assert.ok(existsSync(p),'real C#-generated compiled fixture needed: '+p);
 const cpp=readFileSync(generated,'utf8');
 assert.match(cpp,/extern "C" void func_80001000\(CpuContext\* MKW_RESTRICT ctx\)/);
 const byte=cpp.indexOf('MemoryInline::FlatWrite8(');
 const word=cpp.indexOf('MemoryInline::FlatWrite32(');
 assert.ok(byte>=0&&word>byte,'REAL translator emission STB before STW required');
 assert.equal(readFileSync(wasmPath).subarray(0,4).toString('hex'),'0061736d');
 const mod=await (await import(pathToFileURL(esm).href)).default({locateFile:()=>wasmPath});
 const c=(n,...a)=>{const fn=mod['_nsmbw_'+n];assert.equal(typeof fn,'function',n);return fn(...a)};
 c('loop_reset');return {mod,c};
}
const spawn=(c,id,a,b,value)=>c('loop_translated_store_spawn',id,
 0x80020010+id*0x1000,a,b,value,0x81002000+id,0x81003000+id);
test('real C++ translated STB at final valid MEM1 byte has exact big-endian last lane',async()=>{
 const {c}=await fresh();
 const v=0xAABBCC55;
 assert.equal(spawn(c,1,0x817FFFFF,0x90010000,v),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('mem_read32',0xC17FFFFC)>>>0,0x55,'last MEM1 byte staged without overflow');
 assert.equal(c('mem_read8',0x817FFFFF),0x55);
 assert.equal(c('mem_read32',0x90010000)>>>0,v,'distinct MEM2 STW committed');
 assert.equal(c('mem_pages'),2,'one MEM1 and one MEM2 physical page');
 assert.equal(c('loop_pc',1)>>>0,0x8001FFF0);
 assert.equal(c('loop_cpu_gpr',1,3)>>>0,v);
});
test('NEW unallocated page quota1 coalesces STB and later STW via physical alias',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_set_page_budget',1),1);
 assert.equal(spawn(c,2,0xC0010001,0x80010000,0xCAFEBE34),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',2),3);
 assert.equal(c('mem_read32',0xC0010000)>>>0,0xCAFEBE34,'later full STW supersedes STB');
 assert.equal(c('mem_pages'),1,'no phantom second physical page on alias coalescing');
 assert.equal(c('loop_guest_error',2),0);
});
test('preexisting last-byte page rolls back when later source-generated STW targets GX',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_write32',0x817FFFFC,0x11223344),1);
 assert.equal(spawn(c,3,0xC17FFFFF,0xCC008000,0xABCDEF99),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',3),4);
 assert.equal(c('loop_guest_error',3),7);
 assert.equal(c('loop_pc',3)>>>0,0x80001000);
 assert.equal(c('loop_cpu_gpr',3,3)>>>0,0xABCDEF99);
 assert.equal(c('mem_read32',0x817FFFFC)>>>0,0x11223344,
  'uncommitted STB must not change valid edge physical word');
 assert.equal(c('mem_pages'),1);
 assert.equal(c('interop_device_invoked'),0,'no MMIO replay or early side effects');
});
