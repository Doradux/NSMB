// PHASE17 real W03/W04/W07 native linked scheduler event regression.
// New code is native SOURCE ONLY, not rebuilt browser Wasm or Nintendo HLE.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const sources=[
  'tests/phase17/peach/scheduler_clock_native.cpp',
  'web-runtime/frame-host/frame_loop.cpp',
  'web-runtime/frame-host/guest_cpu.cpp',
  'web-runtime/frame-host/translator_abi_fixture.cpp',
  'web-runtime/src/guest_memory.cpp',
  'web-runtime/interop/synthetic_guest.cpp',
  'web-runtime/interop/device_policy.cpp',
  'web-runtime/runtime-services/input_snapshot.cpp'
].map(x=>join(root,x));
test('real W03 scheduler synthetic clock event, no guest pointer, native C++ transaction',t=>{
  const tmp=mkdtempSync(join(tmpdir(),'nsmb-p17-peach-'));
  t.after(()=>rmSync(tmp,{recursive:true,force:true}));
  const out=join(tmp,'w03-clock');
  const cc=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
    '-Werror','-pedantic',...sources,'-o',out],
    {encoding:'utf8',timeout:40000});
  assert.equal(cc.status,0,cc.stderr||cc.error?.message);
  const run=spawnSync(out,[],{encoding:'utf8',timeout:15000});
  assert.equal(run.status,0,run.stderr||run.stdout||run.error?.message);
  assert.match(run.stdout,/TOTAL_CHECKS (\d+)\s*$/);
  const count=Number(run.stdout.match(/TOTAL_CHECKS (\d+)/)[1]);
  assert.equal(count,59,'expected all 59 named native scheduler assertions');
  assert.equal((run.stdout.match(/^PASS /gm)||[]).length,count);
});
