#!/usr/bin/env node
// Phase19 dynamic proof: exact freshly compiled Emscripten module executes
// the REAL native W03 synthetic fixture, not a JS shadow guest.
// The static provenance gate must PASS FIRST. No Wii code or original HLE.
import {readFileSync,writeFileSync,realpathSync,lstatSync,existsSync} from 'node:fs';
import {resolve,join,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {runClockFixture} from '../../tests/phase19/peach/clock_fixture_assertions.mjs';

const here=fileURLToPath(new URL('.',import.meta.url));
const repo=resolve(here,'../..');
const sha=data=>createHash('sha256').update(data).digest('hex');
function fail(msg,code=65){
  console.error(msg);process.exitCode=code;
}
async function main(){
  const [op,raw,...more]=process.argv.slice(2);
  if(op!=='--verify'||!raw||more.length||!isAbsolute(raw))
    return fail('DENY: Usage --verify ABSOLUTE_EXTERNAL_FRESH_WASM_DIR',64);
  if(!existsSync(raw))return fail('BLOCKED-ENV: missing Wasm artifact directory',78);
  const dir=realpathSync(raw);
  const source=realpathSync(repo);
  if(dir===source||dir.startsWith(source+sep))
    return fail('DENY: product cannot live in source checkout',64);
  const guard=spawnSync('node',[join(here,'verify_phase18_wasm.mjs'),
    '--verify',dir],{encoding:'utf8',timeout:30000});
  if(guard.status!==0)
    return fail('BLOCKED-PROVENANCE: static Git/source/ABI gate FAILED: '+
                (guard.stderr||guard.stdout),guard.status===78?78:65);
  const get=name=>{
    const path=join(dir,name);
    if(lstatSync(path).isSymbolicLink())
      throw Error('DENY: artifact symlink '+name);
    return readFileSync(path);
  };
  const wasmBytes=get('frame_loop.wasm'),mjsBytes=get('frame_loop.mjs');
  const manifest=JSON.parse(get('phase18_artifact_manifest.json').toString('utf8'));
  const wasmDigest=sha(wasmBytes),mjsDigest=sha(mjsBytes);
  const expectedImage='sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a';
  const builtBy=get('phase19_build_info.txt').toString('utf8');
  if(!builtBy.includes('Source_Git_SHA '+manifest.head) ||
     !builtBy.includes('Image_ID '+expectedImage) ||
     !builtBy.includes('Network none') ||
     !builtBy.includes('Source_mount readonly') ||
     !builtBy.includes('Compile_CXX_Flags -std=c++17 -O2 -Wall -Wextra') ||
     !builtBy.includes('Compile_EMCC_Flags -sWASM=1 -sMODULARIZE=1 -sEXPORT_ES6=1') ||
     !builtBy.includes(wasmDigest)||!builtBy.includes(mjsDigest))
    throw Error('BLOCKED-PROVENANCE: Docker build ID/flags/source/digest mismatch');
  for(const file of [
    'web-runtime/frame-host/rebuild_phase17_user.sh',
    'web-runtime/frame-host/rebuild_phase18_user.sh',
    'web-runtime/frame-host/build_phase19_container.sh'
  ]) {
    const script=join(repo,file);
    if(!builtBy.includes(sha(readFileSync(script))+'  '+script))
      throw Error('BLOCKED-PROVENANCE: build script flags/source SHA mismatch '+file);
  }
  const compilerLog=get('build_manifest.txt').toString('utf8');
  if(!compilerLog.includes('\n'+manifest.head+'\n') ||
     !compilerLog.includes('Emscripten')||
     !compilerLog.includes('6.0.13')||
     !compilerLog.includes(wasmDigest+'  /output/frame_loop.wasm')||
     !compilerLog.includes(mjsDigest+'  /output/frame_loop.mjs'))
    throw Error('BLOCKED-PROVENANCE: Emscripten toolchain/build output log mismatch');
  for(const file of [
    'web-runtime/frame-host/frame_loop.cpp',
    'web-runtime/frame-host/guest_cpu.cpp',
    'web-runtime/frame-host/translator_abi_fixture.cpp',
    'web-runtime/src/guest_memory.cpp',
    'web-runtime/interop/synthetic_guest.cpp',
    'web-runtime/interop/device_policy.cpp',
    'web-runtime/runtime-services/input_snapshot.cpp'
  ]) {
    if(!compilerLog.includes(manifest.files[file]+'  /work/'+file))
      throw Error('BLOCKED-PROVENANCE: build source input SHA mismatch '+file);
  }
  if(!WebAssembly.validate(wasmBytes))throw Error('DENY: invalid Wasm bytes');
  const wasm=new WebAssembly.Module(wasmBytes);
  const exported=WebAssembly.Module.exports(wasm).map(x=>x.name);
  for(const required of [
    'nsmbw_loop_synthetic_clock_fixture_spawn','nsmbw_loop_clock_ticks_hi',
    'nsmbw_loop_clock_ticks_lo','nsmbw_loop_clock_revision_lo',
    'nsmbw_loop_clock_revision_hi','nsmbw_loop_clock_outcome',
    'nsmbw_loop_clock_pending','nsmbw_loop_tick','nsmbw_loop_cpu_gpr'
  ]) {
    if(!exported.includes(required))throw Error('DENY: missing new real W03 export '+required);
  }
  if(exported.some(s=>/armCanonicalClock|leaseSynthetic|forgeForNativeTest|OSGetTime|clockNativeTest|Time64PermitIssuer/.test(s)))
    throw Error('DENY: native private/false Wii HLE unexpectedly exported');
  const began=performance.now();
  const createModule=(await import(pathToFileURL(join(dir,'frame_loop.mjs')).href)).default;
  const mod=await createModule({locateFile:name=>join(dir,name)});
  const coldInitMs=performance.now()-began;
  const result=runClockFixture(mod,{stressCount:1024});
  if(result.checks<60||result.stressCount!==1024)
    throw Error('DENY: dynamic W03 clock proof under-exercised');
  const proof={
    schema:'nsmb-phase19-real-W03-clock-proof-v1',
    sourceHead:manifest.head,wasmSha256:wasmDigest,mjsSha256:mjsDigest,
    oracleSha256:sha(readFileSync(new URL('../../tests/phase19/peach/clock_fixture_assertions.mjs',
                                           import.meta.url))),
    imageId:expectedImage,
    proofKind:'actual fresh Wasm W03 synthetic fixture, NOT original Wii code',
    node:{...result,coldInitMs},verifiedExports:exported.length
  };
  const path=join(dir,'phase19_node_clock_proof.json');
  if(existsSync(path)) {
    const previous=JSON.parse(get('phase19_node_clock_proof.json').toString('utf8'));
    if(previous.sourceHead!==proof.sourceHead ||
       previous.wasmSha256!==wasmDigest ||previous.mjsSha256!==mjsDigest ||
       previous.oracleSha256!==proof.oracleSha256 ||
       previous.imageId!==expectedImage ||
       previous.node?.checks!==proof.node.checks ||
       previous.node?.stressCount!==proof.node.stressCount ||
       previous.node?.exampleTicks!==proof.node.exampleTicks ||
       previous.node?.exampleRevision!==proof.node.exampleRevision)
      throw Error('DENY: previous dynamic proof has altered source/binary/oracle/assertions');
  }else writeFileSync(path,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
  console.log('PHASE19_NODE_DYNAMIC_REAL_W03_CLOCK_PASS',
    wasmDigest,'source',manifest.head,'checks',result.checks,'reset',result.stressCount);
  console.log('PHASE19_NODE_INIT_MS',coldInitMs.toFixed(3),
    'STRESS_MS',result.stressElapsedMs.toFixed(3),
    'WASM_BYTES',wasmBytes.length);
}
await main().catch(error=>fail(String(error?.stack||error),65));
