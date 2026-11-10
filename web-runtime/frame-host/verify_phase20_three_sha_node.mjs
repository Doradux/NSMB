#!/usr/bin/env node
// P20 physical three exact immutable Git-source snapshots -> new Emscripten
// Wasm -> REAL W03 translated PPC-Lite + Toad V2 + PRIVATE quota in Node.
// These are invented public test assets, NOT C# or Nintendo provenance.
import {readFileSync,writeFileSync,existsSync,realpathSync,lstatSync} from 'node:fs';
import {resolve,join,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {runPeerToyService} from '../../tests/phase20/peach/peer_toy_wasm_oracle.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)),repo=resolve(here,'../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
function fail(s,code=65){console.error(s);process.exitCode=code;}
function git(args){
 const r=spawnSync('git',['-C',repo,...args],{timeout:10000,maxBuffer:1500000});
 if(r.status!==0)throw Error('DENY: missing Git object '+args.join(' '));
 return r.stdout;
}
async function main(){
 const [flag,where,toad,luigi,...rest]=process.argv.slice(2);
 if(flag!=='--verify'||!where||rest.length||!isAbsolute(where)||
    !/^[a-f0-9]{40}$/.test(toad||'')||!/^[a-f0-9]{40}$/.test(luigi||''))
  return fail('DENY: Usage --verify ABSOLUTE_OUTPUT TOAD_SHA40 LUIGI_SHA40',64);
 if(!existsSync(where))return fail('BLOCKED-ENV: new Wasm artifact absent',78);
 const dir=realpathSync(where),src=realpathSync(repo);
 if(dir===src||dir.startsWith(src+sep))return fail('DENY: product inside Git worktree',64);
 const read=n=>{
  const p=join(dir,n);
  if(lstatSync(p).isSymbolicLink())throw Error('DENY: symlink artifact '+n);
  return readFileSync(p);
 };
 const meta=read('phase20_three_sha_build_manifest.txt').toString('utf8');
 const head=git(['rev-parse','HEAD']).toString('utf8').trim();
 if(head!==meta.match(/^Peach_HEAD ([a-f0-9]{40})$/m)?.[1]||
    toad!==meta.match(/^Toad_HEAD ([a-f0-9]{40})$/m)?.[1]||
    luigi!==meta.match(/^Luigi_HEAD ([a-f0-9]{40})$/m)?.[1]||
    !meta.includes('Docker_Image_ID sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a')||
    !meta.includes('Macros -DNSMB_P20_ENABLE_TOY_LEAF -DNSMB_P20_ENABLE_SERVICE_V2'))
   throw Error('DENY: mismatch exact 3-SHA compiled source identity/options');
 if(git(['status','--porcelain=v1']).toString('utf8').trim())
   throw Error('DENY: own source dirty; review exact committed source only');
 const entries=meta.match(/^([a-f0-9]{64})  (web-runtime\/[^\n]+|scripts\/phase20\/luigi\/[^\n]+)$/gm)||[];
 if(entries.length!==18)throw Error('DENY: expected EXACT 18 source input blobs, got '+entries.length);
 const seen=new Set();
 for(const entry of entries){
  const [,sum,path]=entry.match(/^([a-f0-9]{64})  (.+)$/);
  if(path.includes('..')||path.startsWith('/')||seen.has(path))
   throw Error('DENY: repeated/unsafe source path '+path);
  seen.add(path);
  const owner=path==='web-runtime/runtime-services/synthetic_service_v2.hpp'
    ?toad:path.startsWith('scripts/phase20/luigi/')?luigi:head;
  const content=git(['show',owner+':'+path]);
  if(sha(content)!==sum)throw Error('DENY: source blob SHA mismatch '+path);
 }
 for(const mandatory of ['web-runtime/frame-host/frame_loop.cpp',
   'web-runtime/frame-host/phase20_service_fixture.inc',
   'web-runtime/runtime-services/synthetic_service_v2.hpp',
   'scripts/phase20/luigi/toy_leaf_generated.cpp',
   'scripts/phase20/luigi/toy_leaf_abi.hpp'])
  if(!seen.has(mandatory))throw Error('DENY: missing obligatory 3-SHA source '+mandatory);
 const wasm=read('frame_loop.wasm'),mjs=read('frame_loop.mjs');
 const wasmSha=sha(wasm),mjsSha=sha(mjs);
 if(!meta.includes(wasmSha+'  '+join(dir,'frame_loop.wasm'))||
    !meta.includes(mjsSha+'  '+join(dir,'frame_loop.mjs')))
   throw Error('DENY: byte digest mismatch compilation output');
 if(!WebAssembly.validate(wasm))throw Error('DENY: invalid WebAssembly');
 const module=new WebAssembly.Module(wasm);
 const imports=WebAssembly.Module.imports(module);
 if(imports.length!==1||imports[0].module!=='env'||
   imports[0].name!=='emscripten_resize_heap')
  throw Error('DENY: unsafe Wasm imports '+JSON.stringify(imports));
 const exports=WebAssembly.Module.exports(module).map(x=>x.name);
 for(const name of ['nsmbw_loop_synthetic_toy_leaf_fixture_spawn',
   'nsmbw_loop_synthetic_service_fixture_spawn',
   'nsmbw_loop_synthetic_service_quota','nsmbw_loop_tick',
   'nsmbw_loop_cpu_gpr','nsmbw_loop_clock_ticks_hi',
   'nsmbw_loop_clock_ticks_lo','nsmbw_loop_clock_revision_lo'])
  if(!exports.includes(name))throw Error('DENY: toy and native W03 not linked '+name);
 if(exports.some(n=>/leaseSynthetic|armCanonicalClock|forgeForNativeTest|CpuContext|OSGetTime|quota_grant|quota_set/.test(n)))
  throw Error('DENY: private W03 issuer or HLE unexpectedly exported');
 const start=performance.now();
 const create=(await import(pathToFileURL(join(dir,'frame_loop.mjs')).href)).default;
 const instance=await create({locateFile:name=>join(dir,name)});
 const initMs=performance.now()-start;
 const result=runPeerToyService(instance,{stressCount:1024});
 if(result.checks<20||result.stressCount!==1024||
    result.exampleTicks!=='118'||result.examplePrivateQuota!=='0')
  throw Error('DENY: failed REAL W03 translated leaf+V2 quota assertion count');
 const oracleSha=sha(readFileSync(new URL('../../tests/phase20/peach/peer_toy_wasm_oracle.mjs',import.meta.url)));
 const proof={schema:'nsmb-p20-3sha-real-generated-toy-W03-v1',peach:head,toad,luigi,
  wasmSha256:wasmSha,mjsSha256:mjsSha,oracleSha256:oracleSha,
  origin:'3 immutable public Git snapshots, no authentic Nintendo/C# trust',
  node:{...result,initMs}};
 const output=join(dir,'phase20_three_sha_node_proof.json');
 if(existsSync(output)){
  const previous=JSON.parse(read('phase20_three_sha_node_proof.json').toString('utf8'));
  for(const field of ['peach','toad','luigi','wasmSha256','mjsSha256','oracleSha256'])
   if(previous[field]!==proof[field])throw Error('DENY: previous proof changed '+field);
  if(previous.node?.checks!==proof.node.checks||
     previous.node?.stressCount!==proof.node.stressCount)
   throw Error('DENY: functional proof count changed');
 }else writeFileSync(output,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
 console.log('PHASE20_THREE_SHA_NODE_REAL_TOY_W03_V2_PASS',wasmSha,
  'source',head,'toad',toad,'luigi',luigi,
  'checks',result.checks,'stress',result.stressCount);
 console.log('PHASE20_NODE_INIT_MS',initMs.toFixed(3),'STRESS_MS',result.stressMs.toFixed(3),
  'WASM_BYTES',wasm.length);
}
await main().catch(e=>fail(String(e?.stack||e)));
