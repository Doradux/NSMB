// Native real W03/W04/W07 Phase20 service: one private quota and canonical commit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const sources=[
 'tests/phase20/peach/private_service_native.cpp',
 'web-runtime/frame-host/frame_loop.cpp',
 'web-runtime/frame-host/guest_cpu.cpp',
 'web-runtime/frame-host/translator_abi_fixture.cpp',
 'web-runtime/src/guest_memory.cpp',
 'web-runtime/interop/synthetic_guest.cpp',
 'web-runtime/interop/device_policy.cpp',
 'web-runtime/runtime-services/input_snapshot.cpp'
].map(path=>join(root,path));
test('real W03 typed service uses PRIVATE ticket+quota and SINGLE atomic ledger',t=>{
 const dir=mkdtempSync(join(tmpdir(),'nsmb-p20-peach-native-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const output=join(dir,'service');
 const c=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
  '-Werror','-pedantic','-DNSMB_PHASE18_CLOCK_TEST',...sources,
  '-o',output],{encoding:'utf8',timeout:45000});
 assert.equal(c.status,0,c.stderr||c.error?.message);
 const run=spawnSync(output,[],{encoding:'utf8',timeout:18000});
 assert.equal(run.status,0,run.stderr||run.stdout||run.error?.message);
 assert.match(run.stdout,/TOTAL_CHECKS 39\s*$/);
 assert.equal((run.stdout.match(/^PASS /gm)||[]).length,39);
});
