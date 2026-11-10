// PHASE20 NEGATIVE ARTIFACT QA: only disposable /tmp copies of exact
// physically compiled three-Git-SHA new Emscripten Wasm. A self-reported
// source manifest NEVER constitutes independent producer authenticity.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,copyFileSync,rmSync,
  symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const verifier=join(repo,'web-runtime/frame-host/verify_phase20_three_sha_node.mjs');
const [op,source,toad,luigi,...extra]=process.argv.slice(2);
if(op!=='--verify'||!source||!isAbsolute(source)||extra.length||
   !/^[a-f0-9]{40}$/.test(toad||'')||!/^[a-f0-9]{40}$/.test(luigi||''))
 throw Error('Usage: --verify ABSOLUTE_OUTPUT TOAD_SHA LUIGI_SHA');
const files=['frame_loop.wasm','frame_loop.mjs','phase20_three_sha_build_manifest.txt',
  'phase20_three_sha_node_proof.json'];
for(const f of files)assert.ok(existsSync(join(source,f)),'missing original '+f);
function checked(dir){
 return spawnSync(process.execPath,[verifier,'--verify',dir,toad,luigi],{
  encoding:'utf8',timeout:35000,env:{...process.env,LD_LIBRARY_PATH:'',
    LD_PRELOAD:''}
 });
}
const positive=checked(source);
assert.equal(positive.status,0,positive.stderr||positive.stdout);
let denied=0;
function mutation(name,change){
 const scratch=mkdtempSync(join(tmpdir(),'nsmb-p20-peach-tamper-'));
 try {
  for(const f of files)copyFileSync(join(source,f),join(scratch,f));
  const meta=join(scratch,'phase20_three_sha_build_manifest.txt');
  const text=readFileSync(meta,'utf8');
  // Original output hashes embed a path to the real build. Copying a clean
  // artifact does NOT constitute tampering; rewrite ONLY the path part for
  // the isolated destination, preserve EVERY SHA/value byte.
  writeFileSync(meta,text.split(source+'/').join(scratch+'/'));
  const baseline=checked(scratch);
  assert.equal(baseline.status,0,'untampered copied baseline must PASS '+name+
    '\n'+baseline.stderr+'\n'+baseline.stdout);
  change(scratch);
  const result=checked(scratch);
  assert.notEqual(result.status,0,'TAMPER_ESCAPED '+name+'\n'+result.stdout);
  assert.match(result.stderr,/DENY|BLOCKED|Error/,
    'failure must be source/ABI/proof denial '+name+'\n'+result.stderr);
  denied++;console.log('RED_TAMPER_DENIED',name,'exit',result.status);
 }finally {rmSync(scratch,{recursive:true,force:true});}
}
function edit(dir,name,from,to){
 const p=join(dir,name);const text=readFileSync(p,'utf8');
 assert.ok(text.includes(from),'expected exact source '+name+' '+from);
 writeFileSync(p,text.replace(from,to));
}
mutation('Wasm one byte',d=>{
 const p=join(d,'frame_loop.wasm'),b=readFileSync(p);
 b[b.length-1]^=1;writeFileSync(p,b);
});
mutation('MJS comment changes bytes',d=>edit(d,'frame_loop.mjs',
 'export','/* forged */ export'));
mutation('Toad source SHA forged',d=>edit(d,'phase20_three_sha_build_manifest.txt',
 'Toad_HEAD '+toad,'Toad_HEAD '+'0'.repeat(40)));
mutation('Luigi source SHA forged',d=>edit(d,'phase20_three_sha_build_manifest.txt',
 'Luigi_HEAD '+luigi,'Luigi_HEAD '+'0'.repeat(40)));
mutation('compiler image ID forged',d=>edit(d,'phase20_three_sha_build_manifest.txt',
 'Docker_Image_ID sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a',
 'Docker_Image_ID sha256:'+'0'.repeat(64)));
mutation('linker feature flags omitted',d=>edit(d,'phase20_three_sha_build_manifest.txt',
 'Macros -DNSMB_P20_ENABLE_TOY_LEAF -DNSMB_P20_ENABLE_SERVICE_V2',
 'Macros -DNSMB_P20_ENABLE_TOY_LEAF'));
mutation('one physical source blob hash replaced',d=>{
 const p=join(d,'phase20_three_sha_build_manifest.txt');
 const m=readFileSync(p,'utf8');
 const found=m.match(/^([a-f0-9]{64})  scripts\/phase20\/luigi\/toy_leaf_generated.cpp$/m);
 assert.ok(found,'expected source from independent Luigi');
 writeFileSync(p,m.replace(found[1],'0'.repeat(64)));
});
mutation('forged physical Node proof functional assertions',d=>{
 const p=join(d,'phase20_three_sha_node_proof.json');
 const m=JSON.parse(readFileSync(p,'utf8'));m.node.checks=999;
 writeFileSync(p,JSON.stringify(m));
});
mutation('forged Node proof C++ source fingerprint',d=>{
 const p=join(d,'phase20_three_sha_node_proof.json');
 const m=JSON.parse(readFileSync(p,'utf8'));m.peach='0'.repeat(40);
 writeFileSync(p,JSON.stringify(m));
});
mutation('Wasm symlink into external source',d=>{
 const p=join(d,'frame_loop.wasm');rmSync(p);symlinkSync(join(source,'frame_loop.wasm'),p);
});
mutation('unreviewed typed WASM import',d=>{
 const p=join(d,'frame_loop.wasm'),b=readFileSync(p);
 const ix=b.indexOf(Buffer.from('env'));assert.ok(ix>0);
 b.write('net',ix,'utf8');assert.ok(WebAssembly.validate(b));
 writeFileSync(p,b);
});
assert.equal(denied,11);
console.log('PHASE20_THREE_SHA_ARTIFACT_RED_11_11_PASS');
