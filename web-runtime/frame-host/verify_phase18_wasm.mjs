#!/usr/bin/env node
// PHASE18 opt-in PRODUCT-integrity gate for a newly compiled PUBLIC SYNTHETIC
// W03/W04/W07 Wasm. No originals, no fake game/HLE and NO download/sudo.
// This checks exact source+artifact SHA and static typed Wasm ABI in NODE.
// Real Chromium execution is a SEPARATE compulsory gate for any browser claim.
import {readFileSync,writeFileSync,existsSync,realpathSync,lstatSync} from 'node:fs';
import {resolve,isAbsolute,sep,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const relSources=[
  'web-runtime/frame-host/frame_loop.cpp',
  'web-runtime/frame-host/guest_cpu.cpp',
  'web-runtime/frame-host/translator_abi_fixture.cpp',
  'web-runtime/frame-host/trusted_cpu_service.hpp',
  'web-runtime/frame-host/scheduler_clock.hpp',
  'web-runtime/frame-host/time64_clock_bridge.hpp',
  'web-runtime/src/guest_memory.cpp',
  'web-runtime/interop/synthetic_guest.cpp',
  'web-runtime/interop/device_policy.cpp',
  'web-runtime/runtime-services/input_snapshot.cpp',
  'web-runtime/runtime-services/time64_pure_candidate.hpp',
  'web-runtime/runtime-services/time64_pure_clock.hpp'
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function command(executable,args){
  const result=spawnSync(executable,args,{cwd:root,encoding:'utf8',timeout:15000});
  if(result.status!==0)throw Error(executable+': '+(result.stderr||result.error?.message||'exit '+result.status));
  return result.stdout.trim();
}
function safeOutput(raw){
  if(!isAbsolute(raw))throw Error('DENY: output must be absolute as supplied');
  if(!existsSync(raw))throw Error('BLOCKED-ENV: artifact output directory missing');
  const dest=realpathSync(raw), source=realpathSync(root);
  if(dest===source||dest.startsWith(source+sep))throw Error('DENY: output under Git source');
  if(dest==='/'||dest.length<6)throw Error('DENY: output at broad system path');
  return dest;
}
function exactFile(folder,name){
  const file=join(folder,name);
  if(lstatSync(file).isSymbolicLink())throw Error('DENY: symlinked output artifact '+name);
  return readFileSync(file);
}
function auditWasm(binary){
  if(!WebAssembly.validate(binary))throw Error('BLOCKED-ABI: invalid Wasm bytes');
  const wasm=new WebAssembly.Module(binary);
  const imports=WebAssembly.Module.imports(wasm);
  const exports=WebAssembly.Module.exports(wasm);
  if(imports.some(x=>x.module!=='env'||x.name!=='emscripten_resize_heap'))
    throw Error('BLOCKED-ABI: unreviewed Wasm imports: '+JSON.stringify(imports));
  if(!exports.some(x=>/nsmbw_loop_tick$/.test(x.name)) ||
     !exports.some(x=>/nsmbw_loop_cpu_gpr$/.test(x.name)))
    throw Error('BLOCKED-ABI: missing required public synthetic W03 exports');
  if(exports.some(x=>/OSGetTime|Time64PermitIssuer|forgeForNativeTest|clockNativeTest|armCanonicalClock|armPureTime64Clock|armCheckedTime64Clock/.test(x.name)))
    throw Error('BLOCKED-ABI: forbidden private/test/original HLE export detected');
  return {imports,exports};
}
function sourceMap(){
  const hashes={};
  for(const file of relSources){
    const path=join(root,file);
    if(!existsSync(path))throw Error('BLOCKED-PEER-API: source header absent: '+file);
    hashes[file]=sha(readFileSync(path));
  }
  return hashes;
}
function inspect(folder) {
  const currentSource=sourceMap(); // Fails CLOSED when peer source unavailable.
  const wasm=exactFile(folder,'frame_loop.wasm');
  const mjs=exactFile(folder,'frame_loop.mjs');
  const abi=auditWasm(wasm);
  return {currentSource,wasmDigest:sha(wasm),mjsDigest:sha(mjs),
          imports:abi.imports,exports:abi.exports};
}
function main(){
  const [action,dest,...rest]=process.argv.slice(2);
  if(rest.length||!['--create','--verify'].includes(action)||!dest)
    throw Error('Usage: node verify_phase18_wasm.mjs --create|--verify ABSOLUTE_OUTDIR');
  const dir=safeOutput(dest);
  const inspected=inspect(dir);
  const head=command('git',['rev-parse','HEAD']);
  const dirty=command('git',['status','--porcelain=v1']);
  if(dirty)throw Error('BLOCKED-SOURCE: Git source is uncommitted/dirty');
  const manifestFile=join(dir,'phase18_artifact_manifest.json');
  if(action==='--create'){
    if(existsSync(manifestFile))throw Error('DENY: Phase18 manifest already exists');
    const manifest={
      schema:'nsmb-phase18-synthetic-wasm-artifact-v1',
      head,
      files:inspected.currentSource,
      outputs:{'frame_loop.wasm':inspected.wasmDigest,
               'frame_loop.mjs':inspected.mjsDigest},
      imports:inspected.imports,exports:inspected.exports,
      note:'PUBLIC SYNTHETIC C++ SOURCE ONLY: no Nintendo, not proof of native clock event'
    };
    writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  }
  const manifest=JSON.parse(exactFile(dir,'phase18_artifact_manifest.json').toString('utf8'));
  if(manifest.schema!=='nsmb-phase18-synthetic-wasm-artifact-v1' ||
     manifest.head!==head ||
     JSON.stringify(manifest.files)!==JSON.stringify(inspected.currentSource) ||
     manifest.outputs?.['frame_loop.wasm']!==inspected.wasmDigest ||
     manifest.outputs?.['frame_loop.mjs']!==inspected.mjsDigest ||
     JSON.stringify(manifest.imports)!==JSON.stringify(inspected.imports) ||
     JSON.stringify(manifest.exports)!==JSON.stringify(inspected.exports))
    throw Error('BLOCKED-PROVENANCE: source/binary/ABI hash mismatch');
  console.log('PHASE18_WASM_NODE_STATIC_INTEGRITY_PASS',
    inspected.wasmDigest,'source',head);
  console.log('BROWSER_EXECUTION_NOT_PROVEN: use explicit verify_phase18_browser.mjs');
}
try{ main(); }catch(error){
  const msg=String(error?.message||error);
  console.error(msg);
  process.exitCode=/BLOCKED-PEER-API|BLOCKED-ENV/.test(msg)?78:
    /DENY|Usage/.test(msg)?64:65;
}
