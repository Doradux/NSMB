// Phase18 C++ ONLY test for exact W03 CPU state / trace / clock rollback.
// Test hooks exist exclusively under -DNSMB_PHASE18_CLOCK_TEST, never Wasm.
#include "../../../web-runtime/frame-host/scheduler_clock.hpp"
#include <array>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>
using namespace nsmbw::trusted_cpu;
extern "C" {
void nsmbw_loop_reset();
int nsmbw_loop_cpu_spawn(uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t);
int nsmbw_loop_frame(uint32_t);
int nsmbw_loop_suspend(uint32_t);
int nsmbw_loop_resume(uint32_t);
uint32_t nsmbw_loop_cpu_gpr(uint32_t,uint32_t);
uint32_t nsmbw_mem_pages();
int nsmbw_mem_write32(uint32_t,uint32_t);
uint32_t nsmbw_mem_read32(uint32_t);
}
namespace {
int tests=0;
void check(bool condition,const char* why){
  if(!condition) {std::cerr<<"FAIL "<<why<<'\n';std::exit(2);}
  std::cout<<"PASS "<<why<<'\n';++tests;
}
constexpr uint32_t entry=0x80010000u, ram=0x80011000u;
int spawn(uint32_t id){return nsmbw_loop_cpu_spawn(id,entry,
  0x80005010u+id*0x1000u,0x80004000u,0x8000C000u+id*0x1000u,0);}
CanonicalClockPlan plan(uint64_t ticks,const ClockSnapshot& snap){
  return {ticks,static_cast<uint32_t>(ticks>>32u),static_cast<uint32_t>(ticks),
          snap.epoch,snap.revision};
}
bool cpuUnchanged(const CpuContext& a,const CpuContext& b){
  for(uint32_t i=0;i<32;i++)if(a.gpr[i]!=b.gpr[i] ||
                                 a.fpr[i].raw!=b.fpr[i].raw)return false;
  for(uint32_t i=0;i<8;i++)if(a.gqr[i]!=b.gqr[i])return false;
  return a.cr==b.cr && a.lr==b.lr && a.ctr==b.ctr &&
    a.xer==b.xer && a.fpscr==b.fpscr && a.pc==b.pc &&
    a.hid0==b.hid0 && a.hid1==b.hid1 && a.hid2==b.hid2 &&
    a.srr0==b.srr0 && a.srr1==b.srr1 && a.msr==b.msr;
}
bool persisted(const ClockNativeTestSnapshot& a,const ClockNativeTestSnapshot& b){
  return a.valid && b.valid && cpuUnchanged(a.cpu,b.cpu) &&
    a.clock.ticks==b.clock.ticks &&
    a.clock.revision==b.clock.revision &&
    a.clock.epoch==b.clock.epoch &&
    a.clock.pending==b.clock.pending &&
    a.clock.committed==b.clock.committed &&
    a.clock.last==b.clock.last &&
    a.trace==b.trace &&
    a.traceLength==b.traceLength &&
    a.traceDropped==b.traceDropped &&
    a.state==b.state && a.error==b.error;
}
bool authoritativeUnchanged(const ClockNativeTestSnapshot& a,
                            const ClockNativeTestSnapshot& b){
  // A denied scheduler dispatch may clear pending and record last abort
  // without changing CPU, canonical ledger, guest RAM or trace.
  return a.valid&&b.valid&&cpuUnchanged(a.cpu,b.cpu) &&
    a.clock.ticks==b.clock.ticks && a.clock.revision==b.clock.revision &&
    a.clock.epoch==b.clock.epoch && a.trace==b.trace &&
    a.traceLength==b.traceLength && a.traceDropped==b.traceDropped &&
    a.state==b.state && a.error==b.error;
}
}
int main(){
#ifndef NSMB_PHASE18_CLOCK_TEST
#error "Native adversarial hooks must be explicit test-only"
#endif
  nsmbw_loop_reset();
  check(spawn(1)==1,"real W03 guest exists before test-only state oracle");
  const auto begin=clockNativeTestSnapshot(1);
  check(begin.valid && begin.cpu.pc==entry &&
        begin.cpu.gpr[3]==0 && begin.cpu.gpr[4]==0x80004000u &&
        begin.clock.revision==0,"native hook returns COPY of full real W03 CPU+ledger");
  check(nsmbw_mem_write32(ram,0xABCD1234u)==1,
        "W04 genuine guest RAM sentinel written for rollback comparisons");
  const auto seeded=clockNativeTestSnapshot(1);
  const auto pages=nsmbw_mem_pages();
  check(pages==1 && nsmbw_mem_read32(ram)==0xABCD1234u,
        "checked real W04 sentinel state established");

  auto deniedTicket=leaseSynthetic(1);
  auto deniedPlan=plan(0x100000002ULL,seeded.clock);
  deniedPlan.low32^=1u;
  check(armCanonicalClock(deniedTicket,entry,deniedPlan)==ClockArm::badPair,
        "malformed pure low32 is denied before any actual CPU write");
  check(persisted(seeded,clockNativeTestSnapshot(1))&&
        nsmbw_mem_pages()==pages&&nsmbw_mem_read32(ram)==0xABCD1234u,
        "all 32 GPR+32 FPR+8 GQR+PC/LR/SP/CR/XER/FPSCR/trace/RAM/ledger unchanged on rejection");

  auto wrong=leaseSynthetic(1);
  auto wrongPlan=plan(0x100000002ULL,seeded.clock);
  ++wrongPlan.sourceRevision;
  check(armCanonicalClock(wrong,entry,wrongPlan)==ClockArm::staleRevision &&
        persisted(seeded,clockNativeTestSnapshot(1)),
        "revision denial retains full CPU, clock and W03 trace bit-for-bit");
  auto invalid=leaseSynthetic(1);
  wrongPlan=plan(0x100000002ULL,seeded.clock);
  ++wrongPlan.sourceEpoch;
  check(armCanonicalClock(invalid,entry,wrongPlan)==ClockArm::epochMismatch &&
        persisted(seeded,clockNativeTestSnapshot(1)),
        "epoch denial retains full observable state bit-for-bit");

  auto good=leaseSynthetic(1);
  check(armCanonicalClock(good,entry,plan(UINT64_MAX,seeded.clock))==ClockArm::accepted,
        "uint64 MAX raw tick candidate allowed before revision exhaust");
  check(nsmbw_loop_frame(1)==1,"real W03 scheduler commits uint64 max once");
  const auto maxCommitted=clockNativeTestSnapshot(1);
  check(maxCommitted.clock.revision==1 && maxCommitted.clock.ticks==UINT64_MAX &&
        maxCommitted.cpu.gpr[3]==UINT32_MAX &&
        maxCommitted.cpu.gpr[4]==UINT32_MAX &&
        maxCommitted.cpu.pc==entry,
        "uint64 max split and canonical revision1 atomically committed");
  auto regressed=leaseSynthetic(1);
  check(armCanonicalClock(regressed,entry,plan(UINT64_MAX-1,maxCommitted.clock))==
        ClockArm::regression,"overflow-safe max clock rejects any regression");
  check(persisted(maxCommitted,clockNativeTestSnapshot(1)),
        "uint64 max regression leaves full cpu+trace+clock unchanged");
  auto equalTicks=leaseSynthetic(1);
  check(armCanonicalClock(equalTicks,entry,plan(UINT64_MAX,maxCommitted.clock))==
        ClockArm::accepted,"equal max ticks are legal if revision advances");
  check(nsmbw_loop_frame(1)==1 &&
        inspectSyntheticClock(1).revision==2 &&
        inspectSyntheticClock(1).ticks==UINT64_MAX,
        "equal uint64 max ticks increment only canonical revision");

  // Force a revision-exhaustion corner that would otherwise require 2^64
  // successful guest operations. Test macro absent from all normal builds.
  check(clockNativeTestSetRevision(1,UINT64_MAX),
        "test-only native hook reaches revision rollover boundary");
  const auto beforeOverflow=clockNativeTestSnapshot(1);
  auto exhaustedRev=leaseSynthetic(1);
  check(armCanonicalClock(exhaustedRev,entry,plan(UINT64_MAX,beforeOverflow.clock))==
        ClockArm::revisionExhausted,"revision overflow fails CLOSED before any guest mutation");
  check(persisted(beforeOverflow,clockNativeTestSnapshot(1)),
        "revision exhaustion leaves all CPU/trace/RAM and ledger untouched");
  check(clockNativeTestSetRevision(1,2),
        "test-only restore version for separate dispatch fault simulation");

  auto pending=leaseSynthetic(1);
  check(armCanonicalClock(pending,entry,
      plan(UINT64_MAX,inspectSyntheticClock(1)))==ClockArm::accepted,
      "prepare future allowed candidate");
  check(clockNativeTestSetExpectedRevision(1,1),
        "TEST-ONLY inject stale committed revision into pending request");
  const auto staleBefore=clockNativeTestSnapshot(1);
  check(nsmbw_loop_frame(1)==1 &&
        inspectSyntheticClock(1).last==ClockOutcome::abortedRevision,
        "real scheduler aborts corrupt pending revision before writes");
  const auto staleAfter=clockNativeTestSnapshot(1);
  check(authoritativeUnchanged(staleBefore,staleAfter) &&
        !staleAfter.clock.pending,
        "rejected dispatch changes only pending/outcome, never CPU/ledger or trace");

  auto pendingPC=leaseSynthetic(1);
  check(armCanonicalClock(pendingPC,entry,
          plan(UINT64_MAX,inspectSyntheticClock(1)))==ClockArm::accepted,
        "arm correct version for hostile pre-dispatch PC tamper");
  check(clockNativeTestSetExpectedPc(1,entry+4),
        "TEST-ONLY corrupt pending PC while W03 guest PC remains unchanged");
  const auto wrongPcBefore=clockNativeTestSnapshot(1);
  check(nsmbw_loop_frame(1)==1 &&
        inspectSyntheticClock(1).last==ClockOutcome::abortedPc,
        "actual W03 denies stale PC at dispatch preflight");
  check(authoritativeUnchanged(wrongPcBefore,clockNativeTestSnapshot(1)),
        "failed-PC dispatch does not tear full CPU/ledger/trace");

  nsmbw_loop_reset();
  check(spawn(1)==1&&spawn(2)==1,
        "two guests ready for deterministic 4096-action native stress");
  // LCG fixed seed, no wall-clock or floating point. Reset epochs only at
  // controlled intervals to stress slot/owner/serial lifecycle.
  uint32_t random=0xBADC0DEu;
  bool fuzz=true;uint64_t accepted=0,rejected=0;
  unsigned active=1;
  for(unsigned i=0;i<4096;++i) {
    random=random*1664525u+1013904223u;
    if(i%97==0){
      nsmbw_loop_reset();
      active=static_cast<unsigned>((i/97u)%2u)+1u;
      fuzz &= spawn(1)==1 && spawn(2)==1;
      fuzz &= nsmbw_loop_suspend(active==1?2:1)==1;
    }
    auto snap=clockNativeTestSnapshot(active);
    auto ticket=leaseSynthetic(active);
    auto p=plan(snap.clock.ticks+1u,snap.clock);
    const unsigned mode=(random>>12u)%6u;
    ClockArm expectation=ClockArm::accepted;
    if(mode==1) {++p.sourceEpoch;expectation=ClockArm::epochMismatch;}
    if(mode==2) {++p.sourceRevision;expectation=ClockArm::staleRevision;}
    if(mode==3) {p.high32 ^= 1u;expectation=ClockArm::badPair;}
    if(mode==4 && snap.clock.ticks>0) {
      p=plan(snap.clock.ticks-1,snap.clock);expectation=ClockArm::regression;
    }
    const auto outcome=armCanonicalClock(ticket,entry,p);
    if(outcome!=expectation){fuzz=false;break;}
    if(outcome==ClockArm::accepted){
      if(nsmbw_loop_frame(1)!=1){fuzz=false;break;}
      const auto next=clockNativeTestSnapshot(active);
      if(next.clock.ticks!=p.rawTicks ||
         next.clock.revision!=snap.clock.revision+1 ||
         next.cpu.gpr[3]!=p.high32 ||
         next.cpu.gpr[4]!=p.low32 ||
         next.cpu.pc!=entry){fuzz=false;break;}
      ++accepted;
    }else{
      const auto next=clockNativeTestSnapshot(active);
      if(!persisted(snap,next)){fuzz=false;break;}
      ++rejected;
    }
  }
  check(fuzz && accepted>1000 && rejected>1000,
        "4096 seeded actual W03 mixed valid/stale/epoch/half/regressive actions preserve atomic ledger/CPU");
  check(clockNativeTestExhaustSerial(),
        "test-only max serial injection to model capability authority exhaustion");
  const auto frozen=clockNativeTestSnapshot(active);
  auto noLease=leaseSynthetic(active);
  check(armCanonicalClock(noLease,entry,plan(frozen.clock.ticks+1,frozen.clock))==
        ClockArm::invalidTicket && persisted(frozen,clockNativeTestSnapshot(active)),
        "serial wrap exhaustion prevents every new clock lease without CPU mutation");
  std::cout<<"TOTAL_CHECKS "<<tests<<'\n';
}
