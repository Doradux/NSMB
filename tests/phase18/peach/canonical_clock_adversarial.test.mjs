// PHASE18 test-only native W03 oracle for complete CPU/trace/clock snapshots.
// Builds source with explicit test macro; production never exports the hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const sources=[
  'tests/phase18/peach/canonical_clock_adversarial.cpp',
  'web-runtime/frame-host/frame_loop.cpp',
  'web-runtime/frame-host/guest_cpu.cpp',
  'web-runtime/frame-host/translator_abi_fixture.cpp',
  'web-runtime/src/guest_memory.cpp',
  'web-runtime/interop/synthetic_guest.cpp',
  'web-runtime/interop/device_policy.cpp',
  'web-runtime/runtime-services/input_snapshot.cpp'
].map(f=>join(root,f));
test('real W03 full CPU/FPR/GQR/trace/RAM rollback + 4096 mixed actions + uint64/serial exhaustion',t=>{
  const scratch=mkdtempSync(join(tmpdir(),'nsmb-p18-peach-adversarial-'));
  t.after(()=>rmSync(scratch,{recursive:true,force:true}));
  const binary=join(scratch,'full-snapshot');
  const cc=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra','-Werror',
    '-pedantic','-DNSMB_PHASE18_CLOCK_TEST',...sources,'-o',binary],{
    encoding:'utf8',timeout:50000
  });
  assert.equal(cc.status,0,cc.stderr||cc.error?.message);
  const run=spawnSync(binary,[],{encoding:'utf8',timeout:20000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  assert.match(run.stdout,/TOTAL_CHECKS 31\s*$/);
  assert.equal((run.stdout.match(/^PASS /gm)||[]).length,31);
});
