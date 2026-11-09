// Red-team native C++ mutation oracles. Each deliberate bug is compiled
// in an isolated /tmp source copy; main, Phase17 and peer trees untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const original=readFileSync(join(root,'web-runtime/frame-host/frame_loop.cpp'),'utf8');
const common=[
  'web-runtime/frame-host/guest_cpu.cpp',
  'web-runtime/frame-host/translator_abi_fixture.cpp',
  'web-runtime/src/guest_memory.cpp',
  'web-runtime/interop/synthetic_guest.cpp',
  'web-runtime/interop/device_policy.cpp',
  'web-runtime/runtime-services/input_snapshot.cpp'
].map(f=>join(root,f));
const cases=[
  {
    title:'candidate source epoch guard dropped',
    find:'if(requireSourceRevision && plan.sourceEpoch!=serviceEpoch)\n    return ClockArm::epochMismatch;',
    bug:'/* intentional TEST MUTANT: ignore source epoch */',
    fail:'candidate source epoch does not authorize W03 epoch'
  },
  {
    title:'canonical revision compare omitted',
    find:'if(requireSourceRevision && plan.sourceRevision!=t->clockRevision)\n    return ClockArm::staleRevision;',
    bug:'/* intentional TEST MUTANT: stale revisions accepted */',
    fail:'stale/future ledger revision denied before arm'
  },
  {
    title:'candidate high32/low32 check removed',
    find:'if(requireSourceRevision &&\n     (plan.high32!=static_cast<uint32_t>(proposedTicks>>32u) ||\n      plan.low32!=static_cast<uint32_t>(proposedTicks)))\n    return ClockArm::badPair;',
    bug:'/* intentional TEST MUTANT: allow forged split pair */',
    fail:'invalid pure candidate high32/low32 pair denied'
  },
  {
    title:'canonical revision not incremented at commit',
    find:'++t.clockRevision; // SAME in-dispatch, no-fail W03 canonical commit',
    bug:'/* intentional TEST MUTANT: no revision increment */',
    fail:'ONE canonical W03 ledger revision increments on success'
  },
  {
    title:'queued revision changed after arm but tick does not revalidate',
    find:'if(t.clockRevision!=t.clockExpectedRevision) {\n        t.clockLast=nsmbw::trusted_cpu::ClockOutcome::abortedRevision;\n        return static_cast<int>(t.id);\n      }',
    bug:'/* intentional TEST MUTANT: no revision revalidation in W03 tick */',
    fail:'real scheduler aborts corrupt pending revision before writes',
    adversarial:true
  },
  {
    title:'queued PC changed after arm but tick publishes anyway',
    find:'if(t.cpu.pc!=expected || expected!=SyntheticCpu::Entry) {\n        t.clockLast=nsmbw::trusted_cpu::ClockOutcome::abortedPc;\n        return static_cast<int>(t.id);\n      }',
    bug:'(void)expected; /* intentional TEST MUTANT: skip PC revalidation at scheduler tick */',
    fail:'actual W03 denies stale PC at dispatch preflight',
    adversarial:true
  },
  {
    title:'revision uint64 wrap fail-closed guard removed',
    find:'if(t->clockRevision==UINT64_MAX)return ClockArm::revisionExhausted;',
    bug:'/* intentional TEST MUTANT: permit revision wrap */',
    fail:'revision overflow fails CLOSED before any guest mutation',
    adversarial:true
  },
  {
    title:'denied action leaves a copied private Ticket replayable',
    find:'if (authorized) { t->outstandingService = 0u; } // retire copied leases',
    bug:'/* intentional TEST MUTANT: copied lease is not retired */',
    fail:'failed candidate attempt retires copied capability globally'
  }
];
for(const scenario of cases) {
  test('RED C++ source mutation: '+scenario.title,t=>{
    const scratch=mkdtempSync(join(tmpdir(),'nsmb-p18-peach-red-'));
    t.after(()=>rmSync(scratch,{recursive:true,force:true}));
    assert.equal(original.split(scenario.find).length,2,
      'source guard must uniquely match real W03 code');
    const source=join(scratch,'frame_loop.cpp');
    writeFileSync(source,original.replace(scenario.find,scenario.bug));
    const binary=join(scratch,'broken');
    const native=join(root,'tests/phase18/peach/',
      scenario.adversarial?'canonical_clock_adversarial.cpp':'canonical_clock_native.cpp');
    const flags=['-std=c++17','-O2','-Wall','-Wextra','-Werror','-pedantic'];
    if(scenario.adversarial) flags.push('-DNSMB_PHASE18_CLOCK_TEST');
    const cc=spawnSync('g++',[...flags,'-I'+join(root,'web-runtime/frame-host'),
      native,...common,source,'-o',binary],{
      encoding:'utf8',timeout:50000
    });
    assert.equal(cc.status,0,cc.stderr||cc.error?.message);
    const result=spawnSync(binary,[],{encoding:'utf8',timeout:20000});
    assert.equal(result.status,2,'mutated W03 unexpectedly passed: '+result.stdout);
    assert.match(result.stderr,new RegExp('FAIL '+scenario.fail));
  });
}
