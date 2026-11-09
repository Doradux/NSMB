// Read-only exact-SHA Toad source overlay + ACTUAL W03/W04/W07 C++ E2E.
// Does NOT cherry-pick/copy into tracked Git nor edit Toad's worktree.
// No Emscripten/ROM/Wii original here: pure C++ native source test only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const peerSha=process.env.NSMB_TOAD_P18_SHA ||
  'a6e7343c722648b2b705e7d887dbac9d934d2e7b';
const purePaths=['web-runtime/runtime-services/time64_pure_candidate.hpp',
  'web-runtime/runtime-services/time64_pure_clock.hpp'];
const sources=[
  'tests/phase18/peach/pure_time64_w03_e2e_native.cpp',
  'web-runtime/frame-host/frame_loop.cpp',
  'web-runtime/frame-host/guest_cpu.cpp',
  'web-runtime/frame-host/translator_abi_fixture.cpp',
  'web-runtime/src/guest_memory.cpp',
  'web-runtime/interop/synthetic_guest.cpp',
  'web-runtime/interop/device_policy.cpp',
  'web-runtime/runtime-services/input_snapshot.cpp'
].map(f=>join(root,f));
test('Toad SHA-pinned PURE numeric source feeds REAL W03 single-ledger scheduler transaction',t=>{
  assert.match(peerSha,/^[0-9a-f]{40}$/);
  const scratch=mkdtempSync(join(tmpdir(),'nsmb-p18-peach-toad-'));
  t.after(()=>rmSync(scratch,{recursive:true,force:true}));
  const peerSources=purePaths.map(path=>{
    const result=spawnSync('git',['show',peerSha+':'+path],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(result.status,0,result.stderr||result.error?.message);
    assert.doesNotMatch(result.stdout,/class\s+TransactionService|struct\s+CpuContext|#include\s+<mutex>/);
    return {path,source:result.stdout};
  });
  const overlay=join(scratch,'web-runtime');
  mkdirSync(join(overlay,'frame-host'),{recursive:true});
  mkdirSync(join(overlay,'runtime-services'),{recursive:true});
  for(const {path,source} of peerSources){
    const expected=join(scratch,path);
    writeFileSync(expected,source);
    assert.equal(createHash('sha256').update(readFileSync(expected)).digest('hex'),
      createHash('sha256').update(source).digest('hex'));
  }
  const binary=join(scratch,'w03-e2e');
  const compile=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
    '-Werror','-pedantic','-I'+join(overlay,'frame-host'),
    ...sources,'-o',binary],{encoding:'utf8',timeout:50000});
  assert.equal(compile.status,0,compile.stderr||compile.error?.message);
  const run=spawnSync(binary,[],{encoding:'utf8',timeout:15000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const match=run.stdout.match(/TOTAL_CHECKS (\d+)\s*$/);
  assert.ok(match,'missing native success summary: '+run.stdout);
  assert.ok(Number(match[1])>=30,'too few cross-header native assertions');
  assert.equal((run.stdout.match(/^PASS /gm)||[]).length,Number(match[1]));
});
