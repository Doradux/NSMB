// PHASE18: actual C++ W03/W04/W07 guest runtime; no JS shadow CPU/ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const sources=[
  'tests/phase18/peach/canonical_clock_native.cpp',
  'web-runtime/frame-host/frame_loop.cpp',
  'web-runtime/frame-host/guest_cpu.cpp',
  'web-runtime/frame-host/translator_abi_fixture.cpp',
  'web-runtime/src/guest_memory.cpp',
  'web-runtime/interop/synthetic_guest.cpp',
  'web-runtime/interop/device_policy.cpp',
  'web-runtime/runtime-services/input_snapshot.cpp'
].map(f=>join(root,f));
test('actual W03 scheduler owns canonical clock revision, CPU pair, lifecycle and W07 denial',t=>{
  const dir=mkdtempSync(join(tmpdir(),'nsmb-p18-peach-native-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const binary=join(dir,'clock');
  const compile=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
    '-Werror','-pedantic',...sources,'-o',binary],{
    encoding:'utf8',timeout:50000
  });
  assert.equal(compile.status,0,compile.stderr||compile.error?.message);
  const execution=spawnSync(binary,[],{encoding:'utf8',timeout:15000});
  assert.equal(execution.status,0,execution.stderr||execution.stdout);
  assert.match(execution.stdout,/TOTAL_CHECKS 48\s*$/);
  assert.equal((execution.stdout.match(/^PASS /gm)||[]).length,48);
});
