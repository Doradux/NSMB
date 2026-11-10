// PHASE20 PEACH dual immutable SHA peer integration, NEVER Nintendo PPC.
// Both Toad V2 candidate header and Luigi generated toy leaf are compiled
// with REAL W03/W04/W07 after staged native private-ticket authorization.
#include "../../../web-runtime/frame-host/guest_cpu.hpp"
#include "../../../web-runtime/frame-host/scheduler_clock.hpp"
#include "../../../web-runtime/runtime-services/synthetic_service_v2.hpp"
#include "../../../scripts/phase20/luigi/toy_leaf_abi.hpp"
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <algorithm>
extern "C" {
 void nsmbw_loop_reset();
 int nsmbw_loop_tick();
 int nsmbw_loop_synthetic_toy_leaf_fixture_spawn(uint32_t,uint32_t,
   uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t);
 int nsmbw_loop_synthetic_service_fixture_spawn(uint32_t,uint32_t,uint32_t,
   uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t);
 int nsmbw_loop_synthetic_service_fixture_retry(uint32_t,uint32_t,
   uint32_t,uint32_t,uint32_t);
 uint32_t nsmbw_loop_synthetic_service_quota(uint32_t);
 uint32_t nsmbw_loop_synthetic_service_id(uint32_t);
 uint32_t nsmbw_loop_clock_ticks_hi(uint32_t);
 uint32_t nsmbw_loop_clock_ticks_lo(uint32_t);
 uint32_t nsmbw_loop_clock_revision_lo(uint32_t);
 uint32_t nsmbw_loop_clock_pending(uint32_t);
 uint32_t nsmbw_loop_cpu_gpr(uint32_t,uint32_t);
 uint32_t nsmbw_loop_cpu_steps(uint32_t);
 uint32_t nsmbw_loop_cpu_lr(uint32_t);
 uint32_t nsmbw_loop_pc(uint32_t);
 uint32_t nsmbw_loop_state(uint32_t);
 uint32_t nsmbw_loop_error();
 int nsmbw_loop_cancel(uint32_t);
 int nsmbw_loop_reap(uint32_t);
 int nsmbw_loop_suspend(uint32_t);
 int nsmbw_loop_resume(uint32_t);
}
namespace {
uint32_t checks=0;
void ok(bool yes,const char* what){
 if(!yes){std::cerr<<"FAIL "<<what<<"\n";std::exit(2);}
 ++checks;std::cout<<"PASS "<<what<<"\n";
}
constexpr uint32_t entry=0x80010000u;
constexpr uint32_t nanos=0x53560001u,ticks=0x53560002u;
uint32_t in(uint32_t id){return 0x80003000u+id*0x1000u;}
uint32_t out(uint32_t id){return 0x8000B000u+id*0x1000u;}
uint32_t sp(uint32_t id){return 0x8000F010u+id*0x1000u;}
bool toy(uint32_t id,uint32_t r3,uint32_t off=0,uint32_t limit=128) {
 return nsmbw_loop_synthetic_toy_leaf_fixture_spawn(
   id,sp(id),in(id),out(id),0xBEEFu,r3,off,limit)==1;
}
bool direct(uint32_t id,uint32_t sid,uint64_t value,uint32_t version=2) {
 return nsmbw_loop_synthetic_service_fixture_spawn(
  id,sp(id),in(id),out(id),0xBEEFu,version,sid,
  uint32_t(value>>32),uint32_t(value))==1;
}
bool again(uint32_t id,uint32_t sid,uint64_t value,uint32_t version=2) {
 return nsmbw_loop_synthetic_service_fixture_retry(
  id,version,sid,uint32_t(value>>32),uint32_t(value))==1;
}
uint64_t clk(uint32_t id) {
 return (uint64_t(nsmbw_loop_clock_ticks_hi(id))<<32)|
   nsmbw_loop_clock_ticks_lo(id);
}
#ifdef NSMB_PHASE18_CLOCK_TEST
using Snapshot=nsmbw::trusted_cpu::ClockNativeTestSnapshot;
Snapshot snap(uint32_t guest){return nsmbw::trusted_cpu::clockNativeTestSnapshot(guest);}
bool same(const Snapshot&a,const Snapshot&b){
 return a.valid==b.valid&&a.state==b.state&&a.error==b.error&&
  a.cpu.pc==b.cpu.pc&&a.cpu.lr==b.cpu.lr&&a.cpu.cr==b.cpu.cr&&
  a.cpu.ctr==b.cpu.ctr&&a.cpu.xer==b.cpu.xer&&
  a.cpu.fpscr==b.cpu.fpscr&&a.cpu.hid0==b.cpu.hid0&&
  a.cpu.msr==b.cpu.msr&&
  std::equal(std::begin(a.cpu.gpr),std::end(a.cpu.gpr),std::begin(b.cpu.gpr))&&
  std::equal(std::begin(a.cpu.gqr),std::end(a.cpu.gqr),std::begin(b.cpu.gqr))&&
  std::equal(std::begin(a.cpu.fpr),std::end(a.cpu.fpr),std::begin(b.cpu.fpr),
   [](const PPC_FPR&x,const PPC_FPR&y){return x.raw==y.raw;})&&
  a.clock.ticks==b.clock.ticks&&a.clock.revision==b.clock.revision&&
  a.clock.pending==b.clock.pending&&a.clock.last==b.clock.last&&
  a.trace==b.trace&&a.traceLength==b.traceLength&&
  a.traceDropped==b.traceDropped;
}
#endif
}
int main(){
 nsmbw_loop_reset();
 // The public V2 origin/quota are NOT permission or native W03 state.
 nsmbw::p20::services::RequestV2 claimed{};
 claimed.slot=1;claimed.expectedPc=entry;claimed.epoch=123;
 claimed.revision=0;claimed.value=1000000000ULL;
 nsmbw::p20::services::ViewV2 forged{};
 forged.slot=1;forged.currentPc=entry;forged.epoch=123;
 forged.revision=0;forged.claimedBudget=999999u;
 forged.origin=nsmbw::p20::services::OriginClaim::nativeScheduler;
 forged.phase=nsmbw::p20::services::PhaseClaim::ready;
 forged.enabled=true;forged.guestReady=true;
 ok(nsmbw::p20::services::compute(claimed,forged).computed(),
    "forged GateView V2 may compute PURE candidate, not native permission");
 ok(nsmbw_loop_synthetic_service_quota(1)==0 &&
    !again(1,ticks,118),"public candidate cannot create real W03 Ticket");
 ok(!direct(1,nanos,1,1)&&nsmbw_loop_state(1)==0,
    "old v1 ABI denied in explicit V2 PEER-linked path");
 ok(!direct(1,0xdeadbeefu,1)&&nsmbw_loop_state(1)==0,
    "V2 unknown ServiceId denied without created guest");
 ok(toy(1,100),"fresh invented generated C++ toy leaf fixture admitted");
 ok(nsmbw_loop_synthetic_service_quota(1)==1 &&
    nsmbw_loop_synthetic_service_id(1)==ticks,
    "W03 privately grants ONE quota for translated rawTicks service");
 ok(nsmbw_loop_clock_pending(1)==1&&
    nsmbw_loop_cpu_gpr(1,3)==100&&nsmbw_loop_cpu_steps(1)==0 &&
    nsmbw_loop_pc(1)==entry&&clk(1)==0,
    "prepare leaves toy CPU r3, PC, steps, clock and private quota uncommitted");
 ok(!again(1,ticks,999)&&nsmbw_loop_synthetic_service_quota(1)==1,
    "host cannot override staged toy candidate or spend early");
 const uint32_t oldLr=nsmbw_loop_cpu_lr(1);
 ok(nsmbw_loop_tick()==1,"W03 scheduler actually executes generated toy C++");
 ok(clk(1)==118u&&nsmbw_loop_clock_revision_lo(1)==1&&
    nsmbw_loop_cpu_gpr(1,3)==0&&nsmbw_loop_cpu_gpr(1,4)==118u,
    "invented translated PPC root 100+18 -> rawTicks118 co-committed in GPR3/GPR4+single clock");
 ok(nsmbw_loop_cpu_steps(1)==8&&nsmbw_loop_pc(1)==entry+4&&
    nsmbw_loop_cpu_lr(1)==oldLr,
    "translated toy leaf 8 steps and synthetic returnPC/LR co-committed by W03");
 ok(nsmbw_loop_synthetic_service_quota(1)==0&&
    nsmbw_loop_clock_pending(1)==0,
    "W03 same atomic native commit consumed private quota exactly once");
#ifdef NSMB_PHASE18_CLOCK_TEST
 const Snapshot before=snap(1);
#endif
 ok(!again(1,ticks,118)&&nsmbw_loop_error()!=0,
    "quota0 rejects second typed request even if same fake scalar");
#ifdef NSMB_PHASE18_CLOCK_TEST
 ok(same(before,snap(1)),
    "quota0 DENIAL preserved full W03 GPR/FPR/GQR/PC/LR/trace/clock bitwise semantics");
#endif
 ok(!toy(1,100)&&nsmbw_loop_synthetic_service_quota(1)==0,
    "existing guest cannot be given a second toy fixture quota");
 nsmbw_loop_reset();
 ok(toy(1,100,0x40u)&&nsmbw_loop_tick()==1,
    "invented nested PPC +4 leaf generated source executes under W03");
 ok(clk(1)==104&&nsmbw_loop_cpu_gpr(1,4)==104u&&
    nsmbw_loop_synthetic_service_quota(1)==0,
    "nested invented PPC leaf 100-3+7=104 and W03 quota1->0");
 nsmbw_loop_reset();
 ok(!toy(1,100,0xFADEu)&&nsmbw_loop_state(1)==0,
    "unknown invented PPC entry denied before scheduling, no minted authority");
 ok(!toy(1,100,0,1)&&nsmbw_loop_state(1)==0,
    "invented PPC step-budget failure cleans guest without clock/CPU publication");
 ok(direct(1,nanos,1000000000ULL,2)&&nsmbw_loop_tick()==1,
    "published Toad exact V2 nanos service in REAL W03 native scheduler");
 ok(clk(1)==60750000ULL&&nsmbw_loop_cpu_gpr(1,4)==60750000u&&
    nsmbw_loop_synthetic_service_quota(1)==0,
    "V2 nano 243/4000 conversion commits canonical ticks and private quota");
 nsmbw_loop_reset();
 ok(toy(1,100)&&direct(2,ticks,4294967296ULL),
    "toy guest and pure V2 guest obtain independent W03 private quotas");
 ok(nsmbw_loop_tick()==1&&nsmbw_loop_tick()==2,
    "round robin W03 dispatches both real toy/typed service candidates");
 ok(clk(1)==118u&&clk(2)==4294967296ULL&&
    nsmbw_loop_cpu_gpr(2,3)==1&&
    nsmbw_loop_synthetic_service_quota(1)==0&&
    nsmbw_loop_synthetic_service_quota(2)==0,
    "distinct guest W03 ledgers, 64bit GPR hi and quotas remain independent");
 nsmbw_loop_reset();
 ok(toy(1,100)&&nsmbw_loop_suspend(1)==1&&
    nsmbw_loop_synthetic_service_quota(1)==1,
    "suspend cancels staged toy without charging quota");
 ok(nsmbw_loop_resume(1)==1&&again(1,ticks,118)&&
    nsmbw_loop_tick()==1,
    "after resume only one remaining PRIVATE unit can commit ordinary service");
 ok(clk(1)==118&&nsmbw_loop_synthetic_service_quota(1)==0,
    "resume cannot mint extra quota or second clock revision");
 nsmbw_loop_reset();
 ok(toy(1,100)&&nsmbw_loop_cancel(1)==1&&nsmbw_loop_reap(1)==1,
    "cancel/reap destroys toy epoch/owner/quota and pending source");
 ok(!again(1,ticks,118)&&toy(1,100)&&nsmbw_loop_tick()==1,
    "recycled guest must get NEW independent typed ticket and quota");
 ok(clk(1)==118&&nsmbw_loop_synthetic_service_quota(1)==0,
    "recycled toy source cannot inherit stale state or re-spend");
 nsmbw_loop_reset();
 bool stress=true;
 for(uint32_t i=0;i<256u;i++){
  nsmbw_loop_reset();
  const uint32_t initial=100u+i;
  stress &=toy(1,initial);
  stress &=nsmbw_loop_synthetic_service_quota(1)==1;
  stress &=nsmbw_loop_tick()==1;
  stress &=clk(1)==uint64_t(initial+18u);
  stress &=nsmbw_loop_cpu_steps(1)==8;
  stress &=nsmbw_loop_synthetic_service_quota(1)==0;
  stress &=!again(1,ticks,initial+18u);
 }
 ok(stress,"256 native actual W03 translated toy+V2+private quota cycles");
 std::cout<<"TOTAL_CHECKS "<<checks<<'\n';
}
