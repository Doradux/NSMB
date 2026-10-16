import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const moduleFor=async name=>new WebAssembly.Module(await readFile(new URL('../dist/'+name+'.wasm',import.meta.url)));
test('static ABI signature: normal and STH TEST-only modules have only allowed imports',async()=>{
 for(const name of ['frame_loop','frame_loop_translated_sth_fixture']){
  const module=await moduleFor(name);
  const imports=WebAssembly.Module.imports(module);
  assert.deepEqual(imports.map(i=>[i.module,i.name,i.kind]),
   [['env','emscripten_resize_heap','function']],name);
  const names=new Set(WebAssembly.Module.exports(module).map(e=>e.name));
  for(const required of ['nsmbw_loop_cpu_spawn_abi','nsmbw_loop_cpu_fpscr',
    'nsmbw_loop_cpu_gqr','nsmbw_loop_cpu_abi_layout',
    'nsmbw_mem_write8','nsmbw_mem_write16',
    'nsmbw_interop_read32','nsmbw_interop_status'])
   assert.ok(names.has(required),name+' dropped ABI '+required);
  for(const forbidden of ['nsmbw_test_policy_install','nsmbw_test_policy_rejection',
    'nsmbw_loop_translated_sth_spawn','nsmbw_services_tick_claim'])
   assert.ok(!names.has(forbidden),name+' leaked '+forbidden);
 }
});
test('STH dispatcher exists only in isolated TEST fixture, not normal public Wasm',async()=>{
 const normal=new Set(WebAssembly.Module.exports(await moduleFor('frame_loop')).map(e=>e.name));
 const fixture=new Set(WebAssembly.Module.exports(await moduleFor('frame_loop_translated_sth_fixture')).map(e=>e.name));
 assert.ok(!normal.has('nsmbw_loop_translated_store_spawn'));
 assert.ok(fixture.has('nsmbw_loop_translated_store_spawn'));
 const added=[...fixture].filter(n=>!normal.has(n));
 assert.deepEqual(added,['nsmbw_mem_atomic_pair_write32','nsmbw_loop_translated_store_spawn']);
});
