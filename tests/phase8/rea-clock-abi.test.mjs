// Peach Phase8 independent static REA + native WebAssembly.Module ABI gate.
// PUBLIC copyright-free diagnostic builds only; no Wii original inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve(process.env.NSMB_PHASE8_BASE_ROOT||process.cwd());
const clockRoot=process.env.NSMB_PHASE8_CLOCK_ROOT;
const rea=process.env.NSMB_REA_CMD||'C:/NSMBtools/rea.cmd';
const ABI=['nsmbw_loop_cpu_spawn_abi','nsmbw_loop_cpu_fpscr',
 'nsmbw_loop_cpu_gqr','nsmbw_loop_cpu_abi_layout'];
const TICK=['nsmbw_services_tick_claim','nsmbw_services_tick_store32',
 'nsmbw_services_tick_status','nsmbw_services_tick_status_reset'];
const MOCK=/^nsmbw_test_policy_|^nsmbw_loop_translated_store_spawn$|^nsmbw_mem_atomic_pair_write32$/;
function readArtifact(file){
 assert.ok(existsSync(file),'EXACT published/compiled artifact required: '+file);
 const raw=readFileSync(file);
 assert.equal(raw.subarray(0,4).toString('hex'),'0061736d');
 const mod=new WebAssembly.Module(raw);
 return {
   sha:createHash('sha256').update(raw).digest('hex'),
   imports:WebAssembly.Module.imports(mod).map(i=>i.module+'.'+i.name).sort(),
   exports:WebAssembly.Module.exports(mod).map(e=>e.name).sort()
 };
}
function runRea(file){
 assert.ok(existsSync(rea),'REA 6.5.0 outside project required');
 const command="& '"+rea.replace(/'/g,"''")+"' inspect-wasm-artifact '"+
   file.replace(/'/g,"''")+"' --format json";
 const response=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],
   {encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:12*1024*1024});
 assert.equal(response.status,0,response.stderr||response.error?.message);
 const parsed=JSON.parse(response.stdout.trim().replace(/^\uFEFF/,''));
 assert.equal(parsed.provider.id,'wabt-artifact');
 assert.equal(parsed.normalized_result.validation,'valid');
 assert.equal(parsed.normalized_result.interface.state,'complete');
 assert.ok(parsed.evidence_id.startsWith('ev_'));
 return parsed;
}
function verify(file){
 const abi=readArtifact(file);
 const evidence=runRea(file);
 assert.equal(evidence.subject.digest.sha256.toLowerCase(),abi.sha);
 assert.equal(evidence.normalized_result.artifact.sha256.toLowerCase(),abi.sha);
 const entries=evidence.normalized_result.interface.entries;
 const imports=entries.filter(e=>e.direction==='import')
   .map(e=>e.module+'.'+e.name).sort();
 const exports=entries.filter(e=>e.direction==='export').map(e=>e.name).sort();
 assert.deepEqual(imports,abi.imports,'REA must agree with native imported interface');
 assert.deepEqual(exports,abi.exports,'REA must agree with native exported interface');
 const signatures=new Map(entries.filter(e=>e.direction==='export'||e.direction==='import')
   .map(e=>[(e.direction==='import'?e.module+'.':'')+e.direction+':'+e.name,
     {kind:e.kind,signature:e.signature}]));
 return {...abi,evidenceId:evidence.evidence_id,signatures};
}
test('REA 6.5 + native Wasm: published main W03 CPU ABI, no private fixture exports',{timeout:60000},()=>{
 const file=resolve(root,'web-runtime/frame-host/dist/frame_loop.wasm');
 const normal=verify(file);
 assert.deepEqual(normal.imports,['env.emscripten_resize_heap']);
 for(const name of ABI)assert.ok(normal.exports.includes(name),'Missing main CPU symbol '+name);
 for(const name of normal.exports)assert.doesNotMatch(name,MOCK,
   'Production exported a test-only symbol '+name);
 console.log('REA baseline',normal.sha,normal.evidenceId);
});
test('REA 6.5 + native Wasm: NEW rebuilt clock preserves main API and adds ONLY four tick exports',{timeout:60000},()=>{
 assert.ok(clockRoot,'set NSMB_PHASE8_CLOCK_ROOT to a NEW clean exact candidate checkout');
 const main=verify(resolve(root,'web-runtime/frame-host/dist/frame_loop.wasm'));
 const clock=verify(resolve(clockRoot,'web-runtime/runtime-services/dist/joined_tick.wasm'));
 assert.deepEqual(clock.imports,main.imports,
   'New clock must not import device callbacks or private/native capabilities');
 for(const symbol of [...ABI,...TICK])
   assert.ok(clock.exports.includes(symbol),'Clock Wasm omitted required current ABI '+symbol);
 assert.deepEqual(clock.exports.filter(x=>!main.exports.includes(x)).sort(),TICK.slice().sort(),
   'Unexpected added exports beyond the reviewed clock service');
 assert.deepEqual(main.exports.filter(x=>!clock.exports.includes(x)),[],
   'Clock link silently removed part of CURRENT normal W03 ABI');
 for(const name of main.exports){
   assert.deepEqual(clock.signatures.get('export:'+name),
     main.signatures.get('export:'+name),'Clock changed the typed signature of '+name);
 }
 assert.deepEqual(clock.signatures.get('env.import:emscripten_resize_heap'),
   main.signatures.get('env.import:emscripten_resize_heap'),
   'Clock changed the imported Emscripten resize signature');
 for(const name of clock.exports)assert.doesNotMatch(name,MOCK,
   'Clock exported private test-only symbol '+name);
 console.log('REA candidate clock',clock.sha,clock.evidenceId);
});
