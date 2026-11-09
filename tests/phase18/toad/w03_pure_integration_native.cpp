// Toad independent, source-pinned native W03/W04/W07 integration fixture.
// W03 owns ONE canonical ledger, Time64 owns ZERO. No real Nintendo/HLE.
#include "scheduler_clock.hpp"
#include "time64_pure_clock.hpp"
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>
using namespace nsmbw::trusted_cpu;
using namespace nsmbw::time64_pure;
extern "C" {
 void nsmbw_loop_reset();
 int nsmbw_loop_cpu_spawn(uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t);
 int nsmbw_loop_frame(uint32_t);
 int nsmbw_loop_suspend(uint32_t);
 int nsmbw_loop_resume(uint32_t);
 uint32_t nsmbw_loop_pc(uint32_t);
 uint32_t nsmbw_loop_cpu_steps(uint32_t);
 uint32_t nsmbw_loop_cpu_gpr(uint32_t,uint32_t);
 uint32_t nsmbw_mem_pages();
}
namespace {
constexpr uint32_t pc=0x80010000u;
int checked=0;
void check(bool b,const char* description) {
 if(!b){std::cerr<<"FAIL "<<description<<'\n';std::exit(8);}
 ++checked;std::cout<<"PASS "<<description<<'\n';
}
int spawn(uint32_t id) {
 return nsmbw_loop_cpu_spawn(id,pc,0x80005010u+id*0x1000u,
                             0x80004000u,0x8000C000u+id*0x1000u,0);
}
Reference ref(const ClockSnapshot& s) {
 return Reference{0,s.ticks,s.epoch,s.revision,s.committed};
}
CanonicalClockPlan toW03(const ClockCandidate& p) {
 return {p.rawTicks,p.high32,p.low32,p.sourceEpoch,p.sourceRevision};
}
bool unchanged(uint32_t id,ClockSnapshot s,uint32_t g3,uint32_t g4,
               uint32_t oldPc,uint32_t oldSteps,uint32_t pages) {
 auto n=inspectSyntheticClock(id);
 return n.ticks==s.ticks && n.revision==s.revision &&
   n.pending==s.pending && n.committed==s.committed &&
   nsmbw_loop_cpu_gpr(id,3)==g3 && nsmbw_loop_cpu_gpr(id,4)==g4 &&
   nsmbw_loop_pc(id)==oldPc && nsmbw_loop_cpu_steps(id)==oldSteps &&
   nsmbw_mem_pages()==pages;
}
}
int main() {
 nsmbw_loop_reset();
 check(spawn(1)==1&&spawn(2)==1,"real native W03 creates two guests");
 auto before=inspectSyntheticClock(1);
 check(before.guestExists&&!before.pending&&!before.committed&&
       before.revision==0&&before.epoch>0,
       "native W03 owns one empty canonical ledger and epoch");
 auto prepared=prepareFromNanos(1000000000ULL,ref(before),
                                 before.epoch,before.revision);
 check(prepared.ok()&&prepared.candidate.rawTicks==60750000ULL,
       "Toad pure 1s candidate exact floor without state");
 check(unchanged(1,before,0,0x80004000u,pc,0,0),
       "Toad candidate alone changes no native W03 CPU/ledger/RAM");
 auto ticket=leaseSynthetic(1);
 auto copy=ticket;
 check(armCanonicalClock(ticket,pc,toW03(prepared.candidate))==
       ClockArm::accepted,"single W03-owned ticket authorizes pure candidate");
 check(inspectSyntheticClock(1).pending&&
       inspectSyntheticClock(1).revision==0&&
       nsmbw_loop_cpu_gpr(1,4)==0x80004000u,
       "W03 arm remains PREPARE only, no register or ledger write");
 check(armCanonicalClock(copy,pc,toW03(prepared.candidate))==
       ClockArm::stale,"copy of consumed private authority rejects");
 check(nsmbw_loop_frame(1)==1,"real W03 scheduler dispatches pure candidate");
 auto after=inspectSyntheticClock(1);
 check(after.committed&&!after.pending&&after.revision==1&&
       after.ticks==60750000ULL,
       "ONE W03 canonical ledger commits exact raw ticks and revision");
 check(nsmbw_loop_cpu_gpr(1,3)==0&&nsmbw_loop_cpu_gpr(1,4)==60750000u&&
       nsmbw_loop_pc(1)==pc&&nsmbw_loop_cpu_steps(1)==0&&
       nsmbw_mem_pages()==0,"real W03 r3/r4 and ledger co-commit without guest opcode or RAM");
 check(inspectSyntheticClock(2).revision==0&&
       nsmbw_loop_cpu_gpr(2,4)==0x80004000u,
       "guest 2 canonical ledger/CPU entirely independent");
 check(nsmbw_loop_suspend(2)==1,"suspend guest2 for deterministic clock dispatch");
 auto stale=leaseSynthetic(1);
 check(armCanonicalClock(stale,pc,toW03(prepared.candidate))==
       ClockArm::staleRevision,"stale prepared revision cannot replay after first commit");
 check(unchanged(1,after,0,60750000u,pc,0,0),
       "stale revision cannot tear GPR or the one ledger");
 auto wrongEpoch=prepareFromTicks(after.ticks+1,ref(after),
                                  after.epoch,after.revision);
 check(wrongEpoch.ok(),"pure candidate for wrong-epoch native injection");
 auto corrupted=toW03(wrongEpoch.candidate);++corrupted.sourceEpoch;
 auto token=leaseSynthetic(1);
 check(armCanonicalClock(token,pc,corrupted)==ClockArm::epochMismatch,
       "W03 independent epoch validation rejects forge");
 check(unchanged(1,after,0,60750000u,pc,0,0),
       "epoch rejection leaves whole scheduler CPU/ledger unchanged");
 corrupted=toW03(wrongEpoch.candidate);corrupted.high32^=1;
 token=leaseSynthetic(1);
 check(armCanonicalClock(token,pc,corrupted)==ClockArm::badPair,
       "W03 native pair validation rejects forged high32");
 check(unchanged(1,after,0,60750000u,pc,0,0),
       "bad pair rejection leaves both GPR and ledger unchanged");
 auto regressive=prepareFromTicks(after.ticks-1,ref(after),
                                  after.epoch,after.revision);
 check(regressive.error==Error::regressiveTicks,
       "Toad preflight refuses backwards native clock");
 check(checkedAddTicks(std::numeric_limits<uint64_t>::max(),1,ref(after),
                       after.epoch,after.revision).error==Error::overflow,
       "pure overflow before any W03 write");
 check(unchanged(1,after,0,60750000u,pc,0,0),
       "arithmetic failure cannot mutate W03 scheduler");
 // Repeated real W03 commits using NEW pure candidate version each turn.
 bool repeated=true;
 for(uint64_t i=1;i<=512;i++) {
   const auto was=inspectSyntheticClock(1);
   const uint64_t ns=1000000000ULL+i*1234567ULL;
   const auto value=prepareFromNanos(ns,ref(was),was.epoch,was.revision);
   if(!value.ok()){repeated=false;break;}
   auto lease=leaseSynthetic(1);
   if(armCanonicalClock(lease,pc,toW03(value.candidate))!=ClockArm::accepted ||
      nsmbw_loop_frame(1)!=1){repeated=false;break;}
   const auto now=inspectSyntheticClock(1);
   if(now.revision!=was.revision+1||now.ticks!=value.candidate.rawTicks||
      nsmbw_loop_cpu_gpr(1,3)!=value.candidate.high32||
      nsmbw_loop_cpu_gpr(1,4)!=value.candidate.low32||
      nsmbw_loop_pc(1)!=pc||nsmbw_loop_cpu_steps(1)!=0||
      nsmbw_mem_pages()!=0){repeated=false;break;}
 }
 check(repeated,"512 actual W03 single-ledger commits from pure host ns, version coherent");
 const auto cycle=inspectSyntheticClock(1);
 check(cycle.revision==513,"512 native W03 commits each advance canonical revision once");
 // Reset and guest-ID reuse: pending old epoch never commits after recycle.
 bool resetSafe=true;
 for(uint64_t i=0;i<256;i++){
   nsmbw_loop_reset();
   if(spawn(1)!=1){resetSafe=false;break;}
   const auto initial=inspectSyntheticClock(1);
   auto c=prepareFromTicks(i,ref(initial),initial.epoch,initial.revision);
   if(!c.ok()){resetSafe=false;break;}
   auto token=leaseSynthetic(1);
   auto copy=token;
   if(armCanonicalClock(token,pc,toW03(c.candidate))!=ClockArm::accepted){
     resetSafe=false;break;
   }
   nsmbw_loop_reset();
   if(spawn(1)!=1){resetSafe=false;break;}
   auto newToken=leaseSynthetic(1);
   const auto fresh=inspectSyntheticClock(1);
   if(armCanonicalClock(copy,pc,toW03(c.candidate))==ClockArm::accepted ||
      armCanonicalClock(newToken,pc,toW03(c.candidate))!=ClockArm::epochMismatch ||
      fresh.ticks!=0||fresh.revision!=0||
      nsmbw_loop_cpu_gpr(1,3)!=0||nsmbw_loop_cpu_gpr(1,4)!=0x80004000u){
      resetSafe=false;break;
   }
 }
 check(resetSafe,"256 native scheduler reset/recycle cycles reject stale Time64 candidate");
 const auto s=inspectSyntheticClock(1);
 auto next=prepareFromTicks(20,ref(s),s.epoch,s.revision);
 auto none=Ticket{};
 check(next.ok()&&armCanonicalClock(none,pc,toW03(next.candidate))==
       ClockArm::invalidTicket,"host-supplied correct numeric candidate cannot authorize without Ticket");
 check(nsmbw_loop_cpu_gpr(1,4)==0x80004000u&&
       inspectSyntheticClock(1).revision==0,
       "numeric candidate without private issuer cannot commit CPU or ledger");
 std::cout<<"TOTAL_CHECKS "<<checked<<'\n';
}
