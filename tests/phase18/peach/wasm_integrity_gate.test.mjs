// PHASE18 *negative* product gate: no Emscripten/REA installed and no reviewed
// peer headers in Peach's isolated branch. Never treat an old/fake Wasm as PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const shell=join(root,'web-runtime/frame-host/rebuild_phase18_user.sh');
const verify=join(root,'web-runtime/frame-host/verify_phase18_wasm.mjs');
const browser=join(root,'web-runtime/frame-host/verify_phase18_browser.mjs');
function sandbox(t){
 const dir=mkdtempSync(join(tmpdir(),'nsmb18-wasm-guard-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 return dir;
}
test('Phase18 --probe fails closed if pure peer header or authorized compiler missing',t=>{
 const dir=sandbox(t);
 const p=spawnSync('/bin/sh',[shell,'--probe'],{
  cwd:dir,encoding:'utf8',timeout:15000});
 assert.equal(p.status,78,p.stderr);
 assert.match(p.stderr,/BLOCKED-(PEER-API|ENV)/);
});
test('Phase18 absolute CLI requirement denies relative before compiling or mkdir',t=>{
 const dir=sandbox(t);
 for(const arg of ['relative-output','./relative path','../relative']) {
  const p=spawnSync('/bin/sh',[shell,'--build',arg],{
    cwd:dir,encoding:'utf8',timeout:15000});
  assert.equal(p.status,64,p.stderr);
  assert.match(p.stderr,/absolute|DENY/i);
 }
 assert.equal(existsSync(join(dir,'relative-output')),false);
 assert.equal(existsSync(join(dir,'relative path')),false);
});
test('Phase18 will not write a source-tree destination even if absolute',t=>{
 const dir=sandbox(t);
 for(const out of [root,join(root,'web-runtime/frame-host/dist'),
   join(root,'docs/phase18/cpu/../unsafe')]) {
  const p=spawnSync('/bin/sh',[shell,'--build',out],{
    cwd:dir,encoding:'utf8',timeout:15000});
  assert.equal(p.status,64,p.stderr);
  assert.match(p.stderr,/DENY/i);
 }
});
test('Phase18 external output cannot be built without peer header/toolchain',t=>{
 const dir=sandbox(t);
 const path=join(dir,'external-empty');
 const p=spawnSync('/bin/sh',[shell,'--build',path],{
  cwd:dir,encoding:'utf8',timeout:15000});
 assert.equal(p.status,78,p.stderr);
 assert.match(p.stderr,/BLOCKED-(PEER-API|ENV)/);
 assert.equal(existsSync(path),false,'blocked build must not create even empty output');
});
test('Phase18 static verifier never accepts an arbitrary empty or stale artifact',t=>{
 const dir=sandbox(t);
 const p=spawnSync('node',[verify,'--verify',dir],{
  cwd:root,encoding:'utf8',timeout:15000});
 assert.notEqual(p.status,0,'empty directory was falsely labeled Wasm PASS');
 assert.match(p.stderr,/BLOCKED-|ENOENT|DENY|invalid|missing/i);
 assert.equal(existsSync(join(dir,'phase18_artifact_manifest.json')),false);
});
test('Phase18 verifier never writes a manifest inside tracked Git worktree',t=>{
 const dir=sandbox(t);
 const p=spawnSync('node',[verify,'--create',root],{
  cwd:dir,encoding:'utf8',timeout:15000});
 assert.equal(p.status,64,p.stderr);
 assert.match(p.stderr,/DENY/i);
});
test('Phase18 tool wrapper and product verifier reject malformed CLI inputs',t=>{
 const dir=sandbox(t);
 for(const args of [[],['--build'],['--probe','extra'],['--bogus']]) {
  const p=spawnSync('/bin/sh',[shell,...args],{
    cwd:dir,encoding:'utf8',timeout:15000});
  assert.equal(p.status,64,p.stderr);
 }
 for(const args of [[],['--verify'],['--create','./relative'],
                     ['--verify',root,'extra']]) {
  const p=spawnSync('node',[verify,...args],{
    cwd:dir,encoding:'utf8',timeout:15000});
  assert.notEqual(p.status,0);
 }
});

test('real Chromium proof gate refuses absent explicit browser even with output directory',t=>{
 const dir=sandbox(t);
 const p=spawnSync('node',[browser,'--verify',dir],{
   cwd:dir,env:{...process.env,NSMB_BROWSER:''},encoding:'utf8',timeout:15000});
 assert.equal(p.status,78,p.stderr);
 assert.match(p.stderr,/BLOCKED-ENV.*NSMB_BROWSER/);
});
