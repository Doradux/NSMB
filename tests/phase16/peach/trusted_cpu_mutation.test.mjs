// RED/green evidence: compile temporary mutations of ACTUAL production W03 C++
// without ever mutating the tracked repository. A removed gate MUST make
// native adversarial tests fail (exit 2 + explicit FAIL), not falsely pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const relative='web-runtime/frame-host/frame_loop.cpp';
const original=readFileSync(join(root,relative),'utf8');
const sources=[
  'tests/phase16/peach/trusted_cpu_native.cpp',
  'web-runtime/frame-host/guest_cpu.cpp',
  'web-runtime/frame-host/translator_abi_fixture.cpp',
  'web-runtime/src/guest_memory.cpp',
  'web-runtime/interop/synthetic_guest.cpp',
  'web-runtime/interop/device_policy.cpp',
  'web-runtime/runtime-services/input_snapshot.cpp'
].map(x=>join(root,x));
const variants=[
  ['expected PC check removed',
    'if(t->cpu.pc!=expectedPc)return Status::pcMismatch;',
    '(void)expectedPc; /* deliberate test-only bug: expected PC omitted */',
    'wrong expected PC denies before mutation'],
  ['scheduler reentry gate removed',
    'if(busy)return Status::executing;',
    '/* deliberate test-only bug: W03 reentry allowed */',
    'native callback cannot reenter trusted service during dispatch'],
  ['global reset quiescence gate removed',
    'if(dispatching || serviceExecuting){lastError=8;return;}',
    '/* deliberate test-only bug: reset during MMIO callback */',
    'MMIO callback occurs INSIDE active scheduler tick'],
  ['global failed-attempt token revocation removed',
    'if(authorized)t->outstandingService=0;',
    '/* deliberate test-only bug: leaked nonce to copied tickets */',
    'wrong PC invalidates OTHER copied tokens globally'],
  ['busy cross-context capability revocation removed',
    'if(authorized)t->outstandingService=0;',
    'if(authorized && !busy)t->outstandingService=0; /* bad: busy copy survives */',
    'foreign outstanding COPY retired by denied reentrant attempt'],
  ['caller-side failed-attempt token consumption removed',
    'ticket.serial_=0;',
    '/* deliberate test-only bug: caller can retry failed token */',
    'wrong-PC token remains consumed after subsequent issuance']
];
for(const [name,from,to,failLabel] of variants) {
  test('RED control: '+name+' breaks actual W03 native proof',t=>{
    const dir=mkdtempSync(join(tmpdir(),'nsmb-peach16-mutation-'));
    t.after(()=>rmSync(dir,{recursive:true,force:true}));
    assert.equal(original.split(from).length,2,'must uniquely target exact production guard');
    const modified=join(dir,'frame_loop_mutated.cpp');
    writeFileSync(modified,original.replace(from,to));
    const binary=join(dir,'mutated');
    const cc=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
      '-Werror','-pedantic','-DNSMB_PHASE16_TRUSTED_CPU_TEST',
      '-I'+join(root,'web-runtime/frame-host'),...sources,modified,'-o',binary],{
      timeout:40000,encoding:'utf8',env:process.env
    });
    assert.equal(cc.status,0,cc.stderr || cc.error?.message);
    const execution=spawnSync(binary,[],{timeout:10000,encoding:'utf8'});
    assert.equal(execution.status,2,'deliberately mutant code unexpectedly passed: '+execution.stdout);
    assert.match(execution.stderr,new RegExp('FAIL '+failLabel));
  });
}
