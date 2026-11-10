// Independent Toad native cross-peer P20 quota integration, INVENTED ONLY.
// W03 PRIVATE quota/Ticket and canonical GPR+clock belong to Peach.
// Public V2 Candidate is demonstrably FORGEABLE but NEVER authority.
// On current Peach P20 first SHA, the actual native gate uses P19 v1 ID;
// VERSION2 native gate is intentionally DENIED, not misreported as integrated.
#include "synthetic_service_v2.hpp"
#include "scheduler_clock.hpp"
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>
namespace s=nsmbw::p20::services;
using namespace nsmbw::trusted_cpu;
extern "C"{
 void nsmbw_loop_reset();
 int nsmbw_loop_tick();
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
 uint32_t nsmbw_loop_pc(uint32_t);
 uint32_t nsmbw_loop_cpu_steps(uint32_t);
 uint32_t nsmbw_mem_pages();
 uint32_t nsmbw_loop_state(uint32_t);
}
constexpr uint32_t nanos=0x53560001u,raw=0x53560002u;
uint32_t total=0;
void check(bool yes,const char* why) {
 if(!yes){std::cerr<<"FAIL "<<why<<"\n";std::exit(7);}
 ++total;std::cout<<"PASS "<<why<<"\n";
}
bool fixture(uint32_t id,uint32_t version,uint32_t service,uint64_t value){
 return nsmbw_loop_synthetic_service_fixture_spawn(id,0x80005010u+id*0x1000u,
  0x80003000u+id*0x1000u,0x8000B000u+id*0x1000u,0xBEEFu,
  version,service,static_cast<uint32_t>(value>>32u),
  static_cast<uint32_t>(value))==1;
}
bool retry(uint32_t id,uint32_t version,uint32_t service,uint64_t value){
 return nsmbw_loop_synthetic_service_fixture_retry(id,version,service,
  static_cast<uint32_t>(value>>32u),static_cast<uint32_t>(value))==1;
}
uint64_t ticks(uint32_t id){
 return (static_cast<uint64_t>(nsmbw_loop_clock_ticks_hi(id))<<32u)|
         nsmbw_loop_clock_ticks_lo(id);
}
s::ResultV2 forged(uint32_t id,uint64_t value,
 s::ServiceId service=s::ServiceId::rawClockFromNanoseconds){
 s::RequestV2 req{};
 req.slot=id;req.expectedPc=s::kSyntheticPc;
 req.epoch=7;req.version=s::kAbiVersion;req.value=value;req.service=service;
 s::ViewV2 view{};
 view.slot=id;view.currentPc=s::kSyntheticPc;view.epoch=7;
 view.origin=s::OriginClaim::nativeScheduler;
 view.phase=s::PhaseClaim::ready;view.enabled=true;view.guestReady=true;
 view.claimedBudget=0xffffffffu; // FORGED PUBLIC HINT
 return s::compute(req,view);
}
CanonicalClockPlan toNative(s::CandidateV2 p){
 return {p.rawTicks,p.high32,p.low32,p.sourceEpoch,p.sourceRevision};
}
int main(){
 nsmbw_loop_reset();
 const auto attacker=forged(1,1000000000ULL);
 check(attacker.computed()&&attacker.candidate.proposedCost==1,
       "fabricated public V2 origin/quota can compute candidate ONLY");
 check(nsmbw_loop_synthetic_service_quota(1)==0 &&
       nsmbw_loop_clock_pending(1)==0,
       "fake V2 grant does not spawn guest, quota or clock");
 check(!retry(1,1,nanos,1000000000ULL),
       "forged public view cannot call service on nonexistent guest");
 auto invalid=Ticket{};
 check(armCanonicalClock(invalid,s::kSyntheticPc,
   toNative(attacker.candidate))==ClockArm::invalidTicket,
   "public candidate must not become a private W03 Ticket");
 // Current Peach first signed source intentionally supports P19 version1
 // at W03 fixture, NOT the new V2. This denial is an integration limit.
 check(!fixture(1,2,nanos,1000000000ULL) &&
       nsmbw_loop_synthetic_service_quota(1)==0,
       "W03 P19-native-only fixture DENIES unintegrated V2 version2");
 check(fixture(1,1,nanos,1000000000ULL),
       "W03 native creates NEW fixed-PC permitted P19-ID fixture");
 check(nsmbw_loop_synthetic_service_quota(1)==1&&
       nsmbw_loop_synthetic_service_id(1)==nanos,
       "quota1 and service ID belong to W03 native state");
 check(nsmbw_loop_clock_pending(1)==1&&ticks(1)==0 &&
       nsmbw_loop_clock_revision_lo(1)==0,
       "W03 arm consumes NO private quota, GPR or clock");
 auto ticket=leaseSynthetic(1);
 auto bypass=armCanonicalClock(ticket,s::kSyntheticPc,
                              toNative(attacker.candidate));
 check(bypass!=ClockArm::accepted&&
       nsmbw_loop_synthetic_service_quota(1)==1,
       "even actual OTHER native Ticket cannot bypass private service mode");
 check(!retry(1,1,nanos,1000000000ULL)&&
       nsmbw_loop_synthetic_service_quota(1)==1,
       "duplicate pending attempt DENIED without debit");
 check(nsmbw_loop_tick()==1,"W03 scheduler executes staged service");
 check(nsmbw_loop_cpu_gpr(1,3)==0&&
       nsmbw_loop_cpu_gpr(1,4)==60750000u&&
       ticks(1)==60750000ULL&&
       nsmbw_loop_clock_revision_lo(1)==1,
       "actual W03 commits GPR halves and only canonical ledger");
 check(nsmbw_loop_synthetic_service_quota(1)==0 &&
       nsmbw_loop_clock_pending(1)==0,
       "PRIVATE per-guest quota debited ONCE in same clock commit");
 const auto fakeAgain=forged(1,2000000000ULL);
 check(fakeAgain.computed()&&fakeAgain.candidate.proposedCost==1,
       "forged public V2 still computes after private quota exhausted");
 check(!retry(1,1,nanos,2000000000ULL),
       "W03 rejects valid service after quota0 despite fake budget MAX");
 check(nsmbw_loop_synthetic_service_quota(1)==0&&
       nsmbw_loop_clock_revision_lo(1)==1&&
       ticks(1)==60750000ULL&&nsmbw_loop_cpu_gpr(1,4)==60750000u,
       "quota0 DENIAL preserves GPR/clock/quota no tear");
 // Test with ACTUAL live native epoch/revision, not the forged echo=7.
 // Otherwise the independent epoch guard masks a missing quota guard.
 const auto realClock=inspectSyntheticClock(1);
 const CanonicalClockPlan realPlan{fakeAgain.candidate.rawTicks,
   fakeAgain.candidate.high32,fakeAgain.candidate.low32,
   realClock.epoch,realClock.revision};
 auto replayTicket=leaseSynthetic(1);
 check(armCanonicalClock(replayTicket,s::kSyntheticPc,realPlan)!=
       ClockArm::accepted,
       "generic clock route cannot bypass service-fixture quota0 even with LIVE epoch");
 check(!retry(1,1,0xdeadbeefu,2000000000ULL)&&
       !retry(1,2,nanos,2000000000ULL),
       "unknown ID and unintegrated ABI2 denied without grant");
 check(ticks(1)==60750000ULL&&
       nsmbw_loop_synthetic_service_quota(1)==0&&
       nsmbw_mem_pages()==0,
       "all denied host requests leave W04 RAM/clock/quota unchanged");
 nsmbw_loop_reset();
 check(fixture(1,1,raw,std::numeric_limits<uint64_t>::max())&&
       nsmbw_loop_tick()==1,
       "raw max UINT64 synthetic service commits via private quota1");
 check(ticks(1)==std::numeric_limits<uint64_t>::max()&&
       nsmbw_loop_cpu_gpr(1,3)==0xffffffffu&&
       nsmbw_loop_cpu_gpr(1,4)==0xffffffffu&&
       nsmbw_loop_synthetic_service_quota(1)==0,
       "raw tick boundary high32/low32 and quota are correct");
 bool commits=true;
 for(uint32_t i=0;i<512;i++){
  nsmbw_loop_reset();
  const uint64_t nanoseconds=1000000000ULL+
                             static_cast<uint64_t>(i)*1234567ULL;
  if(!fixture(1,1,nanos,nanoseconds)||
     nsmbw_loop_synthetic_service_quota(1)!=1||
     nsmbw_loop_tick()!=1||
     nsmbw_loop_synthetic_service_quota(1)!=0||
     ticks(1)!=(nanoseconds/4000U)*243U+
              ((nanoseconds%4000U)*243U)/4000U||
     nsmbw_loop_clock_revision_lo(1)!=1 ||
     retry(1,1,nanos,nanoseconds)){commits=false;break;}
 }
 check(commits,"512 W03 actual per-guest quota1->0 commits and second-denials");
 bool cycles=true;
 for(uint32_t i=0;i<1024;i++){
  nsmbw_loop_reset();
  if(!fixture(1,1,nanos,i)){cycles=false;break;}
  nsmbw_loop_reset(); // pending old ticket discarded
  if(retry(1,1,nanos,i)||
     nsmbw_loop_synthetic_service_quota(1)!=0||
     nsmbw_loop_clock_revision_lo(1)!=0 ||
     !fixture(1,1,raw,i)||
     nsmbw_loop_tick()!=1||
     nsmbw_loop_synthetic_service_quota(1)!=0||
     ticks(1)!=i){cycles=false;break;}
 }
 check(cycles,"1024 W03 guest recycle pending stale state/new quota isolates");
 check(nsmbw_loop_synthetic_service_quota(1)==0&&
       nsmbw_loop_clock_revision_lo(1)==1,
       "no quota resurrection after recycling");
 std::cout<<"TOTAL_CHECKS "<<total<<'\n';
}
