#!/usr/bin/env node
// PHASE20: source/ABI-verified FRESH Wasm executes actual native W03
// PRIVATE per-guest quota & single clock/GPR transaction in Node.
// No JS/C++ shadow service grant. Public service values are toy-only.
import {readFileSync,writeFileSync,existsSync,realpathSync,lstatSync} from 'node:fs';
import {join,resolve,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {runPrivateServiceFixture} from '../../tests/phase20/peach/private_service_oracle.mjs';
const here=fileURLToPath(new URL('.',import.meta.url));
const repo=resolve(here,'../..');
const hash=b=>createHash('sha256').update(b).digest('hex');
function stop(reason,status=65){console.error(reason);process.exitCode=status;}
async function main(){
 const [flag,location,...rest]=process.argv.slice(2);
 if(flag!=='--verify'||!location||rest.length||!isAbsolute(location))
  return stop('DENY: Usage --verify ABSOLUTE_EXTERNAL_WASM_DIR',64);
 if(!existsSync(location))return stop('BLOCKED-ENV: missing artifact',78);
 const dir=realpathSync(location),src=realpathSync(repo);
 if(dir===src||dir.startsWith(src+sep))
  return stop('DENY: artifact directory inside repo',64);
 const read=name=>{
  const path=join(dir,name);
  if(lstatSync(path).isSymbolicLink())throw Error('DENY: artifact symlink '+name);
  return readFileSync(path);
 };
 // RUN P19 source-identity, exact toolchain/source-input SHA, ABI and REAL
 // native W03 clock fixture checks FIRST; this is not merely init.
 const legacy=spawnSync(process.execPath,[
   join(here,'verify_phase19_clock_node.mjs'),'--verify',dir
 ],{encoding:'utf8',timeout:45000});
 if(legacy.status!==0 || !legacy.stdout.includes('PHASE19_NODE_DYNAMIC_REAL_W03_CLOCK_PASS'))
  return stop('BLOCKED-PROVENANCE: legacy same-Wasm dynamic source/clock gate failed: '+
   (legacy.stderr||legacy.stdout),legacy.status===78?78:65);
 const manifest=JSON.parse(read('phase18_artifact_manifest.json').toString('utf8'));
 const wasmBytes=read('frame_loop.wasm'),mjsBytes=read('frame_loop.mjs');
 const wasmDigest=hash(wasmBytes),mjsDigest=hash(mjsBytes);
 const build=read('phase20_service_build_info.txt').toString('utf8');
 if(!build.includes('Source_Git_SHA '+manifest.head) ||
    !build.includes('Docker_Image_ID sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a')||
    !build.includes('ABI_Version 1')||
    !build.includes('Private_W03_Quota 1')||
    !build.includes(wasmDigest+'  '+join(dir,'frame_loop.wasm'))||
    !build.includes(mjsDigest+'  '+join(dir,'frame_loop.mjs')))
   throw Error('DENY: missing/mismatched P20 exact source+bin+W03 quota metadata');
 for(const relative of [
   'web-runtime/frame-host/phase20_service_fixture.inc',
   'web-runtime/frame-host/frame_loop.cpp',
   'web-runtime/frame-host/scheduler_clock.hpp',
   'web-runtime/frame-host/trusted_cpu_service.hpp',
   'web-runtime/runtime-services/synthetic_service_dispatch.hpp',
   'web-runtime/frame-host/build_phase20_container.sh'
 ]) {
  const abs=join(repo,relative);
  if(!build.includes(hash(readFileSync(abs))+'  '+abs))
   throw Error('DENY: Phase20 private service source/ABI script SHA '+relative);
 }
 if(!WebAssembly.validate(wasmBytes))throw Error('DENY: invalid Wasm');
 const exports=WebAssembly.Module.exports(new WebAssembly.Module(wasmBytes)).map(x=>x.name);
 for(const name of [
  'nsmbw_loop_synthetic_service_fixture_spawn',
  'nsmbw_loop_synthetic_service_fixture_retry',
  'nsmbw_loop_synthetic_service_quota',
  'nsmbw_loop_synthetic_service_id',
  'nsmbw_loop_clock_ticks_hi','nsmbw_loop_clock_ticks_lo',
  'nsmbw_loop_clock_revision_lo','nsmbw_loop_cpu_gpr','nsmbw_loop_tick'
 ])if(!exports.includes(name))throw Error('DENY: missing NEW PHASE20 real W03 export '+name);
 if(exports.some(n=>/leaseSynthetic|forgeForNativeTest|armCanonicalClock|CpuContext|quota_grant|quota_set|OSGetTime/.test(n)))
  throw Error('DENY: native issuer/quota setter or pretend Nintendo HLE exported');
 const began=performance.now();
 const createModule=(await import(pathToFileURL(join(dir,'frame_loop.mjs')).href)).default;
 const mod=await createModule({locateFile:name=>join(dir,name)});
 const initMs=performance.now()-began;
 const result=runPrivateServiceFixture(mod,{stressCount:1024});
 if(result.checks<25||result.stressCount!==1024||
    result.exampleRemainingQuota!=='0')
  throw Error('DENY: insufficient REAL W03 quota functional proof');
 const proof={
  schema:'nsmb-phase20-native-quota-clock-v1',
  sourceHead:manifest.head,wasmSha256:wasmDigest,mjsSha256:mjsDigest,
  oracleSha256:hash(readFileSync(new URL('../../tests/phase20/peach/private_service_oracle.mjs',import.meta.url))),
  imageId:'sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a',
  abiVersion:1,serviceIds:['0x53560001','0x53560002'],
  truth:'public fictional guest and value, PRIVATE W03 quota, NOT Wii HLE',
  node:{...result,initMs}
 };
 const output=join(dir,'phase20_service_node_proof.json');
 if(existsSync(output)){
  const prev=JSON.parse(read('phase20_service_node_proof.json').toString('utf8'));
  if(prev.sourceHead!==proof.sourceHead||prev.wasmSha256!==proof.wasmSha256||
     prev.mjsSha256!==proof.mjsSha256||prev.oracleSha256!==proof.oracleSha256||
     prev.node?.checks!==proof.node.checks||
     prev.node?.stressCount!==proof.node.stressCount)
   throw Error('DENY: previous proof differs in immutable source/bin/oracle/functional count');
 }else writeFileSync(output,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
 console.log('PHASE20_NODE_REAL_PRIVATE_QUOTA_PASS',wasmDigest,
  'source',manifest.head,'checks',result.checks,'stress',result.stressCount);
 console.log('PHASE20_NODE_INIT_MS',initMs.toFixed(3),
  'STRESS_MS',result.stressMs.toFixed(3),'WASM_BYTES',wasmBytes.length);
}
await main().catch(error=>stop(String(error?.stack||error)));
