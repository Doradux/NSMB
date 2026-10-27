// A native *real W03/W04/W07* integration test, NOT a JS CPU mock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const sources=[
  'tests/phase16/peach/trusted_cpu_native.cpp',
  'web-runtime/frame-host/frame_loop.cpp',
  'web-runtime/frame-host/guest_cpu.cpp',
  'web-runtime/frame-host/translator_abi_fixture.cpp',
  'web-runtime/src/guest_memory.cpp',
  'web-runtime/interop/synthetic_guest.cpp',
  'web-runtime/interop/device_policy.cpp',
  'web-runtime/runtime-services/input_snapshot.cpp'
].map(x=>join(root,x));
test('ACTUAL native W03+W04/W07 scheduler enforces 70 CPU lease and lifecycle checks',t=>{
  const scratch=mkdtempSync(join(tmpdir(),'nsmb-p16-trusted-cpu-'));
  t.after(()=>rmSync(scratch,{recursive:true,force:true}));
  const binary=join(scratch,'w03_trusted');
  const compile=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra','-Werror',
    '-pedantic','-DNSMB_PHASE16_TRUSTED_CPU_TEST',...sources,'-o',binary],{
    encoding:'utf8',timeout:40000,env:process.env
  });
  assert.equal(compile.status,0,compile.stderr || compile.error?.message);
  const result=spawnSync(binary,[],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/TOTAL_CHECKS 70\s*$/);
  assert.equal((result.stdout.match(/^PASS /gm)||[]).length,70);
});
