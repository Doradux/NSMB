// Peach adversarial tests of actual PUBLIC C# Translator -> C++ -> joined Wasm.
// No original Nintendo PowerPC code or game memory involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const base=resolve(process.env.NSMB_PHASE7_READWRITE_ROOT||process.cwd(),'web-runtime/frame-host');
const src=resolve(base,'translator-fixture/out/readwrite_fixture/generated_functions/func_80001000.cpp');
const mod=resolve(base,'dist/frame_loop_translated_readwrite_fixture.mjs');
const bin=resolve(base,'dist/frame_loop_translated_readwrite_fixture.wasm');
async function fresh(){
 for(const f of [src,mod,bin])assert.ok(existsSync(f),'generated C# synthetic artifact required '+f);
 assert.equal(readFileSync(bin).subarray(0,4).toString('hex'),'0061736d');
 const generated=readFileSync(src,'utf8');
 const pos=['MemoryInline::FlatWrite32(r4, r3);',
 'r5 = MemoryInline::FlatRead32(r4);',
 'MemoryInline::FlatWrite32(r6, r3);',
 'ctx->gpr[5] = r5;'].map(x=>generated.indexOf(x));
 assert.ok(pos.every(n=>n>=0)&&pos.every((n,i)=>i===0||n>pos[i-1]),
  'C# emitted exact STW -> LWZ -> STW -> register-commit order');
 const m=await (await import(pathToFileURL(mod).href)).default({locateFile:()=>bin});
 const c=(name,...args)=>{
  assert.equal(typeof m['_nsmbw_'+name],'function','missing genuine C++ export '+name);
  return m['_nsmbw_'+name](...args);
 };
 c('loop_reset');return {m,c};
}
const spawn=(c,id,a,b,v)=>c('loop_translated_store_spawn',id,
 0x80020010+id*0x1000,a,b,v,0x81002000+id,0x81003000+id);
test('MEM2 staged guest write is forwarded to generated LWZ; independent MEM1 write remains coherent',async()=>{
 const {c}=await fresh();
 const a=0x90010000,b=0x80011000,v=0xDCBA9876;
 assert.equal(c('mem_write32',a,0x01234567),1);
 assert.equal(spawn(c,1,a,b,v),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('loop_cpu_gpr',1,5)>>>0,v);
 assert.equal(c('mem_read32',a)>>>0,v);
 assert.equal(c('mem_read32',b)>>>0,v);
 assert.deepEqual([0,1,2,3].map(i=>c('mem_read8',a+i)),[0xDC,0xBA,0x98,0x76]);
 assert.equal(c('mem_pages'),2,'one new MEM1 page and one existing MEM2 page');
});
test('late second UNALIGNED or UNMAPPED generated store fails without leaking forwarded r5 or changing bytes',async()=>{
 for(const destination of [0x80011001,0x88000000,0x81800000,0xCC008000]){
  const {c}=await fresh();
  assert.equal(c('mem_write32',0x80010000,0xCAFEBABE),1);
  assert.equal(spawn(c,2,0xC0010000,destination,0),1);
  assert.equal(c('loop_frame',1),1,'exactly one guest should advance to typed fault');
  assert.equal(c('loop_state',2),4);
  assert.equal(c('loop_guest_error',2),7,'unsafe memory or MMIO address must be denied before mutation');
  assert.equal(c('loop_pc',2)>>>0,0x80001000);
  assert.equal(c('loop_cpu_gpr',2,5)>>>0,0,'forwarded zero cannot escape fault');
  assert.equal(c('mem_read32',0x80010000)>>>0,0xCAFEBABE);
  assert.equal(c('mem_pages'),1);
  assert.equal(c('interop_device_invoked'),0);
  assert.equal(c('loop_retry_quota',2),0);
 }
});
test('valid last MEM1 word supports staged read-forward without overflowing guest address width',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_set_page_budget',2),1);
 assert.equal(spawn(c,3,0x817FFFFC,0x80011000,0xA1B2C3D4),1);
 assert.equal(c('loop_frame',1),1,'one bounded guest frame');
 assert.equal(c('loop_state',3),3);
 assert.equal(c('loop_cpu_gpr',3,5)>>>0,0xA1B2C3D4);
 assert.equal(c('mem_read32',0xC17FFFFC)>>>0,0xA1B2C3D4);
 assert.equal(c('mem_read32',0x80011000)>>>0,0xA1B2C3D4);
 assert.equal(c('mem_pages'),2);
});
