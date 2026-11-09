// Phase17: command-line safety contract for an OPTIONAL synthetic Wasm builder.
// A fake em++ records any invocation and exits 42. These tests NEVER compile
// Wii/Nintendo material, download SDKs, run privileged commands or touch main.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,symlinkSync,rmSync,copyFileSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const script=join(repo,'web-runtime/frame-host/rebuild_phase17_user.sh');
function harness(t,{fakeCompiler=true,isolatedPath=false}={}) {
  const dir=mkdtempSync(join(tmpdir(),'nsmb-p17-builder-contract-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const bin=join(dir,'fake-bin');
  const marker=join(dir,'compiler-called.txt');
  mkdirSync(bin);
  // Parent script needs dirname to resolve its own source path.
  if(isolatedPath) symlinkSync('/usr/bin/dirname',join(bin,'dirname'));
  if(fakeCompiler) writeFileSync(join(bin,'em++'),
    '#!/bin/sh\nprintf "FAKE_COMPILER_INVOKED\\n" >> "$FAKE_EMXX_MARKER"\nexit 42\n',
    {mode:0o755});
  const env={
    ...process.env,
    PATH:isolatedPath?bin:bin+':'+process.env.PATH,
    FAKE_EMXX_MARKER:marker
  };
  function run(args,{cwd=dir}={}) {
    return spawnSync('/bin/sh',[script,...args],{
      cwd,env,encoding:'utf8',timeout:15000
    });
  }
  function noCompiler() {
    assert.equal(existsSync(marker),false,'fake em++ was unexpectedly invoked');
  }
  return {dir,bin,marker,run,noCompiler};
}
function denied(h,args,{code=64,absent=null}={}) {
  const result=h.run(args);
  assert.equal(result.status,code,JSON.stringify({
    stderr:result.stderr,stdout:result.stdout,error:result.error?.message
  }));
  if(absent!==null) assert.equal(existsSync(absent),false,
    'rejected destination created a directory');
  h.noCompiler();
  return result;
}

test('RED/GREEN: relative --build path is rejected BEFORE realpath (no mkdir or fake compiler)',t=>{
  const h=harness(t);
  const relative='relative-output';
  const result=denied(h,['--build',relative],{absent:join(h.dir,relative)});
  assert.match(result.stderr,/absolute|DENY/i);
});
test('relative dot, parent traversal and paths containing spaces are all denied early',t=>{
  const h=harness(t);
  for(const relative of ['./subdir','../sibling-not-allowed','nested/../output',
                         'dir with spaces/output','.', '..']) {
    const result=denied(h,['--build',relative]);
    assert.match(result.stderr,/absolute|DENY/i);
  }
});
test('absolute output inside the Git worktree is denied even with traversal',t=>{
  const h=harness(t);
  for(const candidate of [repo,join(repo,'web-runtime/frame-host/dist'),
      join(repo,'docs/phase17/cpu/../unsafe-build')]) {
    const result=denied(h,['--build',candidate]);
    assert.match(result.stderr,/DENY/i);
  }
});
test('absolute symlink from outside pointing into repository is DENIED',t=>{
  const h=harness(t);
  const link=join(h.dir,'alias-to-source');
  symlinkSync(repo,link,'dir');
  const result=denied(h,['--build',join(link,'synthetic-artifacts')]);
  assert.match(result.stderr,/DENY/i);
  assert.equal(existsSync(join(repo,'synthetic-artifacts')),false);
});
test('absolute existing non-empty output is denied without invoking em++',t=>{
  const h=harness(t);
  const out=join(h.dir,'nonempty');
  mkdirSync(out);
  writeFileSync(join(out,'sentinel.txt'),'must remain intact\n');
  const result=denied(h,['--build',out]);
  assert.match(result.stderr,/DENY|not empty/i);
  assert.equal(readFileSync(join(out,'sentinel.txt'),'utf8'),'must remain intact\n');
});
test('absolute output path containing spaces reaches ONLY the fake compiler',t=>{
  const h=harness(t);
  const out=join(h.dir,'safe absolute output with spaces');
  const result=h.run(['--build',out]);
  assert.equal(result.status,42,result.stderr);
  assert.equal(readFileSync(h.marker,'utf8'),'FAKE_COMPILER_INVOKED\n');
  assert.equal(existsSync(out),true);
  assert.equal(existsSync(join(out,'frame_loop.wasm')),false,
    'fake compiler must never be counted as a successful Wasm build');
});
test('absolute symlink to safe outside empty directory stays outside repository',t=>{
  const h=harness(t);
  const target=join(h.dir,'safe-real-target');
  mkdirSync(target);
  const link=join(h.dir,'safe-link');
  symlinkSync(target,link,'dir');
  const result=h.run(['--build',link]);
  assert.equal(result.status,42,result.stderr);
  assert.equal(readFileSync(h.marker,'utf8'),'FAKE_COMPILER_INVOKED\n');
  assert.equal(existsSync(join(repo,'safe-real-target')),false);
});
test('lexical path INSIDE a checkout symlinked OUT is denied before compiler',t=>{
  const h=harness(t);
  // Use a disposable fake checkout; NEVER create a symlink in the actual repo.
  const fakeRepo=join(h.dir,'temporary-checkout');
  const fakeFrame=join(fakeRepo,'web-runtime','frame-host');
  mkdirSync(fakeFrame,{recursive:true});
  const fakeBuilder=join(fakeFrame,'rebuild_phase17_user.sh');
  copyFileSync(script,fakeBuilder);
  const outside=join(h.dir,'safe-outside-source');
  mkdirSync(outside);
  const alias=join(fakeRepo,'alias-going-outside');
  symlinkSync(outside,alias,'dir');
  const forbidden=join(alias,'should-not-be-created');
  const result=spawnSync('/bin/sh',[fakeBuilder,'--build',forbidden],{
    cwd:h.dir,env:{...process.env,PATH:h.bin+':'+process.env.PATH,
      FAKE_EMXX_MARKER:h.marker},encoding:'utf8',timeout:15000
  });
  assert.equal(result.status,64,result.stderr);
  assert.match(result.stderr,/DENY.*worktree/i);
  assert.equal(existsSync(join(outside,'should-not-be-created')),false);
  h.noCompiler();
});
test('relative argument is denied even if realpath itself is missing',t=>{
  const h=harness(t,{fakeCompiler:true,isolatedPath:true});
  const result=denied(h,['--build','relative-no-realpath'],{
    code:64,absent:join(h.dir,'relative-no-realpath')
  });
  assert.match(result.stderr,/absolute/i);
});
test('--probe without em++ returns BLOCKED-ENV 78 and invokes nothing',t=>{
  const h=harness(t,{fakeCompiler:false,isolatedPath:true});
  const result=denied(h,['--probe'],{code:78});
  assert.match(result.stderr,/BLOCKED-ENV.*em\+\+/i);
});
test('--build absolute path without realpath returns BLOCKED-ENV 78 without mkdir',t=>{
  const h=harness(t,{fakeCompiler:true,isolatedPath:true});
  const out=join(h.dir,'should-not-appear');
  const result=denied(h,['--build',out],{code:78,absent:out});
  assert.match(result.stderr,/BLOCKED-ENV.*realpath/i);
});
test('bad CLI argument count is rejected without invoking compiler',t=>{
  const h=harness(t);
  for(const args of [[],['--build'],['--build','/tmp/x','extra'],
                     ['--probe','extra'],['--unknown']]) {
    denied(h,args);
  }
});
