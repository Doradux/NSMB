// Phase16: isolated synthetic service, not a trusted W03 issuer or Wii HLE.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTime64Oracle,nanosecondsToTicks,splitTimebase,MAX_U64} from '../../../web-runtime/runtime-services/synthetic_time64_host.mjs';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const inc=join(root,'web-runtime/runtime-services');
const native=join(root,'tests/phase16/toad/time64_epoch_native.cpp');
const source=join(inc,'time64_epoch_service.hpp');
function compile(tmp, override=false, sourceName=native) {
  const output=join(tmp,override?'mutated':'original');
  return {output,result:spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
    '-Werror','-pedantic',...(sourceName===native?['-DNSMB_PHASE16_TIME64_SYNTHETIC_TEST']:[]),...(override?['-I',tmp]:[]),'-I',inc,sourceName,
    '-o',output],{encoding:'utf8',timeout:30000})};
}
test('native C++ 59 atomic+epoch checks at -Werror',t=>{
  const dir=mkdtempSync(join(tmpdir(),'nsmb-p16-native-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const {output,result}=compile(dir);
  assert.equal(result.status,0,result.stderr);
  const run=spawnSync(output,[],{encoding:'utf8',timeout:10000});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/TOTAL_CHECKS 59\s*$/);
  assert.equal((run.stdout.match(/^PASS /gm)||[]).length,59);
});
test('RED -> GREEN: missing generation check is detected by native negative fixture',t=>{
  const dir=mkdtempSync(join(tmpdir(),'nsmb-p16-mutant-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const original=readFileSync(source,'utf8');
  const vulnerable='if (slot.generation != permit.generation_) return {Error::badGeneration};';
  assert.equal(original.split(vulnerable).length-1,2);
  const mutation=original.replace(vulnerable,'if (false) return {Error::badGeneration};');
  writeFileSync(join(dir,'time64_epoch_service.hpp'),mutation);
  // Native C++ fixture uses a named header and the temp override wins -I.
  const {output,result}=compile(dir,true);
  assert.equal(result.status,0,result.stderr);
  const mutant=spawnSync(output,[],{encoding:'utf8',timeout:10000});
  assert.notEqual(mutant.status,0,'mutant must fail');
  assert.match(mutant.stderr,/FAIL stale\/future generation mismatch/);
  const healthy=compile(dir);
  assert.equal(healthy.result.status,0,healthy.result.stderr);
  const passing=spawnSync(healthy.output,[],{encoding:'utf8',timeout:10000});
  assert.equal(passing.status,0,passing.stderr);
  assert.match(passing.stdout,/TOTAL_CHECKS 59/);
});
test('untrusted callers cannot construct or copy capability in normal C++',t=>{
  const dir=mkdtempSync(join(tmpdir(),'nsmb-p16-capability-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const p=join(dir,'forgery.cpp');
  writeFileSync(p,'#include "time64_epoch_service.hpp"\nint main() { nsmbw::w16::Time64Permit forged; }\n');
  const {result}=compile(dir,false,p);
  assert.notEqual(result.status,0,'private default constructor should block fake issuer');
  assert.match(result.stderr,/Time64Permit/);
});
test('synthetic issuer class cannot mint a ticket without test-only build flag',t=>{
  const dir=mkdtempSync(join(tmpdir(),'nsmb-p16-fakeissuer-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'fakeissuer.cpp');
  writeFileSync(path, `#include "time64_epoch_service.hpp"\n
namespace nsmbw::w03 {
class Time64PermitIssuer { public:
  static nsmbw::w16::Time64Permit mint(nsmbw::w16::Time64EpochService& service) {
    return nsmbw::w16::Time64Permit(service, 0, 1, 0, nsmbw::w16::Act::open, true);
  }
};
}
int main() { nsmbw::w16::Time64EpochService service;
  auto cap=nsmbw::w03::Time64PermitIssuer::mint(service); (void)cap; }
`);
  const {result}=compile(dir,false,path);
  assert.notEqual(result.status,0,'production build must not admit fake issuer');
  assert.match(result.stderr,/private within this context/);
});
test('JS Time64 BigInt fuzz bounded near uint64, no Number precision',()=>{
  let seed=0x8d09c671n;
  for(let i=0;i<1024;i++){
    seed=(seed*1664525n+1013904223n)&0xffffffffn;
    const n=MAX_U64-(seed*23243931n);
    const q=(n/1000000000n)*60750000n+((n%1000000000n)*60750000n)/1000000000n;
    assert.equal(nanosecondsToTicks(n),q);
    const ticks=(seed<<32n)|(seed^0xffffffffn);
    const {high,low}=splitTimebase(ticks);
    assert.equal((BigInt(high)<<32n)|BigInt(low),ticks);
  }
});
test('reject overflow, regressions and independent owner mixing',()=>{
  const a=createTime64Oracle(MAX_U64-1n),b=createTime64Oracle(1n);
  a.advance(1n);
  assert.throws(()=>a.advance(1n),/TIMEBASE_OVERFLOW/);
  assert.throws(()=>a.publish(0n),/TIMEBASE_REGRESSION/);
  assert.equal(a.ticks,MAX_U64);
  assert.equal(b.advance(1n).low,2);
  assert.equal(a.ticks,MAX_U64);
});
test('new time64 service is not production HLE or public JS issuer',()=>{
  const hdr=readFileSync(source,'utf8');
  assert.match(hdr,/namespace nsmbw::w03 \{ class Time64PermitIssuer; \}/);
  assert.match(hdr,/#if defined\(NSMB_PHASE16_TIME64_SYNTHETIC_TEST\)/);
  assert.match(hdr,/Time64Permit\(const Time64Permit&\) = delete/);
  assert.doesNotMatch(hdr,/extern\s+"C"/);
  for (const runtime of ['web-runtime/frame-host/frame_loop.cpp','web-runtime/runtime-services/tick_host.mjs']){
    const text=readFileSync(join(root,runtime),'utf8');
    assert.doesNotMatch(text,/time64_epoch_service|Time64PermitIssuer|OS__GetTime_HLE/);
  }
});
