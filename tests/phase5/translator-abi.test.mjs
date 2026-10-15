// Reviewer-owned actual C# translator->C++->Emscripten Wasm acceptance.
// Only an explicitly generated two-instruction ORIGINAL-FREE synthetic fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.NSMB_LUIGI_PHASE5_ROOT||process.cwd());
const base=resolve(root,'web-runtime/frame-host');
const generated=resolve(base,'translator-fixture/out/generated_functions/func_80001000.cpp');
const esm=resolve(base,'dist/frame_loop_translated_fixture.mjs');
const wasmPath=resolve(base,'dist/frame_loop_translated_fixture.wasm');
const normalEsm=resolve(base,'dist/frame_loop.mjs');
const normalWasm=resolve(base,'dist/frame_loop.wasm');
async function fresh(){
 for(const path of [generated,esm,wasmPath,normalEsm,normalWasm])
   assert.ok(existsSync(path),'REQUIRES clean C# Translator.Cli-generated synthetic fixture '+path);
 assert.equal(readFileSync(wasmPath).subarray(0,4).toString('hex'),'0061736d');
 const source=readFileSync(generated,'utf8');
 assert.match(source,/extern "C" void func_80001000\(CpuContext\* MKW_RESTRICT ctx\)/);
 assert.match(source,/r3 = \(r3 \+ 1\)/);
 assert.match(source,/ctx->gpr\[3\] = r3/);
 assert.match(source,/RECOMP_GUEST_ABI gpr_read=0x00000008 gpr_write=0x00000008/);
 assert.doesNotMatch(source,/MemoryInline::|GX_HLE_FIFO|IOS_OpenAsync/);
 const factory=(await import(pathToFileURL(esm).href)).default;
 const wasm=await factory({locateFile:()=>wasmPath});
 const f=(symbol,...args)=>{
  const call=wasm['_nsmbw_'+symbol];
  assert.equal(typeof call,'function','real C++/Wasm export absent: '+symbol);
  return call(...args);
 };
 f('loop_reset');
 return {wasm,f};
}
const entry=0x80001000,exit=0x8001FFF0;
const spawn=(f,id,r3,stack=0x80005010+id*0x1000)=>f('loop_translated_spawn',id,stack,r3,0x81002000+id,0x81003000+id);
test('real translator C++ calls have preserved LR/SP/SDA, uint32 wrap and no ghost checked RAM',async()=>{
 const {wasm,f}=await fresh();
 for(const [id,start] of [[1,0],[2,0x7FFFFFFF],[3,0xFFFFFFFF]]){
   assert.equal(spawn(f,id,start),1);
   assert.equal(f('loop_pc',id)>>>0,entry);
   assert.equal(f('loop_cpu_gpr',id,3)>>>0,start>>>0);
 }
 assert.equal(f('loop_frame',3),3);
 assert.equal(f('loop_done'),3);
 for(const [id,start] of [[1,0],[2,0x7FFFFFFF],[3,0xFFFFFFFF]]){
   assert.equal(f('loop_pc',id)>>>0,exit);
   assert.equal(f('loop_cpu_gpr',id,3)>>>0,(start+1)>>>0);
   assert.equal(f('loop_cpu_gpr',id,1)>>>0,0x80005010+id*0x1000);
   assert.equal(f('loop_cpu_gpr',id,2)>>>0,0x81002000+id);
   assert.equal(f('loop_cpu_gpr',id,13)>>>0,0x81003000+id);
   assert.equal(f('loop_cpu_lr',id)>>>0,exit);
 }
 assert.equal(f('mem_pages'),0,'real translated arithmetic cannot allocate guest memory');
 assert.equal(typeof wasm._nsmbw_test_policy_install,'undefined',
  'translator fixture must not silently include typed device policy test knobs');
 const regular=await (await import(pathToFileURL(normalEsm).href)).default({locateFile:()=>normalWasm});
 assert.equal(typeof regular._nsmbw_loop_translated_spawn,'undefined',
  'generated test-only symbol must never enter public normal Wasm');
});
test('translated source CPU context exhaustion and overlap are fail-closed before mutation',async()=>{
 const {f}=await fresh();
 // One checked synthetic ABI CPU source reserves stack space on spawn,
 // despite the actual two-op translated function doing NO stack write.
 assert.equal(spawn(f,1,12,0x80005010),1);
 assert.equal(spawn(f,2,13,0xC0005010),0,
  'same physical guest stack via MEM1 alias must not host two CPU contexts');
 assert.equal(f('loop_state',2),0);
 assert.equal(f('loop_cpu_gpr',1,3),12);
 assert.equal(spawn(f,3,13,0x80004010),0,
  'guest input word 0x80004000 must not alias caller 16-byte stack');
 assert.equal(f('loop_state',3),0);
 for(let id=4;id<=10;id++){
   assert.equal(spawn(f,id,id,0x80020010+id*0x1000),1,
     'nonoverlapping stack required while outputs occupy 0x8000C000+');
 }
 assert.equal(f('loop_ready'),8);
 assert.equal(spawn(f,11,111,0x8002B010),0,
  'scheduler capacity full; must not precommit an extra guest');
 assert.equal(f('loop_state',11),0);
 assert.equal(f('loop_frame',8),8);
 assert.equal(f('loop_done'),8);
 assert.equal(f('mem_pages'),0);
 assert.equal(f('loop_reap',1),1);
 assert.equal(spawn(f,11,111,0x8002B010),1);
 assert.equal(f('loop_frame',1),1);
 assert.equal(f('loop_cpu_gpr',11,3),112);
 assert.equal(f('loop_reap',11),1);
 assert.equal(f('mem_pages'),0);
});
