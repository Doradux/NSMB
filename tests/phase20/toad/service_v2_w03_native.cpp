// Cross-component real W03 native scheduler + PURE P20 V2 candidate.
// This is NOT P20 REAL PRIVATE QUOTA until Peach publishes that source.
// Zero CPU/ledger mutation from public ViewV2 or forged claimedBudget.
#include "scheduler_clock.hpp"
#include "synthetic_service_v2.hpp"
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>
using namespace nsmbw::trusted_cpu;
namespace svc=nsmbw::p20::services;
extern "C" {
 void nsmbw_loop_reset();
 int nsmbw_loop_cpu_spawn(uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t);
 int nsmbw_loop_frame(uint32_t);
 int nsmbw_loop_suspend(uint32_t);
 uint32_t nsmbw_loop_pc(uint32_t);
 uint32_t nsmbw_loop_cpu_steps(uint32_t);
 uint32_t nsmbw_loop_cpu_gpr(uint32_t,uint32_t);
 uint32_t nsmbw_mem_pages();
}
uint32_t total=0;
void ok(bool value,const char* what){
 if(!value){std::cerr<<"FAIL "<<what<<"\n";std::exit(8);}
 ++total;std::cout<<"PASS "<<what<<"\n";
}
bool spawn(uint32_t slot){
 return nsmbw_loop_cpu_spawn(slot,svc::kSyntheticPc,
  0x80005010u+slot*0x1000u,0x80004000u,
  0x8000C000u+slot*0x1000u,0)==1;
}
struct Inputs{svc::RequestV2 req{};svc::ViewV2 view{};};
Inputs proposal(uint32_t slot,const ClockSnapshot& snap,uint64_t value,
 svc::ServiceId service=svc::ServiceId::rawClockFromNanoseconds){
 Inputs p{};
 p.req.version=svc::kAbiVersion;p.req.service=service;
 p.req.slot=slot;p.req.expectedPc=svc::kSyntheticPc;
 p.req.epoch=snap.epoch;p.req.revision=snap.revision;p.req.value=value;
 p.view.slot=slot;p.view.currentPc=svc::kSyntheticPc;
 p.view.epoch=snap.epoch;p.view.revision=snap.revision;
 p.view.previousTicks=snap.ticks;p.view.hasPrevious=snap.committed;
 p.view.claimedBudget=999999u; // DELIBERATELY FORGED AND UNTRUSTED
 p.view.origin=svc::OriginClaim::nativeScheduler;
 p.view.phase=svc::PhaseClaim::ready;
 p.view.guestReady=true;p.view.enabled=true;
 return p;
}
CanonicalClockPlan plan(svc::CandidateV2 c) noexcept {
 return {c.rawTicks,c.high32,c.low32,c.sourceEpoch,c.sourceRevision};
}
bool unchanged(uint32_t id,ClockSnapshot s,uint32_t r3,uint32_t r4,
 uint32_t pc,uint32_t steps,uint32_t pages){
 const auto c=inspectSyntheticClock(id);
 return c.guestExists==s.guestExists&&c.pending==s.pending&&
  c.committed==s.committed&&c.epoch==s.epoch&&
  c.ticks==s.ticks&&c.revision==s.revision&&
  nsmbw_loop_cpu_gpr(id,3)==r3&&nsmbw_loop_cpu_gpr(id,4)==r4&&
  nsmbw_loop_pc(id)==pc&&nsmbw_loop_cpu_steps(id)==steps&&
  nsmbw_mem_pages()==pages;
}
int main(){
 nsmbw_loop_reset();
 ok(spawn(1)&&spawn(2),"native W03 creates two fictional guests");
 const auto before=inspectSyntheticClock(1);
 ok(before.guestExists&&before.epoch>0&&!before.committed&&
    before.revision==0,"native clock ledger is real and initially empty");
 auto p=proposal(1,before,1000000000ULL);
 const auto c=svc::compute(p.req,p.view);
 ok(c.computed()&&svc::consistent(c.candidate)&&
   c.candidate.rawTicks==60750000ULL&&
   c.candidate.proposedCost==1,
   "forged PUBLIC V2 view can calculate but CANNOT authorize");
 ok(unchanged(1,before,0,0x80004000u,svc::kSyntheticPc,0,0),
   "public compute never mutates W03 CPU/ledger/W04 RAM");
 auto invalid=Ticket{};
 ok(armCanonicalClock(invalid,svc::kSyntheticPc,plan(c.candidate))==
    ClockArm::invalidTicket,"forged public view and fake budget not a W03 Ticket");
 ok(unchanged(1,before,0,0x80004000u,svc::kSyntheticPc,0,0),
   "forged request denial changes ZERO native state");
 for(const auto origin : {svc::OriginClaim::jsHost,
    svc::OriginClaim::w07Callback,svc::OriginClaim::mmio,
    svc::OriginClaim::irq}){
    p.view.origin=origin;
    ok(svc::compute(p.req,p.view).status==
      svc::StatusV2::forbiddenOriginClaim,
      "obvious nonnative origin denied as preflight only");
 }
 p.view.origin=svc::OriginClaim::nativeScheduler;
 p.view.claimedBudget=std::numeric_limits<uint32_t>::max();
 auto updated=svc::compute(p.req,p.view);
 ok(updated.computed(),
    "attacker can FORGE native origin+MAX public quota — still not grant");
 invalid=Ticket{};
 ok(armCanonicalClock(invalid,svc::kSyntheticPc,plan(updated.candidate))==
    ClockArm::invalidTicket,
    "forged huge quota cannot bypass W03 native Ticket");
 ok(unchanged(1,before,0,0x80004000u,svc::kSyntheticPc,0,0),
   "forged huge quota leaves native CPU/GPR/RAM/clock unchanged");
 auto ticket=leaseSynthetic(1);auto replay=ticket;
 ok(armCanonicalClock(ticket,svc::kSyntheticPc,plan(c.candidate))==
    ClockArm::accepted,
    "PRIVATE W03-issued one-use Ticket stages V2 pure candidate");
 ok(inspectSyntheticClock(1).pending&&
    nsmbw_loop_cpu_gpr(1,4)==0x80004000u,
    "arm stages only, no eager GPR or clock write");
 ok(armCanonicalClock(replay,svc::kSyntheticPc,plan(c.candidate))==
    ClockArm::stale,"private Ticket clone cannot reuse authority");
 ok(nsmbw_loop_frame(1)==1,"native W03 actual scheduler dispatch");
 const auto committed=inspectSyntheticClock(1);
 ok(committed.committed&&!committed.pending&&
    committed.revision==1&&committed.ticks==60750000ULL,
    "one W03 ledger commits value and revision");
 ok(nsmbw_loop_cpu_gpr(1,3)==0&&
    nsmbw_loop_cpu_gpr(1,4)==60750000U&&
    nsmbw_loop_pc(1)==svc::kSyntheticPc&&
    nsmbw_loop_cpu_steps(1)==0&&nsmbw_mem_pages()==0,
    "native W03 GPR3/GPR4 co-committed, guest RAM unchanged");
 ok(inspectSyntheticClock(2).revision==0&&
    nsmbw_loop_cpu_gpr(2,4)==0x80004000u,
    "second guest clocks and GPRs isolated");
 ok(nsmbw_loop_suspend(2)==1,
    "suspend other guest to pin scheduler selection");
 p=proposal(1,committed,60750001ULL,
     svc::ServiceId::rawClockFromTicks);
 const auto c2=svc::compute(p.req,p.view);
 ok(c2.computed()&&c2.candidate.rawTicks==60750001ULL,
    "postcommit next V2 candidate clock forward");
 invalid=Ticket{};
 ok(armCanonicalClock(invalid,svc::kSyntheticPc,plan(c2.candidate))==
    ClockArm::invalidTicket,
    "higher revision/epoch values cannot themselves grant authority");
 auto stale=leaseSynthetic(1);
 ok(armCanonicalClock(stale,svc::kSyntheticPc,plan(c.candidate))==
    ClockArm::staleRevision,"native W03 refuses stale previous revision");
 auto corrupt=plan(c2.candidate);++corrupt.sourceEpoch;
 auto another=leaseSynthetic(1);
 ok(armCanonicalClock(another,svc::kSyntheticPc,corrupt)==
    ClockArm::epochMismatch,"native W03 independently checks epoch");
 corrupt=plan(c2.candidate);corrupt.high32^=1;
 another=leaseSynthetic(1);
 ok(armCanonicalClock(another,svc::kSyntheticPc,corrupt)==
    ClockArm::badPair,"native W03 rejects forged high32");
 ok(unchanged(1,committed,0,60750000u,svc::kSyntheticPc,0,0),
    "all stale/epoch/high32 requests leave W03 untouched");
 bool series=true;
 for(uint64_t i=1;i<=512;i++){
  const auto previous=inspectSyntheticClock(1);
  auto next=proposal(1,previous,1000000000ULL+i*1234567ULL);
  const auto q=svc::compute(next.req,next.view);
  if(!q.computed()||!svc::consistent(q.candidate)){series=false;break;}
  auto lease=leaseSynthetic(1);
  if(armCanonicalClock(lease,svc::kSyntheticPc,
     plan(q.candidate))!=ClockArm::accepted||
     nsmbw_loop_frame(1)!=1){series=false;break;}
  const auto after=inspectSyntheticClock(1);
  if(after.revision!=previous.revision+1||
     after.ticks!=q.candidate.rawTicks||
     nsmbw_loop_cpu_gpr(1,3)!=q.candidate.high32||
     nsmbw_loop_cpu_gpr(1,4)!=q.candidate.low32||
     nsmbw_mem_pages()!=0){series=false;break;}
 }
 ok(series,"512 actual W03 commits from pure V2 candidates preserve ONE ledger");
 ok(inspectSyntheticClock(1).revision==513,
    "512 successful native commits increment W03 revision once each");
 bool recycled=true;
 for(uint64_t i=0;i<1024;i++){
  nsmbw_loop_reset();
  if(!spawn(1)){recycled=false;break;}
  const auto was=inspectSyntheticClock(1);
  const auto next=proposal(1,was,i,
      svc::ServiceId::rawClockFromTicks);
  const auto q=svc::compute(next.req,next.view);
  if(!q.computed()){recycled=false;break;}
  auto lease=leaseSynthetic(1),clone=lease;
  if(armCanonicalClock(lease,svc::kSyntheticPc,
       plan(q.candidate))!=ClockArm::accepted){recycled=false;break;}
  nsmbw_loop_reset();
  if(!spawn(1)){recycled=false;break;}
  auto newLease=leaseSynthetic(1);
  const auto fresh=inspectSyntheticClock(1);
  if(armCanonicalClock(clone,svc::kSyntheticPc,
       plan(q.candidate))==ClockArm::accepted||
     armCanonicalClock(newLease,svc::kSyntheticPc,
       plan(q.candidate))!=ClockArm::epochMismatch||
     fresh.revision!=0||fresh.ticks!=0||
     nsmbw_loop_cpu_gpr(1,4)!=0x80004000u){recycled=false;break;}
 }
 ok(recycled,"1024 REAL W03 guest reset/ABA cycles reject old V2 candidates");
 ok(inspectSyntheticClock(1).revision==0&&
    nsmbw_loop_cpu_gpr(1,4)==0x80004000U,
    "new recycled guest has clean canonical clock and GPR");
 std::cout<<"TOTAL_CHECKS "<<total<<'\n';
}
