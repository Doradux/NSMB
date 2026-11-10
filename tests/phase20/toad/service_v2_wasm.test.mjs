// Opt-in exact SHA P20 TEST-ONLY pure C++ probe compiled freshly by em++.
// NEVER interpret this wrapper as live W03 authority or Nintendo OSGetTime.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';
const path=process.env.NSMB_TOAD_P20_WASM;
const expected=process.env.NSMB_TOAD_P20_WASM_SHA256;
function load(){
 assert.ok(path&&isAbsolute(path),'exact external artifact path required');
 assert.match(expected||'',/^[0-9a-f]{64}$/,'reviewed SHA256 required');
 const wasm=readFileSync(path);
 assert.equal(createHash('sha256').update(wasm).digest('hex'),expected);
 assert.equal(wasm.subarray(0,4).toString('hex'),'0061736d');
 assert.ok(WebAssembly.validate(wasm));
 const module=new WebAssembly.Module(wasm);
 assert.deepEqual(WebAssembly.Module.imports(module),[],
   'pure probe must not import W03/JS/device or host authority');
 const names=WebAssembly.Module.exports(module).map(x=>x.name).sort();
 const functions=[
  'nsmbw_p20_test_only_status','nsmbw_p20_test_only_ticks',
  'nsmbw_p20_test_only_high32','nsmbw_p20_test_only_low32',
  'nsmbw_p20_test_only_proposed_cost'
 ];
 for(const name of functions)assert.ok(names.includes(name));
 for(const name of names) {
  assert.doesNotMatch(name,/(Ticket|armCanonicalClock|leaseSynthetic|CpuContext|OSGetTime|hLE|forge|ClockNativeTest|nsmbw_loop_)/i);
  assert.ok([...functions,'memory','_initialize','__indirect_function_table',
             'setThrew','_emscripten_stack_restore',
             'emscripten_stack_get_current'].includes(name),
    'unexpected Wasm export '+name);
 }
 return new WebAssembly.Instance(module,{}).exports;
}
const skip=!path?'set NSMB_TOAD_P20_WASM and NSMB_TOAD_P20_WASM_SHA256':false;
test('source-compiled WASM probe exact SHA, zero imports and restricted exports',{skip},()=>{
 load();
});
test('new WASM computes correct synthetic 1s and 2^32 split',{skip},()=>{
 const e=load();const ns=0x53560001,raw=0x53560002;
 assert.equal(e.nsmbw_p20_test_only_status(2,ns,1000000000n,1,1),0);
 assert.equal(e.nsmbw_p20_test_only_ticks(2,ns,1000000000n,1,1),60750000n);
 assert.equal(e.nsmbw_p20_test_only_proposed_cost(2,ns,1000000000n,1,1),1);
 assert.equal(e.nsmbw_p20_test_only_high32(2,raw,4294967296n,1,1),1);
 assert.equal(e.nsmbw_p20_test_only_low32(2,raw,4294967296n,1,1),0);
 assert.equal(e.nsmbw_p20_test_only_ticks(2,raw,4294967296n,1,1),
  4294967296n);
});
test('new WASM denies JS, W07, MMIO, IRQ, unknown/version/quota',{skip},()=>{
 const e=load(),ns=0x53560001,nanos=1000000000n;
 for(const origin of [0,2,3,4,5]) {
  assert.equal(e.nsmbw_p20_test_only_status(2,ns,nanos,origin,1),7);
  assert.equal(e.nsmbw_p20_test_only_ticks(2,ns,nanos,origin,1),0n);
 }
 assert.equal(e.nsmbw_p20_test_only_status(2,0x12345678,nanos,1,1),1);
 assert.equal(e.nsmbw_p20_test_only_status(1,ns,nanos,1,1),2);
 assert.equal(e.nsmbw_p20_test_only_status(0,ns,nanos,1,1),2);
 assert.equal(e.nsmbw_p20_test_only_status(2,ns,nanos,1,0),9);
 assert.equal(e.nsmbw_p20_test_only_ticks(2,ns,nanos,1,0),0n);
});
test('new WASM 4096 exact BigInt quotient/rem oracle samples',{skip},()=>{
 const e=load(),MAX=(1n<<64n)-1n;
 let state=0xa9876543210fedcbn;
 for(let i=0;i<4096;i++){
  state=(state*6364136223846793005n+1442695040888963407n)&MAX;
  const expectedTicks=(state/4000n)*243n+((state%4000n)*243n)/4000n;
  const actual=e.nsmbw_p20_test_only_ticks(2,0x53560001,state,1,1);
  assert.equal(actual,expectedTicks,'index '+i);
  assert.equal(BigInt(e.nsmbw_p20_test_only_high32(2,0x53560001,state,1,1)>>>0),
    expectedTicks>>32n);
  assert.equal(BigInt(e.nsmbw_p20_test_only_low32(2,0x53560001,state,1,1)>>>0),
    expectedTicks&0xffffffffn);
 }
});
