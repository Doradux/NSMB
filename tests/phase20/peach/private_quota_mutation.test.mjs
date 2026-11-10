// 8 REAL native W03 C++ mutant RED controls: not JS mock assertions.
// Mutants must COMPILE under -Werror and fail a NAMED private quota invariant.
// Temporary copies only. Never change tracked W03 or peer worktrees.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,cpSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const files={
 frame:'web-runtime/frame-host/frame_loop.cpp',
 inc:'web-runtime/frame-host/phase20_service_fixture.inc'
};
const rest=[
 'tests/phase20/peach/private_service_native.cpp',
 'web-runtime/frame-host/guest_cpu.cpp',
 'web-runtime/frame-host/translator_abi_fixture.cpp',
 'web-runtime/src/guest_memory.cpp',
 'web-runtime/interop/synthetic_guest.cpp',
 'web-runtime/interop/device_policy.cpp',
 'web-runtime/runtime-services/input_snapshot.cpp'
].map(f=>join(root,f));
const mutants=[
 ['remove private quota debit','frame',
  'if(serviceClock)--t.serviceQuota; // SAME atomic no-fallible commit',
  'if(false)--t.serviceQuota; // broken no debit',
  /FAIL same W03 commit exhausted private quota 1->0 exactly once/],
 ['remove GPR4 clock low32','frame',
  't.cpu.gpr[4]=static_cast<uint32_t>(ticks);',
  't.cpu.gpr[4]=0;',
  /FAIL GPR3\/GPR4 \+ canonical 64-bit Time64 ledger/],
 ['remove canonical revision increment','frame',
  '++t.clockRevision; // SAME in-dispatch, no-fail W03 canonical commit',
  't.clockRevision+=0; // broken revision',
  /FAIL GPR3\/GPR4 \+ canonical 64-bit Time64 ledger/],
 ['bypass native private legacy GPR-pair gate','frame',
  'if(t->serviceFixture)return Status::unsupported;',
  'if(false)return Status::unsupported;',
  /FAIL legacy native GPR pair publisher cannot bypass P20 spent quota/],
 ['bypass old native arm clock gate on P20 fixture','frame',
  'if(t->serviceFixture!=phase20Service)return ClockArm::unsupportedPc;',
  'if(false)return ClockArm::unsupportedPc;',
  /FAIL even authentic native Ticket cannot bypass private P20 quota/],
 ['skip critical private quota recheck at ACTUAL dispatch','frame',
  '(serviceClock && (t.serviceQuota==0 ||',
  '(serviceClock && (false ||',
  /FAIL REAL W03 tick REVALIDATES private quota0/],
 ['remove hardcoded native quota grant','inc',
  't->serviceFixture=true;t->serviceQuota=1;\n  if(!phase20Stage(id,version,serviceId,',
  't->serviceFixture=true;t->serviceQuota=0;\n  if(!phase20Stage(id,version,serviceId,',
  /FAIL native W03 creates NEW only P20 fixed-PC typed fixture/],
 ['drop staged service mode causing unauthorized clock commit','frame',
  't->clockServicePending=phase20Service; // NO debit during prepare',
  't->clockServicePending=false; // MUTANT loses service mode',
  /FAIL GPR3\/GPR4 \+ canonical 64-bit Time64 ledger/]
];
for(const [name,file,needle,broken,oracle] of mutants){
 test('RED real W03 quota mutant: '+name,t=>{
  const scratch=mkdtempSync(join(tmpdir(),'nsmb-p20-peach-mut-'));
  t.after(()=>rmSync(scratch,{recursive:true,force:true}));
  const host=join(scratch,'web-runtime/frame-host');
  const services=join(scratch,'web-runtime/runtime-services');
  mkdirSync(host,{recursive:true});mkdirSync(services,{recursive:true});
  const frame=readFileSync(join(root,files.frame),'utf8');
  const inc=readFileSync(join(root,files.inc),'utf8');
  const original=file==='frame'?frame:inc;
  assert.equal(original.split(needle).length-1,1,'unique critical mutation '+name);
  writeFileSync(join(host,'frame_loop.cpp'),
    file==='frame'?frame.replace(needle,broken):frame);
  writeFileSync(join(host,'phase20_service_fixture.inc'),
    file==='inc'?inc.replace(needle,broken):inc);
  for(const h of [
   'time64_pure_candidate.hpp','time64_pure_clock.hpp','synthetic_service_dispatch.hpp'
  ])cpSync(join(root,'web-runtime/runtime-services',h),join(services,h));
  const binary=join(scratch,'mutant');
  const c=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
    '-Werror','-pedantic','-DNSMB_PHASE18_CLOCK_TEST',
    '-I',join(root,'web-runtime/frame-host'),...rest,
    join(host,'frame_loop.cpp'),'-o',binary
  ],{encoding:'utf8',timeout:50000});
  assert.equal(c.status,0,'mutant MUST compile before adversarial test: '+c.stderr);
  const result=spawnSync(binary,[],{encoding:'utf8',timeout:20000});
  assert.equal(result.status,3,
    'mutant escaped actual W03 native checks: '+name+'\n'+result.stdout+'\n'+result.stderr);
  assert.match(result.stderr,oracle,'unrelated failure is NOT evidence: '+name);
 });
}
