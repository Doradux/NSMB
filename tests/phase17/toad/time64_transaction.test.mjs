// All tests on invented CPU/Time64 data; NO Nintendo original code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {nanosecondsToTicks,splitTimebase,MAX_U64} from '../../../web-runtime/runtime-services/synthetic_time64_host.mjs';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const include=join(root,'web-runtime/runtime-services');
const native=join(root,'tests/phase17/toad/time64_transaction_native.cpp');
const header=join(include,'time64_transaction.hpp');
function build(temp,{mutant=false,source=native,macro=true}={}) {
 const binary=join(temp,mutant?'mutated':'original');
 const args=['-std=c++17','-O2','-Wall','-Wextra','-Werror','-pedantic',
    ...(macro?['-DNSMB_PHASE17_TIME64_SYNTHETIC_TEST']:[]),
    ...(mutant?['-I',temp]:[]),'-I',include,source,'-o',binary];
 return {binary,result:spawnSync('g++',args,{encoding:'utf8',timeout:30000})};
}
function run(binary) {return spawnSync(binary,[],{encoding:'utf8',timeout:10000});}
function tempFolder(t,name) {
 const dir=mkdtempSync(join(tmpdir(),'nsmb17-toad-'+name+'-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 return dir;
}
test('native C++ 90 atomic transaction, failure, ABA and fuzz checks at -Werror',t=>{
 const dir=tempFolder(t,'native');
 const {binary,result}=build(dir);
 assert.equal(result.status,0,result.stderr);
 const executed=run(binary);
 assert.equal(executed.status,0,executed.stderr);
 assert.match(executed.stdout,/TOTAL_CHECKS 90\s*$/);
 assert.equal((executed.stdout.match(/^PASS /gm)||[]).length,90);
});
test('RED/GREEN: removal of cross-incarnation guard enables stale ABA prepared token',t=>{
 const dir=tempFolder(t,'aba');
 const original=readFileSync(header,'utf8');
 const vulnerable='proposed.incarnation_!=incarnation_';
 assert.equal(original.split(vulnerable).length-1,2);
 writeFileSync(join(dir,'time64_transaction.hpp'),original.slice(0,original.lastIndexOf(vulnerable))+'false'+original.slice(original.lastIndexOf(vulnerable)+vulnerable.length));
 const mutant=build(dir,{mutant:true});
 assert.equal(mutant.result.status,0,mutant.result.stderr);
 const failed=run(mutant.binary);
 assert.notEqual(failed.status,0);
 assert.match(failed.stderr,/FAIL old candidate incarnation denied/);
 const originalRun=build(dir);
 assert.equal(originalRun.result.status,0,originalRun.result.stderr);
 assert.equal(run(originalRun.binary).status,0);
});
test('RED/GREEN: removing clock ledger write fails even when CPU returns success',t=>{
 const dir=tempFolder(t,'ledger');
 const original=readFileSync(header,'utf8');
 const target='slot.ticks=proposed.ticks_;';
 assert.equal(original.split(target).length-1,1);
 writeFileSync(join(dir,'time64_transaction.hpp'),original.replace(target,'slot.ticks=slot.ticks;'));
 const mutant=build(dir,{mutant:true});
 assert.equal(mutant.result.status,0,mutant.result.stderr);
 const failed=run(mutant.binary);
 assert.notEqual(failed.status,0);
 assert.match(failed.stderr,/FAIL CPU r3\/r4 and ledger co-commit/);
});
test('RED/GREEN: injected W03 device fault must prevent BOTH CPU and ledger writes',t=>{
 const dir=tempFolder(t,'fault');
 const original=readFileSync(header,'utf8');
 const target='case Phase::deviceFault: return Error::deviceDenied;';
 assert.equal(original.split(target).length-1,1);
 writeFileSync(join(dir,'time64_transaction.hpp'),original.replace(target,
   'case Phase::deviceFault: return Error::ok;'));
 const mutant=build(dir,{mutant:true});
 assert.equal(mutant.result.status,0,mutant.result.stderr);
 const failed=run(mutant.binary);
 assert.notEqual(failed.status,0);
 assert.match(failed.stderr,/FAIL device fault before writes/);
});
test('RED/GREEN: revision check denies stale competing transaction',t=>{
 const dir=tempFolder(t,'version');
 const original=readFileSync(header,'utf8');
 const target='if (inspect.revision!=proposed.revision_) return Error::stalePrepared;';
 assert.equal(original.split(target).length-1,1);
 writeFileSync(join(dir,'time64_transaction.hpp'),original.replace(target,
   'if (false) return Error::stalePrepared;'));
 const mutant=build(dir,{mutant:true});
 assert.equal(mutant.result.status,0,mutant.result.stderr);
 const failed=run(mutant.binary);
 assert.notEqual(failed.status,0);
 assert.match(failed.stderr,/FAIL older proposal blocked by revision/);
});
test('ordinary native code cannot construct W03 authority (no test macro)',t=>{
 const dir=tempFolder(t,'forbidden');
 const fake=join(dir,'fake.cpp');
 writeFileSync(fake,`#include "time64_transaction.hpp"
namespace nsmbw::w03 {
class Time64TransactionIssuer {
public: static nsmbw::w17::Authority mint(nsmbw::w17::TransactionService& x) {
 return nsmbw::w17::Authority(x,0,1,0,nsmbw::w17::Action::commit,
                              nsmbw::w17::Phase::quiescent);
}};}
int main(){nsmbw::w17::TransactionService x;
 auto a=nsmbw::w03::Time64TransactionIssuer::mint(x);(void)a;}
`);
 const result=build(dir,{source:fake,macro:false}).result;
 assert.notEqual(result.status,0,'normal compiled code must never mint authority');
 assert.match(result.stderr,/private within this context/);
});
test('normal C++ compile accepts private synthetic service but does not export HLE',t=>{
 const dir=tempFolder(t,'prod');
 const empty=join(dir,'prod.cpp');
 writeFileSync(empty,`#include "time64_transaction.hpp"
static_assert(!std::is_default_constructible<nsmbw::w17::Authority>::value);
static_assert(!std::is_copy_constructible<nsmbw::w17::Prepared>::value);
int main(){nsmbw::w17::TransactionService svc;return 0;}
`);
 const result=build(dir,{source:empty,macro:false}).result;
 assert.equal(result.status,0,result.stderr);
 const text=readFileSync(header,'utf8');
 assert.doesNotMatch(text,/extern\s+"C"|EMSCRIPTEN_KEEPALIVE|OS__GetTime_HLE/);
 assert.match(text,/#if defined\(NSMB_PHASE17_TIME64_SYNTHETIC_TEST\)/);
});
test('exact BigInt nanoseconds ratio and high/low split at 1024 deterministic boundaries',()=>{
 let seed=0x654a3721n;
 for(let i=0;i<1024;i++){
  seed=(1664525n*seed+1013904223n)&0xffffffffn;
  const n=MAX_U64-seed*521891n;
  // Independent quotient/remainder route; multiplication bounded at <2^64.
  const oracle=(n/1000000000n)*60750000n+
    ((n%1000000000n)*60750000n)/1000000000n;
  assert.equal(nanosecondsToTicks(n),oracle);
  const ticks=(seed<<32n)|(seed^0xffffffffn);
  const {high,low}=splitTimebase(ticks);
  assert.equal((BigInt(high)<<32n)|BigInt(low),ticks);
 }
 assert.equal(nanosecondsToTicks(1000000000n),60750000n);
 assert.equal(nanosecondsToTicks(4000n),243n);
 assert.equal(nanosecondsToTicks(3999n),242n);
});
test('source-only time64 transaction has no W03 production bridge or JS raw CPU',()=>{
 const source=readFileSync(header,'utf8');
 assert.match(source,/const uint64_t incarnation_ = allocateIncarnation\(\)/);
 assert.doesNotMatch(source,/const_cast</);
 assert.match(source,/if \(inspect.revision!=proposed.revision_\)/);
 assert.match(source,/slot.cpu.gpr\[3\]/);
 assert.match(source,/slot.cpu.gpr\[4\]/);
 assert.match(source,/slot.ticks=proposed.ticks_/);
 const frameHost=readFileSync(join(root,'web-runtime/frame-host/frame_loop.cpp'),'utf8');
 assert.doesNotMatch(frameHost,/time64_transaction\.hpp|Time64TransactionIssuer|w17::TransactionService/);
});
test('cross-translation-unit placement-new ABA cannot reuse prepared token or authority',t=>{
 const dir=tempFolder(t,'cross-tu');
 writeFileSync(join(dir,'factoryA.cpp'),`#include "time64_transaction.hpp"
#include <new>
extern "C" nsmbw::w17::TransactionService* factoryA(void* p) {
 return new(p) nsmbw::w17::TransactionService{};
}`);
 writeFileSync(join(dir,'factoryB.cpp'),`#include "time64_transaction.hpp"
#include <new>
extern "C" nsmbw::w17::TransactionService* factoryB(void* p) {
 return new(p) nsmbw::w17::TransactionService{};
}`);
 writeFileSync(join(dir,'driver.cpp'),`#include "time64_transaction.hpp"
#include <new>
#include <utility>
#include <cstdio>
extern "C" nsmbw::w17::TransactionService* factoryA(void*);
extern "C" nsmbw::w17::TransactionService* factoryB(void*);
namespace nsmbw::w03 {
class Time64TransactionIssuer {
 public:static nsmbw::w17::Authority make(nsmbw::w17::TransactionService& s,
   nsmbw::w17::Action a) {
  return nsmbw::w17::Authority(s,0,1,0x80004100,a,
                               nsmbw::w17::Phase::quiescent);
 }
};
}
int main(){
 using namespace nsmbw::w17;
 using nsmbw::w03::Time64TransactionIssuer;
 alignas(TransactionService) unsigned char buffer[sizeof(TransactionService)]{};
 CpuContext seed{};seed.pc=0x80004100;
 auto* a=factoryA(buffer);
 if(a->open(Time64TransactionIssuer::make(*a,Action::open),seed)!=Error::ok)return 6;
 auto candidate=a->prepareTicks(0,1,seed.pc,100);
 auto oldAuthority=Time64TransactionIssuer::make(*a,Action::commit);
 a->~TransactionService();
 auto* b=factoryB(buffer);
 if(a!=b || b->open(Time64TransactionIssuer::make(*b,Action::open),seed)!=Error::ok)return 7;
 const bool staleCandidate=b->commit(std::move(*candidate.candidate),
                Time64TransactionIssuer::make(*b,Action::commit))==Error::untrusted;
 auto next=b->prepareTicks(0,1,seed.pc,101);
 const bool staleIssuer=b->commit(std::move(*next.candidate),
                  std::move(oldAuthority))==Error::untrusted;
 CpuContext cpu{};uint64_t ticks=0,gen=0,version=0;
 const bool unchanged=b->snapshot(0,cpu,ticks,gen,version)&&ticks==0&&
   version==0&&cpu.gpr[3]==0&&cpu.gpr[4]==0;
 b->~TransactionService();
 if(!(staleCandidate&&staleIssuer&&unchanged))return 8;
 std::puts("CROSS_TU_ABA_DENIED");return 0;
}
`);
 const binary=join(dir,'cross-tu');
 const comp=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
   '-Werror','-pedantic','-DNSMB_PHASE17_TIME64_SYNTHETIC_TEST',
   '-I',include,join(dir,'factoryA.cpp'),join(dir,'factoryB.cpp'),
   join(dir,'driver.cpp'),'-o',binary],{encoding:'utf8',timeout:30000});
 assert.equal(comp.status,0,comp.stderr);
 const result=run(binary);
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/CROSS_TU_ABA_DENIED/);
});
