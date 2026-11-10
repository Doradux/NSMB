#!/usr/bin/env node
// Adversarial exact-artifact tamper matrix. Requires a REAL fresh built
// public synthetic Wasm + Node dynamic proof. Copies ONLY to disposable /tmp;
// NEVER edits tracked dist, Git source, Nintendo assets or the original output.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,copyFileSync,rmSync,existsSync,symlinkSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const verifier=join(root,'web-runtime/frame-host/verify_phase19_clock_node.mjs');
const [op,source,...rest]=process.argv.slice(2);
if(op!=='--verify'||!source||rest.length||!isAbsolute(source))
  throw Error('Usage: node fresh_wasm_supplychain.mjs --verify ABSOLUTE_REAL_NEW_WASM_DIR');
const names=[
  'frame_loop.wasm','frame_loop.mjs','build_manifest.txt',
  'phase18_artifact_manifest.json','phase19_build_info.txt',
  'phase19_node_clock_proof.json'
];
for(const file of names) assert.ok(existsSync(join(source,file)),'missing real artifact '+file);
function run(directory){
 return spawnSync(process.execPath,[verifier,'--verify',directory],{
   encoding:'utf8',timeout:30000
 });
}
const good=run(source);
assert.equal(good.status,0,good.stderr||good.stdout);
assert.match(good.stdout,/PHASE19_NODE_DYNAMIC_REAL_W03_CLOCK_PASS/);
let controls=0;
const validate=(label,mutate)=>{
  const scratch=mkdtempSync(join(tmpdir(),'nsmb-p19-peach-supplychain-'));
  try{
    for(const name of names)copyFileSync(join(source,name),join(scratch,name));
    mutate(scratch);
    const result=run(scratch);
    assert.notEqual(result.status,0,
      label+': malicious artifact bypassed source+dynamic gate\n'+result.stdout);
    assert.match(result.stderr,/BLOCKED-PROVENANCE|DENY|BLOCKED-ABI/,
      label+': unexpected failure mode '+result.stderr);
    ++controls;
    console.log('RED_TAMPER_DETECTED',label,'exit',result.status);
  }finally{rmSync(scratch,{recursive:true,force:true});}
};
validate('wasm-byte-changed',dir=>{
  const p=join(dir,'frame_loop.wasm');
  const bytes=readFileSync(p);bytes[bytes.length-1]^=0x01;writeFileSync(p,bytes);
});
validate('mjs-harmless-comment-changed',dir=>{
  const p=join(dir,'frame_loop.mjs');
  writeFileSync(p,readFileSync(p,'utf8')+'\n// malicious replacement\n');
});
validate('old-dist-wasm-substituted',dir=>{
  const old=join(root,'web-runtime/frame-host/dist/frame_loop.wasm');
  assert.ok(existsSync(old),'legacy dist fixture expected');
  copyFileSync(old,join(dir,'frame_loop.wasm'));
});
validate('source-HEAD-manifest-forged',dir=>{
  const p=join(dir,'phase18_artifact_manifest.json');
  const m=JSON.parse(readFileSync(p,'utf8'));
  m.head='0'.repeat(40);writeFileSync(p,JSON.stringify(m));
});
validate('source-file-SHA-manifest-forged',dir=>{
  const p=join(dir,'phase18_artifact_manifest.json');
  const m=JSON.parse(readFileSync(p,'utf8'));
  m.files['web-runtime/frame-host/frame_loop.cpp']='0'.repeat(64);
  writeFileSync(p,JSON.stringify(m));
});
validate('wrong-pinned-docker-image',dir=>{
  const p=join(dir,'phase19_build_info.txt');
  writeFileSync(p,readFileSync(p,'utf8')
    .replace('sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a',
             'sha256:'+'0'.repeat(64)));
});
validate('compilation-toolchain-version-forged',dir=>{
  const p=join(dir,'build_manifest.txt');
  writeFileSync(p,readFileSync(p,'utf8').replace('6.0.13','6.0.12'));
});
validate('compiler-flags-record-forged',dir=>{
  const p=join(dir,'phase19_build_info.txt');
  writeFileSync(p,readFileSync(p,'utf8')
    .replace('Compile_CXX_Flags -std=c++17 -O2',
             'Compile_CXX_Flags -std=c++17 -O0'));
});
validate('build-script-content-hash-forged',dir=>{
  const p=join(dir,'phase19_build_info.txt');
  const original=readFileSync(p,'utf8');
  const m=original.match(/([0-9a-f]{64})  [^\n]*build_phase19_container\.sh/);
  assert.ok(m,'expected exact build script SHA in output');
  writeFileSync(p,original.replace(m[1],'0'.repeat(64)));
});
validate('compiler-source-input-SHA-forged',dir=>{
  const p=join(dir,'build_manifest.txt');
  const original=readFileSync(p,'utf8');
  const hash=original.match(/([0-9a-f]{64})  \/work\/web-runtime\/frame-host\/frame_loop.cpp/);
  assert.ok(hash,'real build manifest must include frame_loop.cpp');
  writeFileSync(p,original.replace(hash[1],'0'.repeat(64)));
});
validate('forged-Node-functional-assertion-count',dir=>{
  const p=join(dir,'phase19_node_clock_proof.json');
  const m=JSON.parse(readFileSync(p,'utf8'));
  m.node.checks=0;writeFileSync(p,JSON.stringify(m));
});
validate('symlinked-artifact-in-output',dir=>{
  const p=join(dir,'frame_loop.wasm');rmSync(p);
  symlinkSync(join(source,'frame_loop.wasm'),p);
});
validate('unknown-network-import-in-Wasm',dir=>{
  const p=join(dir,'frame_loop.wasm');
  const bytes=readFileSync(p);
  const index=bytes.indexOf(Buffer.from('env'));
  assert.ok(index>0,'expect env import string');
  bytes.write('net',index,'utf8');
  assert.ok(WebAssembly.validate(bytes),
    'adversarial unknown import must remain valid binary for ABI test');
  writeFileSync(p,bytes);
});
assert.equal(controls,13);
console.log('PHASE19_FRESH_ARTIFACT_SUPPLYCHAIN_RED_13_13_PASS');
console.log('IMPORTANT: self-generated hash manifest is not a trusted producer signature');
