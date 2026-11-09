// Phase18 Peach: REAL W03/W04/W07 synthetic scheduler transaction.
#include "../../../web-runtime/frame-host/scheduler_clock.hpp"
#include "../../../web-runtime/interop/device_policy.hpp"
#include <array>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <limits>
using namespace nsmbw::trusted_cpu;
extern "C" {
void nsmbw_loop_reset();
int nsmbw_loop_cpu_spawn(uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t);
int nsmbw_loop_frame(uint32_t);
int nsmbw_loop_tick();
int nsmbw_loop_suspend(uint32_t);
int nsmbw_loop_resume(uint32_t);
int nsmbw_loop_cancel(uint32_t);
int nsmbw_loop_reap(uint32_t);
int nsmbw_loop_retry_quota(uint32_t);
uint32_t nsmbw_loop_state(uint32_t);
uint32_t nsmbw_loop_pc(uint32_t);
uint32_t nsmbw_loop_cpu_steps(uint32_t);
uint32_t nsmbw_loop_cpu_gpr(uint32_t,uint32_t);
uint32_t nsmbw_loop_guest_error(uint32_t);
uint32_t nsmbw_loop_trace_length();
uint32_t nsmbw_loop_trace_at(uint32_t);
uint32_t nsmbw_mem_pages();
int nsmbw_mem_set_page_budget(uint32_t);
uint32_t nsmbw_mem_read32(uint32_t);
int nsmbw_mem_write32(uint32_t,uint32_t);
}
namespace {
int n=0;
void check(bool ok,const char* desc) {
  if(!ok){std::cerr<<"FAIL "<<desc<<'\n';std::exit(2);}
  ++n;std::cout<<"PASS "<<desc<<'\n';
}
constexpr uint32_t entry=0x80010000u;
int spawn(unsigned id,uint32_t input=0x80004000u) {
  return nsmbw_loop_cpu_spawn(id,entry,0x80005010u+id*0x1000u,
                             input,0x8000C000u+id*0x1000u,0);
}
CanonicalClockPlan plan(uint64_t ticks,uint64_t epoch,uint64_t revision) {
  return {ticks,static_cast<uint32_t>(ticks>>32u),
                static_cast<uint32_t>(ticks),epoch,revision};
}
CanonicalClockPlan plan(uint64_t ticks,const ClockSnapshot& snap) {
  return plan(ticks,snap.epoch,snap.revision);
}
struct Observable {
  std::array<uint32_t,32> gpr{};
  uint32_t pc=0,steps=0,traceLength=0,pages=0,guestError=0;
  ClockSnapshot clock{};
};
Observable observe(uint32_t id) {
  Observable s{};for(uint32_t i=0;i<32;i++)s.gpr[i]=nsmbw_loop_cpu_gpr(id,i);
  s.pc=nsmbw_loop_pc(id);s.steps=nsmbw_loop_cpu_steps(id);
  s.traceLength=nsmbw_loop_trace_length();s.pages=nsmbw_mem_pages();
  s.guestError=nsmbw_loop_guest_error(id);
  s.clock=inspectSyntheticClock(id);return s;
}
bool sameGuest(const Observable& a,const Observable& b) {
  return a.gpr==b.gpr && a.pc==b.pc && a.steps==b.steps &&
    a.pages==b.pages && a.traceLength==b.traceLength &&
    a.guestError==b.guestError && a.clock.ticks==b.clock.ticks &&
    a.clock.revision==b.clock.revision &&
    a.clock.committed==b.clock.committed && a.clock.pending==b.clock.pending;
}
ClockArm callbackResult=ClockArm::accepted;
Ticket callbackTicket{},callbackCopy{};
int nestedTick=0,nestedCancel=0;
bool callbackSeen=false;
NSMBDevice::Reply denyMmio(NSMBDevice::Region,NSMBDevice::Operation,
                           uint32_t,uint32_t,uint32_t) noexcept {
  const auto s=inspectSyntheticClock(2);
  callbackResult=armCanonicalClock(callbackTicket,entry,plan(9,s));
  nestedTick=nsmbw_loop_tick();
  nestedCancel=nsmbw_loop_cancel(2);
  callbackSeen=true;
  return {NSMBDevice::Result::Rejected,0};
}
}
int main(){
  nsmbw_loop_reset();
  check(spawn(1)==1&&spawn(2)==1,"real W03 creates two synthetic CPU guests");
  const auto initial=observe(1);
  const auto initialClock=initial.clock;
  check(initialClock.guestExists && initialClock.revision==0 &&
        initialClock.epoch>0 && !initialClock.pending && !initialClock.committed,
        "new canonical guest ledger starts at revision0 and W03 epoch");
  auto blank=Ticket{};
  check(armCanonicalClock(blank,entry,plan(1,initialClock))==ClockArm::invalidTicket,
        "unissued private capability denied");
  check(sameGuest(initial,observe(1)),"invalid capability cannot mutate CPU/trace/ledger");

  auto bad=leaseSynthetic(1);auto badCopy=bad;
  auto wrongEpoch=plan(1,initialClock);++wrongEpoch.sourceEpoch;
  check(armCanonicalClock(bad,entry,wrongEpoch)==ClockArm::epochMismatch,
        "candidate source epoch does not authorize W03 epoch");
  check(armCanonicalClock(bad,entry,plan(1,initialClock))==ClockArm::invalidTicket,
        "failed candidate attempt consumes local capability");
  check(armCanonicalClock(badCopy,entry,plan(1,initialClock))==ClockArm::stale,
        "failed candidate attempt retires copied capability globally");
  check(sameGuest(initial,observe(1)),"failed epoch check preserved all observed state");

  auto malformed=plan(1,initialClock);malformed.high32=1;
  auto malformedToken=leaseSynthetic(1);
  check(armCanonicalClock(malformedToken,entry,malformed)==ClockArm::badPair,
        "invalid pure candidate high32/low32 pair denied");
  check(sameGuest(initial,observe(1)),"invalid candidate halves preserve CPU/RAM/trace/ledger");

  auto staleRev=plan(1,initialClock);staleRev.sourceRevision=1;
  auto staleToken=leaseSynthetic(1);
  check(armCanonicalClock(staleToken,entry,staleRev)==ClockArm::staleRevision,
        "stale/future ledger revision denied before arm");
  check(sameGuest(initial,observe(1)),"stale revision leaves all state untouched");

  auto first=leaseSynthetic(1);
  auto firstCopy=first;
  check(armCanonicalClock(first,entry,plan(0x100000002ULL,initialClock))==ClockArm::accepted,
        "native W03 ticket prepares pure Time64 candidate at revision0");
  const auto staged=observe(1);
  check(staged.clock.pending && staged.clock.revision==0 && staged.clock.ticks==0 &&
        staged.gpr==initial.gpr && staged.pc==initial.pc,
        "prepare retains original full GPRs, PC and canonical ledger");
  check(armCanonicalClock(firstCopy,entry,plan(3,initialClock))==ClockArm::stale,
        "copied ticket cannot overwrite prepared candidate");
  check(nsmbw_loop_frame(1)==1,"real W03 scheduler executes one prepared event");
  const auto committed=observe(1);
  check(committed.clock.revision==1 && committed.clock.ticks==0x100000002ULL &&
        committed.clock.committed && !committed.clock.pending,
        "ONE canonical W03 ledger revision increments on success");
  check(committed.gpr[3]==1 && committed.gpr[4]==2 &&
        committed.pc==entry && committed.steps==0,
        "GPR3 high32 / GPR4 low32 update in same scheduler event, not guest opcode");
  check(committed.pages==initial.pages && nsmbw_loop_cpu_steps(1)==0,
        "register-only event does not allocate checked W04 RAM or step opcode");
  check(inspectSyntheticClock(2).revision==0 &&
        nsmbw_loop_cpu_gpr(2,3)==0 && nsmbw_loop_cpu_gpr(2,4)==0x80004000u,
        "different guest CPU/ledger remains independent");
  check(nsmbw_loop_suspend(2)==1,"pause guest2 for deterministic single-guest clock turns");
  auto consumed=first;
  check(armCanonicalClock(consumed,entry,plan(2,committed.clock))==ClockArm::invalidTicket,
        "single-use capability cannot replay after commit");

  auto obsolete=leaseSynthetic(1);
  check(armCanonicalClock(obsolete,entry,plan(3,initialClock))==ClockArm::staleRevision,
        "obsolete candidate revision0 denied after revision1 commit");
  const auto committedBefore=observe(1);
  check(sameGuest(committedBefore,observe(1)),
        "old revision rejected without trace/GPR/clock changes");
  auto lower=leaseSynthetic(1);
  check(armCanonicalClock(lower,entry,plan(0x100000001ULL,committed.clock))==ClockArm::regression,
        "candidate with regressive ticks denied");
  check(sameGuest(committedBefore,observe(1)),"regression rejection does not partially publish");

  auto noCarry=leaseSynthetic(1);
  check(armCanonicalClock(noCarry,entry,plan(0x1FFFFFFFFULL,committed.clock))==ClockArm::accepted,
        "64bit 32bit-boundary candidate accepted");
  check(nsmbw_loop_frame(1)==1 && inspectSyntheticClock(1).revision==2,
        "revision2 committed by actual scheduler");
  check(nsmbw_loop_cpu_gpr(1,3)==1&&nsmbw_loop_cpu_gpr(1,4)==UINT32_MAX,
        "lower32 uint32 MAX preserved exactly");
  const auto second=inspectSyntheticClock(1);
  auto carry=leaseSynthetic(1);
  check(armCanonicalClock(carry,entry,plan(0x200000000ULL,second))==ClockArm::accepted,
        "next tick exactly crosses 32bit carry");
  check(nsmbw_loop_frame(1)==1 && nsmbw_loop_cpu_gpr(1,3)==2 &&
        nsmbw_loop_cpu_gpr(1,4)==0 && inspectSyntheticClock(1).revision==3,
        "high32 carry, low32 zero and revision3 atomic");

  auto cancel=leaseSynthetic(1);
  check(armCanonicalClock(cancel,entry,plan(0x300000000ULL,inspectSyntheticClock(1)))==ClockArm::accepted,
        "prepare pending before pause");
  check(nsmbw_loop_suspend(1)==1 && !inspectSyntheticClock(1).pending,
        "pause cancels pending canonical candidate");
  const auto afterPause=inspectSyntheticClock(1);
  check(afterPause.ticks==0x200000000ULL && afterPause.revision==3,
        "pause abort leaves canonical ledger version unchanged");
  check(nsmbw_loop_resume(1)==1,"resume prepares ordinary W03 CPU step");
  check(nsmbw_loop_frame(1)==1 && nsmbw_loop_pc(1)==entry+4,
        "cancelled clock never silently publishes after resume");

  nsmbw_loop_reset();
  check(spawn(1)==1,"new W03 epoch starts fresh guest");
  auto old=leaseSynthetic(1);
  const auto preReset=inspectSyntheticClock(1);
  check(armCanonicalClock(old,entry,plan(23,preReset))==ClockArm::accepted,
        "prepared candidate pre-reset");
  nsmbw_loop_reset();
  check(spawn(1)==1 && !inspectSyntheticClock(1).pending &&
        inspectSyntheticClock(1).revision==0,
        "recycled guest ID has no pending clock or old revision");
  check(armCanonicalClock(old,entry,plan(99,preReset))!=ClockArm::accepted,
        "old epoch/owner ticket cannot control recycled slot");

  nsmbw_loop_reset();
  check(spawn(1,0xCC007000u)==1 && spawn(2)==1,
        "W07 hostile MMIO and independent READY guest created");
  check(nsmbw_loop_frame(2)==2&&nsmbw_loop_frame(2)==2&&
        nsmbw_loop_pc(1)==entry+8,"real W03 guest advances to MMIO instruction");
  callbackTicket=leaseSynthetic(2);callbackCopy=callbackTicket;
  const auto otherBefore=observe(2);
  NSMBDevice::install(NSMBDevice::Region::Mmio,denyMmio);
  check(nsmbw_loop_frame(1)==1&&callbackSeen,"W07 MMIO callback invoked from actual guest instruction");
  check(callbackResult==ClockArm::dispatchBusy && nestedTick==-2 &&
        nestedCancel==0,"hostile MMIO callback cannot arm foreign guest or reenter scheduler");
  check(armCanonicalClock(callbackCopy,entry,plan(10,otherBefore.clock))==ClockArm::stale,
        "MMIO attempted native token also retires copied lease");
  NSMBDevice::clear();
  check(inspectSyntheticClock(2).ticks==otherBefore.clock.ticks &&
        inspectSyntheticClock(2).revision==otherBefore.clock.revision &&
        nsmbw_loop_cpu_gpr(2,3)==otherBefore.gpr[3] &&
        nsmbw_loop_cpu_gpr(2,4)==otherBefore.gpr[4],
        "foreign guest CPU and canonical ledger unchanged by malicious MMIO");
  check(nsmbw_loop_state(1)==4&&nsmbw_loop_guest_error(1)==5,
        "actual W07 fault preserved, no fake clock success");

  // Seeded repeated wrap, replay and guest ID recycling through actual W03.
  bool recycled=true;
  for(uint64_t i=0;i<1024;i++){
    nsmbw_loop_reset();
    recycled &= spawn(1)==1;
    auto l=leaseSynthetic(1);
    const auto s=inspectSyntheticClock(1);
    recycled &= armCanonicalClock(l,entry,plan(i,s))==ClockArm::accepted;
    nsmbw_loop_reset();
    recycled &= spawn(1)==1;
    recycled &= armCanonicalClock(l,entry,plan(UINT64_MAX,s))!=ClockArm::accepted;
    recycled &= inspectSyntheticClock(1).revision==0 &&
                inspectSyntheticClock(1).ticks==0 &&
                nsmbw_loop_cpu_gpr(1,3)==0 &&
                nsmbw_loop_cpu_gpr(1,4)==0x80004000u;
  }
  check(recycled,"1024 real W03 guest ID+epoch recycle cycles reject stale pending tokens");

  std::cout<<"TOTAL_CHECKS "<<n<<'\n';
}
