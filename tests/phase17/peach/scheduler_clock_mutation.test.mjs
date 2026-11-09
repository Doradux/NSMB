// Deliberately defective source variants from *actual W03 native C++*.
// Every RED variant must COMPILE, then fail a named adversarial oracle.
// This never modifies tracked files; native source is rewritten only in /tmp.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const original=readFileSync(join(root,'web-runtime/frame-host/frame_loop.cpp'),'utf8');
const sources=[
  'tests/phase17/peach/scheduler_clock_native.cpp',
  'web-runtime/frame-host/guest_cpu.cpp',
  'web-runtime/frame-host/translator_abi_fixture.cpp',
  'web-runtime/src/guest_memory.cpp',
  'web-runtime/interop/synthetic_guest.cpp',
  'web-runtime/interop/device_policy.cpp',
  'web-runtime/runtime-services/input_snapshot.cpp'
].map(f=>join(root,f));
const variants=[
  {
    name:'nonallowlisted PC accepted',
    from:'if(expectedPc!=SyntheticCpu::Entry)return ClockArm::unsupportedPc;',
    to:'/* BUG deliberate: forgotten synthetic PC allowlist */',
    label:'even an actual matching nonallowlisted synthetic PC cannot claim a clock service'
  },
  {
    name:'local monotonic ledger regression accepted',
    from:'if(t->clockCommitted && proposedTicks<t->clockTicks)\n    return ClockArm::regression;',
    to:'/* BUG deliberate: regression check removed */',
    label:'monotonic local ledger denies decreasing candidate at prepare'
  },
  {
    name:'copied native ticket not revoked after arm attempt',
    from:'if (authorized) { t->outstandingService = 0u; } // retire copied leases',
    to:'/* BUG deliberate: copied ticket remains valid after prepare */',
    label:'rejected attempt globally retires copied ticket'
  },
  {
    name:'hostile W07 callback can arm foreign guest',
    from:'if(busy)return ClockArm::dispatchBusy;',
    to:'/* BUG deliberate: dispatch busy gate missing */',
    label:'device callback cannot arm another READY guest during dispatch'
  },
  {
    name:'GPR3/GPR4 torn after scheduled service',
    from:'t.cpu.gpr[4]=static_cast<uint32_t>(ticks);',
    to:'/* BUG deliberate: low half of returned time missing */',
    label:'scheduler commits upper32 in GPR3, lower32 in GPR4'
  },
  {
    name:'local clock ledger not committed with GPRs',
    from:'t.clockTicks=ticks;',
    to:'/* BUG deliberate: clock ledger omitted while registers changed */',
    label:'real W03 tick commits local synthetic ledger exactly once'
  },
  {
    name:'suspend fails to abort pending synthetic event',
    from:'t->clockPending=false;\n    t->clockLast=nsmbw::trusted_cpu::ClockOutcome::cancelled;\n  }\n  t->state=PAUSED;',
    to:'/* BUG deliberate: pending service stays armed on suspend */\n  }\n  t->state=PAUSED;',
    label:'suspend aborts pending candidate without ledger mutation'
  }
];
for(const {name,from,to,label} of variants) {
  test('RED source mutation: '+name,t=>{
    const dir=mkdtempSync(join(tmpdir(),'nsmb-p17-peach-red-'));
    t.after(()=>rmSync(dir,{recursive:true,force:true}));
    assert.equal(original.split(from).length,2,'guard not uniquely located: '+name);
    const badSource=join(dir,'frame_loop.cpp');
    const exe=join(dir,'bad');
    writeFileSync(badSource,original.replace(from,to));
    const cc=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
      '-Werror','-pedantic','-I'+join(root,'web-runtime/frame-host'),
      ...sources,badSource,'-o',exe],{encoding:'utf8',timeout:40000});
    assert.equal(cc.status,0,cc.stderr||cc.error?.message);
    const run=spawnSync(exe,[],{encoding:'utf8',timeout:15000});
    assert.equal(run.status,2,'mutated source incorrectly passed: '+run.stdout);
    assert.match(run.stderr,new RegExp('FAIL '+label));
  });
}
