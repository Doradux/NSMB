// Peach Phase11 native binary surface gate, NOT a REA typed signature report.
// Requires exact candidate tree from independent detached commit; no game assets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(process.env.NSMB_P11_TIME64_ROOT||process.cwd());
const expectedHash=process.env.NSMB_P11_EXPECTED_WASM_SHA||
 '698d9aec000498f67869c1aeb8443edd3f7e3ed948f996bf8554c324fdd86a3c';
const add=[
 'nsmbw_services_tick_is_claimed',
 'nsmbw_services_tick_claim',
 'nsmbw_services_tick_store32',
 'nsmbw_services_tick_status',
 'nsmbw_services_tick_status_reset',
 'nsmbw_services_time64_publish',
 'nsmbw_services_time64_status',
 'nsmbw_services_time64_gpr',
 'nsmbw_services_time64_context_bytes',
 'nsmbw_services_time64_context_alignment',
 'nsmbw_services_time64_reset'
].sort();
const inspect=path=>{
 const bytes=readFileSync(path);
 assert.equal(bytes.subarray(0,4).toString('hex'),'0061736d');
 const m=new WebAssembly.Module(bytes);
 return {hash:createHash('sha256').update(bytes).digest('hex'),
  imports:WebAssembly.Module.imports(m),
  exports:WebAssembly.Module.exports(m)};
};
test('checked published time64 Wasm preserves every normal export and sole import',()=>{
 const normal=inspect(resolve(root,'web-runtime/frame-host/dist/frame_loop.wasm'));
 const tick=inspect(resolve(root,'web-runtime/runtime-services/dist/joined_tick.wasm'));
 assert.equal(tick.hash,expectedHash,'Unexpected compiled candidate hash; review exact source SHA again');
 assert.equal(normal.exports.length,66);
 assert.equal(tick.exports.length,77);
 assert.deepEqual(tick.imports,normal.imports,'Time64 must not introduce new host capability');
 assert.deepEqual(tick.imports,[{module:'env',name:'emscripten_resize_heap',kind:'function'}]);
 for(const entry of normal.exports){
  assert.deepEqual(tick.exports.find(e=>e.name===entry.name),entry,
    'production binary export removed or kind changed: '+entry.name);
 }
 assert.deepEqual(tick.exports.filter(e=>!normal.exports.some(b=>b.name===e.name))
  .map(e=>e.name).sort(),add,'Only 11 reviewed native tick/time64 exports allowed');
 assert.ok(!tick.exports.some(e=>/test_policy|translated_store_spawn|atomic_pair/.test(e.name)),
  'test-only memory/device fixture escaped to normal compiled time64 module');
});
