// PHASE17 RED/GREEN native integration: ACTUAL W03 scheduler + W04/W07 C++,
// not a JS mock, Nintendo guest, Wii HLE, or original function.
#include "../../../web-runtime/frame-host/scheduler_clock.hpp"
#include "../../../web-runtime/interop/device_policy.hpp"
#include <cstdint>
#include <cstdlib>
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
uint32_t nsmbw_loop_cpu_lr(uint32_t);
uint32_t nsmbw_loop_cpu_gqr(uint32_t,uint32_t);
uint32_t nsmbw_loop_guest_error(uint32_t);
int nsmbw_mem_write32(uint32_t,uint32_t);
uint32_t nsmbw_mem_read32(uint32_t);
uint32_t nsmbw_mem_pages();
int nsmbw_mem_set_page_budget(uint32_t);
}
namespace {
int checked=0;
void verify(bool condition,const char* reason) {
  if(!condition) { std::cerr<<"FAIL "<<reason<<'\n';std::exit(2); }
  std::cout<<"PASS "<<reason<<'\n'; ++checked;
}
constexpr uint32_t pc=0x80010000u, ret=0x8001FFF0u;
int spawn(uint32_t id,uint32_t input=0x80004000u) {
  return nsmbw_loop_cpu_spawn(id,pc,0x80005010u+id*0x1000u,
                             input,0x8000C000u+id*0x1000u,0);
}
ClockArm callbackArm=ClockArm::accepted;
Ticket hostileToken{};
Ticket hostileCopy{};
bool callbackChecked=false;
int callbackResetState=-1, callbackSpawn=-1,callbackNested=-1;
NSMBDevice::Reply mmioCallback(NSMBDevice::Region,NSMBDevice::Operation,
                               uint32_t,uint32_t,uint32_t) noexcept {
  callbackArm=armSyntheticClock(hostileToken,pc,0xDEAD1234ABCDEF09ULL);
  nsmbw_loop_reset();
  callbackResetState=static_cast<int>(nsmbw_loop_state(1));
  callbackSpawn=spawn(3);
  callbackNested=nsmbw_loop_tick();
  callbackChecked=true;
  return {NSMBDevice::Result::Rejected,0};
}
}
int main() {
  nsmbw_loop_reset();
  verify(spawn(1)==1,"spawn real W03 kind1 context");
  verify(spawn(2)==1,"spawn second isolated W03 context");
  const auto empty=inspectSyntheticClock(1);
  verify(empty.guestExists && !empty.pending && !empty.committed &&
         empty.last==ClockOutcome::none,"new guest has empty service ledger");
  auto absent=Ticket{};
  verify(armSyntheticClock(absent,pc,12)==ClockArm::invalidTicket,
         "empty private token cannot arm service");
  auto badPC=leaseSynthetic(1);
  auto badPCCopy=badPC;
  verify(armSyntheticClock(badPC,pc+4,123)==ClockArm::wrongPc,
         "wrong expectedPC rejects before any guest mutation");
  verify(armSyntheticClock(badPC,pc,5)==ClockArm::invalidTicket,
         "rejected attempt consumes original private ticket");
  verify(armSyntheticClock(badPCCopy,pc,5)==ClockArm::stale,
         "rejected attempt globally retires copied ticket");
  verify(nsmbw_loop_cpu_gpr(1,3)==0 && nsmbw_loop_cpu_gpr(1,4)==0x80004000u &&
         nsmbw_mem_pages()==0,"rejected arm leaves GPR/RAM/page count unchanged");

  auto token=leaseSynthetic(1);
  auto replay=token;
  verify(armSyntheticClock(token,pc,0x100000002ULL)==ClockArm::accepted,
         "trusted native lease arms a 64-bit candidate without publishing");
  const auto prepared=inspectSyntheticClock(1);
  verify(prepared.pending && !prepared.committed && prepared.ticks==0,
         "arm is strictly prepare-only, ledger not committed");
  verify(nsmbw_loop_cpu_gpr(1,3)==0 && nsmbw_loop_cpu_gpr(1,4)==0x80004000u &&
         nsmbw_loop_pc(1)==pc && nsmbw_mem_pages()==0,
         "prepare has no guest CPU or checked RAM side effects");
  verify(armSyntheticClock(replay,pc,9)==ClockArm::stale,
         "copied token cannot arm second candidate");
  auto whilePending=leaseSynthetic(1);
  verify(armSyntheticClock(whilePending,pc,9)!=ClockArm::accepted,
         "outstanding pre-dispatch request blocks another lease");
  verify(nsmbw_loop_frame(1)==1,"real native scheduler dispatches pending service");
  const auto committed=inspectSyntheticClock(1);
  verify(committed.guestExists && committed.committed && !committed.pending &&
         committed.ticks==0x100000002ULL && committed.last==ClockOutcome::committed,
         "real W03 tick commits local synthetic ledger exactly once");
  verify(nsmbw_loop_cpu_gpr(1,3)==1 && nsmbw_loop_cpu_gpr(1,4)==2,
         "scheduler commits upper32 in GPR3, lower32 in GPR4");
  verify(nsmbw_loop_pc(1)==pc && nsmbw_loop_cpu_lr(1)==ret &&
         nsmbw_loop_cpu_gpr(1,1)==0x80006010u &&
         nsmbw_loop_cpu_steps(1)==0,"clock event does not execute guest opcode or move PC/LR/SP");
  verify(nsmbw_mem_pages()==0 && nsmbw_loop_cpu_gqr(1,0)==0,
         "clock event does not allocate checked RAM or write GQR");
  verify(armSyntheticClock(token,pc,1)==ClockArm::invalidTicket,
         "original ticket cannot replay after commit");
  const auto other=inspectSyntheticClock(2);
  verify(other.guestExists && !other.committed && !other.pending,
         "independent guest2 local ledger unaffected");

  verify(nsmbw_loop_suspend(2)==1,"pause guest2 to isolate deterministic dispatch");
  auto regression=leaseSynthetic(1);
  verify(armSyntheticClock(regression,pc,0x100000001ULL)==ClockArm::regression,
         "monotonic local ledger denies decreasing candidate at prepare");
  verify(inspectSyntheticClock(1).ticks==0x100000002ULL &&
         nsmbw_loop_cpu_gpr(1,3)==1 && nsmbw_loop_cpu_gpr(1,4)==2,
         "regression cannot mutate committed CPU/ledger");
  auto next=leaseSynthetic(1);
  verify(armSyntheticClock(next,pc,0x200000000ULL)==ClockArm::accepted,
         "fresh trusted ticket arms next candidate");
  verify(nsmbw_loop_frame(1)==1 && inspectSyntheticClock(1).ticks==0x200000000ULL,
         "scheduler commits next increasing tick");
  verify(nsmbw_loop_cpu_gpr(1,3)==2&&nsmbw_loop_cpu_gpr(1,4)==0,
         "cross-low32 carry remains lossless");

  auto paused=leaseSynthetic(1);
  verify(armSyntheticClock(paused,pc,0x300000000ULL)==ClockArm::accepted,
         "prepare pending before pause");
  verify(nsmbw_loop_suspend(1)==1,"suspend pending service guest");
  verify(!inspectSyntheticClock(1).pending &&
         inspectSyntheticClock(1).ticks==0x200000000ULL,
         "suspend aborts pending candidate without ledger mutation");
  verify(nsmbw_loop_resume(1)==1,"resume guest after cancellation");
  verify(nsmbw_loop_frame(1)==1 && nsmbw_loop_pc(1)==pc+4u,
         "aborted pending service never silently executes after resume");
  verify(inspectSyntheticClock(1).ticks==0x200000000ULL,
         "ordinary W03 step after cancelled service does not change ledger");
  auto unsupportedPC=leaseSynthetic(1);
  verify(armSyntheticClock(unsupportedPC,pc+4u,0x400000000ULL)==ClockArm::unsupportedPc,
         "even an actual matching nonallowlisted synthetic PC cannot claim a clock service");
  verify(nsmbw_loop_cpu_gpr(1,3)==2&&nsmbw_loop_cpu_gpr(1,4)==0 &&
         inspectSyntheticClock(1).ticks==0x200000000ULL,
         "denied nonallowlisted PC leaves GPR pair and ledger unchanged");

  nsmbw_loop_reset();
  verify(spawn(1)==1,"new epoch first guest");
  auto staleOnReset=leaseSynthetic(1);
  verify(armSyntheticClock(staleOnReset,pc,111)==ClockArm::accepted,
         "arm request before full reset");
  nsmbw_loop_reset();
  verify(spawn(1)==1 && !inspectSyntheticClock(1).pending &&
         !inspectSyntheticClock(1).committed,
         "reset erases pending candidate and starts new generation");
  verify(armSyntheticClock(staleOnReset,pc,222)!=ClockArm::accepted,
         "old epoch private ticket cannot arm recycled guest");
  verify(nsmbw_loop_cpu_gpr(1,3)==0 && nsmbw_loop_cpu_gpr(1,4)==0x80004000u,
         "reset/guest recycling cannot tear GPR pair");

  auto cancelled=leaseSynthetic(1);
  verify(armSyntheticClock(cancelled,pc,17)==ClockArm::accepted,
         "arm context before terminal cancellation");
  verify(nsmbw_loop_cancel(1)==1 && nsmbw_loop_reap(1)==1,
         "cancel and reap actual W03 context");
  verify(spawn(1)==1 && !inspectSyntheticClock(1).pending,
         "reused guest ID after reap cannot inherit old request");

  // Failure of a checked RAM instruction after a previous clock sample must
  // retain already-committed tick; no fabricated time from quota failure.
  nsmbw_loop_reset();
  verify(spawn(1)==1 && nsmbw_mem_set_page_budget(0)==1,
         "guest with quota zero can be spawned without memory allocation");
  auto zeroQuota=leaseSynthetic(1);
  verify(armSyntheticClock(zeroQuota,pc,0xFFFFFFFF00000005ULL)==ClockArm::accepted,
         "register-only prepare is independent of guest RAM quota");
  verify(nsmbw_loop_frame(1)==1 && nsmbw_mem_pages()==0,
         "scheduler commits clock without allocating any W04 page");
  verify(inspectSyntheticClock(1).ticks==0xFFFFFFFF00000005ULL &&
         nsmbw_loop_cpu_gpr(1,3)==0xFFFFFFFFu && nsmbw_loop_cpu_gpr(1,4)==5,
         "r3/r4 and local ledger committed at quota0");
  verify(nsmbw_loop_frame(1)==1 && nsmbw_loop_state(1)==4 &&
         nsmbw_loop_guest_error(1)==3,
         "next genuine checked RAM opcode faults under quota0");
  verify(inspectSyntheticClock(1).ticks==0xFFFFFFFF00000005ULL &&
         nsmbw_mem_pages()==0,"quota fault cannot roll back prior committed clock or leak pages");
  verify(nsmbw_mem_set_page_budget(2)==1 && nsmbw_loop_retry_quota(1)==1,
         "W04 quota growth and explicit retry still work");

  nsmbw_loop_reset();
  verify(spawn(1,0xCC007000u)==1 && spawn(2)==1,
         "create MMIO synthetic guest and distinct ready guest");
  verify(nsmbw_loop_frame(2)==2 && nsmbw_loop_pc(1)==pc+4u,
         "initial stack operation advances W03 both guests");
  verify(nsmbw_loop_frame(2)==2 && nsmbw_loop_pc(1)==pc+8u,
         "guest reaches checked MMIO read instruction");
  hostileToken=leaseSynthetic(2);
  hostileCopy=hostileToken;
  NSMBDevice::install(NSMBDevice::Region::Mmio,mmioCallback);
  verify(nsmbw_loop_frame(1)==1 && callbackChecked,
         "scheduler actually enters hostile typed W07 MMIO callback");
  verify(callbackArm==ClockArm::dispatchBusy,
         "device callback cannot arm another READY guest during dispatch");
  verify(armSyntheticClock(hostileCopy,pc+8u,0x8888ULL)!=ClockArm::accepted,
         "attempted hostile callback invalidates copied token");
  verify(callbackResetState==1 && callbackSpawn==0 && callbackNested==-2,
         "callback cannot reset, spawn or recursively dispatch W03");
  verify(!inspectSyntheticClock(2).pending && !inspectSyntheticClock(2).committed &&
         nsmbw_loop_cpu_gpr(2,3)==0 && nsmbw_loop_cpu_gpr(2,4)==0x80004000u,
         "MMIO hostile attempt leaves other GPR pair and ledger unchanged");
  verify(nsmbw_loop_state(1)==4 && nsmbw_loop_guest_error(1)==5,
         "W07 MMIO rejection remains actual guest FAULT, not fake service success");
  NSMBDevice::clear();

  // Seeded reset/recycle stress validates no delayed pending clock release.
  bool stress=true;
  for(unsigned i=0;i<128;i++) {
    nsmbw_loop_reset();
    stress &= spawn(1)==1;
    auto t=leaseSynthetic(1);
    stress &= armSyntheticClock(t,pc,(static_cast<uint64_t>(i)<<32u)|i)==ClockArm::accepted;
    nsmbw_loop_reset();
    stress &= spawn(1)==1;
    stress &= !inspectSyntheticClock(1).pending && !inspectSyntheticClock(1).committed;
    stress &= armSyntheticClock(t,pc,UINT64_MAX)!=ClockArm::accepted;
    stress &= nsmbw_loop_cpu_gpr(1,3)==0 && nsmbw_loop_cpu_gpr(1,4)==0x80004000u;
  }
  verify(stress,"128 real W03 reset/recycle cycles never apply pending stale clock");
  std::cout<<"TOTAL_CHECKS "<<checked<<'\n';
}
