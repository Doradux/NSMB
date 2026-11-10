// PHASE19: REAL W03/W04/W07 native C++ source, not a JS shadow CPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../../',import.meta.url));
export const sources=[
  'tests/phase19/peach/fresh_clock_native.cpp',
  'web-runtime/frame-host/frame_loop.cpp',
  'web-runtime/frame-host/guest_cpu.cpp',
  'web-runtime/frame-host/translator_abi_fixture.cpp',
  'web-runtime/src/guest_memory.cpp',
  'web-runtime/interop/synthetic_guest.cpp',
  'web-runtime/interop/device_policy.cpp',
  'web-runtime/runtime-services/input_snapshot.cpp'
].map(f=>join(root,f));
test('fresh-Wasm fixture C ABI is implemented by real native W03 scheduler and canonical Time64',t=>{
  const tmp=mkdtempSync(join(tmpdir(),'nsmb-p19-peach-native-'));
  t.after(()=>rmSync(tmp,{recursive:true,force:true}));
  const exe=join(tmp,'e2e');
  const cc=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
    '-Werror','-pedantic',...sources,'-o',exe],{encoding:'utf8',timeout:40000});
  assert.equal(cc.status,0,cc.stderr||cc.error?.message);
  const run=spawnSync(exe,[],{encoding:'utf8',timeout:20000});
  assert.equal(run.status,0,run.stderr||run.stdout||run.error?.message);
  assert.match(run.stdout,/TOTAL_CHECKS 33\s*$/);
  assert.equal((run.stdout.match(/^PASS /gm)||[]).length,33);
});
