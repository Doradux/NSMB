// P20 RED/GREEN: production-linked W03/W04/W07, invented ONLY.
// No original Nintendo bytes or public JS Ticket/CpuContext pointer.
#include "../../../web-runtime/frame-host/scheduler_clock.hpp"
#include "../../../web-runtime/frame-host/guest_cpu.hpp"
#include "../../../web-runtime/runtime-services/synthetic_service_dispatch.hpp"
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <algorithm>
extern "C" {
 void nsmbw_loop_reset();
 int nsmbw_loop_tick();
 int nsmbw_loop_synthetic_service_fixture_spawn(uint32_t,uint32_t,uint32_t,
   uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t);
 int nsmbw_loop_synthetic_service_fixture_retry(uint32_t,uint32_t,uint32_t,
   uint32_t,uint32_t);
 uint32_t nsmbw_loop_synthetic_service_quota(uint32_t);
 uint32_t nsmbw_loop_synthetic_service_id(uint32_t);
 int nsmbw_loop_cpu_spawn(uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t);
 uint32_t nsmbw_loop_cpu_gpr(uint32_t,uint32_t);
 uint32_t nsmbw_loop_cpu_steps(uint32_t);
 uint32_t nsmbw_loop_clock_ticks_hi(uint32_t);
 uint32_t nsmbw_loop_clock_ticks_lo(uint32_t);
 uint32_t nsmbw_loop_clock_revision_lo(uint32_t);
 uint32_t nsmbw_loop_clock_outcome(uint32_t);
 uint32_t nsmbw_loop_clock_pending(uint32_t);
 uint32_t nsmbw_loop_state(uint32_t);
 uint32_t nsmbw_loop_pc(uint32_t);
 uint32_t nsmbw_loop_error();
 int nsmbw_loop_cancel(uint32_t);
 int nsmbw_loop_reap(uint32_t);
 int nsmbw_loop_suspend(uint32_t);
 int nsmbw_loop_resume(uint32_t);
 int nsmbw_mem_set_page_budget(uint32_t);
 uint32_t nsmbw_mem_pages();
}
namespace {
unsigned checks=0;
void expect(bool condition,const char* name) {
 if(!condition){std::cerr<<"FAIL "<<name<<'\n';std::exit(3);}
 ++checks;std::cout<<"PASS "<<name<<'\n';
}
constexpr uint32_t nsId=0x53560001u, rawId=0x53560002u;
constexpr uint32_t entry=0x80010000u;
constexpr uint32_t input(uint32_t id){return 0x80003000u+0x1000u*id;}
constexpr uint32_t output(uint32_t id){return 0x8000B000u+0x1000u*id;}
constexpr uint32_t stack(uint32_t id){return 0x8000F010u+0x1000u*id;}
uint64_t clock(uint32_t id){
 return (uint64_t(nsmbw_loop_clock_ticks_hi(id))<<32)|
   uint64_t(nsmbw_loop_clock_ticks_lo(id));
}
bool spawn(uint32_t id,uint32_t service,uint64_t value,uint32_t version=1) {
 return nsmbw_loop_synthetic_service_fixture_spawn(id,stack(id),input(id),
  output(id),0xBEEFu,version,service,uint32_t(value>>32),uint32_t(value))==1;
}
bool retry(uint32_t id,uint32_t service,uint64_t value,uint32_t version=1) {
 return nsmbw_loop_synthetic_service_fixture_retry(id,version,service,
   uint32_t(value>>32),uint32_t(value))==1;
}
#ifdef NSMB_PHASE18_CLOCK_TEST
using Snapshot=nsmbw::trusted_cpu::ClockNativeTestSnapshot;
Snapshot capture(uint32_t id){return nsmbw::trusted_cpu::clockNativeTestSnapshot(id);}
bool identicalGuest(const Snapshot& a,const Snapshot& b) {
 // No requirement for padding bytes to be equal: compare every guest CPU
 // semantic component, all canonical clock metadata, RAM-independent trace.
 return a.valid==b.valid&&a.state==b.state&&a.error==b.error&&
  a.cpu.pc==b.cpu.pc&&a.cpu.lr==b.cpu.lr&&a.cpu.cr==b.cpu.cr&&
  a.cpu.ctr==b.cpu.ctr&&a.cpu.xer==b.cpu.xer&&
  a.cpu.fpscr==b.cpu.fpscr&&a.cpu.hid0==b.cpu.hid0&&
  a.cpu.msr==b.cpu.msr&&
  std::equal(std::begin(a.cpu.gpr),std::end(a.cpu.gpr),std::begin(b.cpu.gpr))&&
  std::equal(std::begin(a.cpu.gqr),std::end(a.cpu.gqr),std::begin(b.cpu.gqr))&&
  std::equal(std::begin(a.cpu.fpr),std::end(a.cpu.fpr),std::begin(b.cpu.fpr),
             [](const PPC_FPR& x,const PPC_FPR& y){return x.raw==y.raw;})&&
  a.clock.guestExists==b.clock.guestExists&&
  a.clock.committed==b.clock.committed&&a.clock.pending==b.clock.pending&&
  a.clock.ticks==b.clock.ticks&&a.clock.revision==b.clock.revision&&
  a.clock.epoch==b.clock.epoch&&a.clock.last==b.clock.last&&
  a.trace==b.trace&&a.traceLength==b.traceLength&&
  a.traceDropped==b.traceDropped;
}
#endif
}
int main(){
 nsmbw_loop_reset();
 // Independent PURE dispatcher accepts a caller-FORGED request/view: NOT a grant.
 nsmbw::p19::services::Request req{};
 req.version=1;req.id=nsmbw::p19::services::ServiceId::rawClockFromNanoseconds;
 req.slot=1;req.expectedPc=entry;req.epoch=7;req.revision=0;
 req.serial=909;req.value=1000000000ULL;
 nsmbw::p19::services::GateView fake{};
 fake.enabled=true;fake.origin=nsmbw::p19::services::Origin::nativeScheduler;
 fake.phase=nsmbw::p19::services::Phase::ready;
 fake.slot=1;fake.pc=entry;fake.epoch=7;fake.revision=0;
 fake.serial=909;fake.remainingBudget=9999;fake.guestReady=true;
 const auto untrusted=nsmbw::p19::services::prepare(req,fake);
 expect(untrusted.computed()&&untrusted.candidate.ticks==60750000ULL,
  "caller can forge candidateOnly but it is never W03 authority");
 expect(nsmbw_loop_synthetic_service_quota(1)==0 &&
  nsmbw_loop_clock_pending(1)==0,"forged GateView creates NO W03 context or permission");
 expect(!retry(1,nsId,1000000000ULL),
  "public retry cannot mint arbitrary guest Ticket from forged GateView");
 expect(spawn(1,nsId,1000000000ULL),
  "native W03 creates NEW only P20 fixed-PC typed fixture with quota1");
 expect(nsmbw_loop_pc(1)==entry &&
  nsmbw_loop_synthetic_service_quota(1)==1 &&
  nsmbw_loop_synthetic_service_id(1)==nsId,
  "private W03 quota=1/read-only service ID and fixed PC");
 expect(clock(1)==0 && nsmbw_loop_clock_revision_lo(1)==0 &&
  nsmbw_loop_cpu_gpr(1,4)==input(1),
  "prepare does not publish CPU registers or canonical ledger");
 expect(nsmbw_loop_clock_pending(1)==1&&nsmbw_loop_cpu_steps(1)==0,
  "real private Ticket only stages one scheduler clock event");
 expect(!retry(1,nsId,1000000000ULL) &&
  nsmbw_loop_synthetic_service_quota(1)==1,
  "second pending attempt rejected without burning budget");
 expect(nsmbw_loop_tick()==1 &&nsmbw_loop_pc(1)==entry &&
  nsmbw_loop_cpu_steps(1)==0,
  "real W03 native scheduler tick commits service, not PPC step");
 expect(clock(1)==60750000ULL&&nsmbw_loop_clock_revision_lo(1)==1&&
  nsmbw_loop_cpu_gpr(1,3)==0&&nsmbw_loop_cpu_gpr(1,4)==60750000u,
  "GPR3/GPR4 + canonical 64-bit Time64 ledger + revision atomic commit");
 expect(nsmbw_loop_synthetic_service_quota(1)==0 &&
  nsmbw_loop_clock_pending(1)==0&&nsmbw_loop_clock_outcome(1)==1,
  "same W03 commit exhausted private quota 1->0 exactly once");
#ifdef NSMB_PHASE18_CLOCK_TEST
 const Snapshot afterCommit=capture(1);
#endif
 expect(!retry(1,nsId,2000000000ULL) &&nsmbw_loop_error()!=0,
  "quota=0 rejects second service even valid ID/clock input");
#ifdef NSMB_PHASE18_CLOCK_TEST
 expect(identicalGuest(afterCommit,capture(1)),
  "quota rejection preserves entire CPU/FPR/GQR/PC/LR/trace/clock snapshot");
#endif
 expect(nsmbw_loop_synthetic_service_quota(1)==0 &&
  nsmbw_loop_clock_revision_lo(1)==1,
  "quota denial never refunds or advances canonical clock version");
 expect(!spawn(1,rawId,UINT64_MAX),
  "duplicate new fixture cannot override existing guest or quota");
 expect(!retry(1,0xFFFFFFFFu,UINT64_MAX),
  "unknown service never becomes a Ticket or resets quota");
 expect(!retry(1,nsId,2,99),
  "bad version never grants authority or quota");
 expect(!retry(1,rawId,UINT64_MAX),
  "quota=0 also applies independently to alternate allowed service ID");
 nsmbw_loop_reset();
 expect(!spawn(1,0xDEADBEEFu,0)&&!spawn(1,nsId,1,9),
  "invalid service ID or version rejected BEFORE guest and token creation");
 expect(nsmbw_loop_state(1)==0 &&nsmbw_loop_synthetic_service_quota(1)==0,
  "invalid fixture leaves no guest state");
 expect(spawn(1,rawId,UINT64_MAX)&&nsmbw_loop_tick()==1,
  "raw TICKS alternate allowed ID uses same native quota commit");
 expect(clock(1)==UINT64_MAX&&nsmbw_loop_cpu_gpr(1,3)==UINT32_MAX&&
  nsmbw_loop_cpu_gpr(1,4)==UINT32_MAX&&
  nsmbw_loop_synthetic_service_quota(1)==0,
  "full 64-bit raw ticks and GPR high/low committed under same quota");
 nsmbw_loop_reset();
 expect(spawn(1,nsId,UINT64_MAX)&&nsmbw_loop_tick()==1,
  "max uint64 nanos uses exact pure integer Time64 conversion");
 expect(clock(1)==nsmbw::w18::fromNanoseconds(UINT64_MAX).candidate.ticks&&
  nsmbw_loop_synthetic_service_quota(1)==0,
  "uint64 nano bound does not overflow or bypass W03 budget");
 nsmbw_loop_reset();
 expect(spawn(1,nsId,1000000000ULL),"new fixture quota1 for pause/cancel");
 expect(nsmbw_loop_suspend(1)==1&&nsmbw_loop_synthetic_service_quota(1)==1,
  "suspend cancels pending without consuming reserved private quota");
 expect(nsmbw_loop_resume(1)==1&&retry(1,nsId,1000000000ULL),
  "resumed guest may request exactly its remaining real quota");
 expect(nsmbw_loop_tick()==1 &&nsmbw_loop_synthetic_service_quota(1)==0,
  "cancel/resume cannot double-spend one quota");
 nsmbw_loop_reset();
 expect(spawn(1,nsId,2000000000ULL)&&
  nsmbw_loop_cancel(1)==1&&nsmbw_loop_reap(1)==1,
  "cancel/reap destroys private budget and pending authority");
 expect(!retry(1,nsId,1000000000ULL),
  "recycled old ID has no ticket/quota without new explicit fixture");
 expect(spawn(1,nsId,1000000000ULL)&&
  nsmbw_loop_synthetic_service_quota(1)==1&&nsmbw_loop_tick()==1,
  "recycled ID ONLY new W03 spawn receives independent quota1");
 expect(clock(1)==60750000ULL&&nsmbw_loop_synthetic_service_quota(1)==0,
  "recycled ID clock and budget independent of prior cancelled guest");
 nsmbw_loop_reset();
 expect(spawn(1,nsId,0)&&spawn(2,rawId,0),
  "two simultaneous guests each have distinct PRIVATE quota1");
 expect(nsmbw_loop_tick()==1&&nsmbw_loop_tick()==2,
  "round-robin consumes per guest individual W03 quota only once");
 expect(nsmbw_loop_synthetic_service_quota(1)==0 &&
  nsmbw_loop_synthetic_service_quota(2)==0 &&
  nsmbw_loop_clock_revision_lo(1)==1&&nsmbw_loop_clock_revision_lo(2)==1,
  "no global quota, no duplicated Time64 mutable ledger");
 nsmbw_loop_reset();
 expect(nsmbw_mem_set_page_budget(0)==1&&spawn(1,nsId,1000000000ULL),
  "private service fixture requires NO guest memory allocation");
 expect(nsmbw_loop_tick()==1 && nsmbw_mem_pages()==0 &&
  nsmbw_loop_synthetic_service_quota(1)==0,
  "register-only service commits even at W04 page quota zero");
 expect(nsmbw_loop_tick()==1 && nsmbw_loop_state(1)==4 &&
  clock(1)==60750000ULL&&nsmbw_loop_synthetic_service_quota(1)==0,
  "subsequent W04 checked memory fault does not tear clock/quota commit");
 nsmbw_loop_reset();
 bool stress=true;
 for(unsigned i=0;i<256;++i){
   nsmbw_loop_reset();
   const uint64_t v=uint64_t(i)*1000000u;
   stress &= spawn(1,nsId,v)&&nsmbw_loop_synthetic_service_quota(1)==1;
   stress &= nsmbw_loop_tick()==1;
   stress &= nsmbw_loop_synthetic_service_quota(1)==0;
   stress &= clock(1)==nsmbw::w18::fromNanoseconds(v).candidate.ticks;
   stress &= !retry(1,nsId,v)&&nsmbw_loop_clock_revision_lo(1)==1;
 }
 expect(stress,"256 exact native W03 private quota reset/commit/second-deny cycles");
 std::cout<<"TOTAL_CHECKS "<<checks<<'\n';
}
