// PHASE19 destructive RED controls against ACTUAL W03 native fixture source.
// Each mutant compiles in a disposable /tmp tree; tracked source untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const core=join(root,'web-runtime/frame-host/frame_loop.cpp');
const original=readFileSync(core,'utf8');
const rest=[
  'tests/phase19/peach/fresh_clock_native.cpp',
  'web-runtime/frame-host/guest_cpu.cpp',
  'web-runtime/frame-host/translator_abi_fixture.cpp',
  'web-runtime/src/guest_memory.cpp',
  'web-runtime/interop/synthetic_guest.cpp',
  'web-runtime/interop/device_policy.cpp',
  'web-runtime/runtime-services/input_snapshot.cpp'
].map(x=>join(root,x));
const mutations=[
  ['lose high32 nanosecond bits',
   'const uint64_t nanos=(uint64_t(nanosHigh)<<32)|nanosLow;',
   'const uint64_t nanos=(uint64_t(nanosHigh)<<0)|nanosLow;',
   /FAIL actual W03 tick handles 32-bit high-word carry/],
  ['allow invalid synthetic entry to be spawned',
   '// No caller-supplied entry or PC: a new copyright-free W03 kind1 only.\n  if(!nsmbw_loop_cpu_spawn(id,SyntheticCpu::Entry,stackTop,',
   '// No caller-supplied entry or PC: a new copyright-free W03 kind1 only.\n  if(!nsmbw_loop_cpu_spawn(id,SyntheticCpu::Entry+4u,stackTop,',
   /FAIL native trusted NEW synthetic fixture scheduled/],
  ['forge noncoherent high/low pure candidate',
   'candidate.rawTicks,candidate.high32,candidate.low32,',
   'candidate.rawTicks,candidate.low32,candidate.low32,',
   /FAIL native trusted NEW synthetic fixture scheduled/],
  ['forget canonical W03 clock ledger commit',
   't.clockTicks=ticks;',
   't.clockTicks=t.clockTicks;',
   /FAIL W03 canonical ticks and revision committed once/],
  ['omit canonical W03 revision increment',
   '++t.clockRevision; // SAME in-dispatch, no-fail W03 canonical commit',
   't.clockRevision+=0; // MUTATED omission',
   /FAIL W03 canonical ticks and revision committed once/],
  ['lose the prepared clock pending state',
   't->clockPending=true;',
   't->clockPending=false;',
   /FAIL preflight does not publish CPU registers/]
];
for(const [label,from,to,oracle] of mutations) {
  test('RED native mutant: '+label,t=>{
    const tmp=mkdtempSync(join(tmpdir(),'nsmb-p19-peach-mut-'));
    t.after(()=>rmSync(tmp,{recursive:true,force:true}));
    assert.equal(original.split(from).length,2,'anchor must be unique '+label);
    const frame=join(tmp,'web-runtime/frame-host');mkdirSync(frame,{recursive:true});
    const services=join(tmp,'web-runtime/runtime-services');
    mkdirSync(services,{recursive:true});
    for(const header of ['time64_pure_candidate.hpp','time64_pure_clock.hpp'])
      writeFileSync(join(services,header),
        readFileSync(join(root,'web-runtime/runtime-services',header)));
    const mutant=join(frame,'frame_loop.cpp');
    writeFileSync(mutant,original.replace(from,to));
    const exe=join(tmp,'mutant');
    const cc=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
      '-Werror','-pedantic','-I',join(root,'web-runtime/frame-host'),
      ...rest,mutant,'-o',exe],{encoding:'utf8',timeout:40000});
    assert.equal(cc.status,0,'mutation must COMPILE before hostile RED: '+cc.stderr);
    const run=spawnSync(exe,[],{encoding:'utf8',timeout:15000});
    assert.equal(run.status,2,
      'mutant escaped real W03 native proof '+label+'\n'+run.stdout+'\n'+run.stderr);
    assert.match(run.stderr,oracle);
  });
}
