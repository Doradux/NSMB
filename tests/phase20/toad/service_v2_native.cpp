// Synthetic V2 pure contracts. Tests MUST NOT claim W03 authority.
#include "synthetic_service_v2.hpp"
#include <array>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <type_traits>
using namespace nsmbw::p20::services;
using U=uint64_t;
constexpr U MAX=std::numeric_limits<U>::max();
int labels=0;
void check(bool yes,const char* name){
 if(!yes){std::cerr<<"FAIL "<<name<<'\n';std::exit(7);}
 ++labels;std::cout<<"PASS "<<name<<'\n';
}
struct Case{RequestV2 request;ViewV2 view;};
Case base(){
 Case c{};
 c.request.version=kAbiVersion;
 c.request.service=ServiceId::rawClockFromNanoseconds;
 c.request.slot=1;c.request.expectedPc=kSyntheticPc;
 c.request.epoch=9;c.request.revision=4;
 c.request.value=1000000000ULL;
 c.view.slot=1;c.view.currentPc=kSyntheticPc;
 c.view.epoch=9;c.view.revision=4;c.view.claimedBudget=1;
 c.view.origin=OriginClaim::nativeScheduler;
 c.view.phase=PhaseClaim::ready;
 c.view.enabled=true;c.view.guestReady=true;
 return c;
}
bool same(const Case& a,const Case& b){
 return a.request.version==b.request.version&&
 a.request.service==b.request.service&&
 a.request.slot==b.request.slot&&
 a.request.expectedPc==b.request.expectedPc&&
 a.request.epoch==b.request.epoch&&
 a.request.revision==b.request.revision&&
 a.request.value==b.request.value&&
 a.view.slot==b.view.slot&&
 a.view.currentPc==b.view.currentPc&&
 a.view.epoch==b.view.epoch&&
 a.view.revision==b.view.revision&&
 a.view.previousTicks==b.view.previousTicks&&
 a.view.claimedBudget==b.view.claimedBudget&&
 a.view.origin==b.view.origin&&a.view.phase==b.view.phase&&
 a.view.enabled==b.view.enabled&&
 a.view.guestReady==b.view.guestReady&&
 a.view.busy==b.view.busy&&
 a.view.hasPrevious==b.view.hasPrevious;
}
template<class Change>void deny(const char* label,StatusV2 reason,Change fn){
 Case c=base();fn(c);const auto old=c;
 auto r=compute(c.request,c.view);
 check(r.status==reason,label);
 check(!r.computed()&&r.candidate.version==0&&
  r.candidate.sourceEpoch==0&&r.candidate.sourceRevision==0&&
  r.candidate.rawTicks==0&&r.candidate.high32==0&&
  r.candidate.low32==0&&r.candidate.proposedCost==0,
  "all denied response fields are zero");
 check(same(c,old),"denied pure helper does not mutate inputs");
}
int main(){
 auto b=base();auto original=b;
 auto good=compute(b.request,b.view);
 check(good.computed()&&good.status==StatusV2::candidateOnly,
       "correct V2 is candidate only, never permission");
 check(good.candidate.rawTicks==60750000ULL,
       "exact 60750000 ticks/sec");
 check(good.candidate.high32==0&&good.candidate.low32==60750000U,
       "GPR3 and GPR4 numerical halves");
 check(good.candidate.proposedCost==1,
       "unit cost only proposed, not charged");
 check(good.candidate.sourceEpoch==9&&good.candidate.sourceRevision==4,
       "source echoes are NOT proof of guest owner");
 check(consistent(good.candidate),"structurally consistent response");
 check(same(b,original),"success pure request/view unchanged");
 check(static_cast<uint32_t>(ServiceId::rawClockFromNanoseconds)==0x53560001,
       "V1->V2 nanos ID preserved");
 check(static_cast<uint32_t>(ServiceId::rawClockFromTicks)==0x53560002,
       "V1->V2 ticks ID preserved");
 deny("wrong version",StatusV2::badVersion,
       [](Case& c){c.request.version=1;});
 deny("zero version",StatusV2::badVersion,
       [](Case& c){c.request.version=0;});
 deny("unknown ID",StatusV2::unsupported,
       [](Case& c){c.request.service=static_cast<ServiceId>(77);});
 deny("zero ID",StatusV2::unsupported,
       [](Case& c){c.request.service=static_cast<ServiceId>(0);});
 deny("unsigned max ID",StatusV2::unsupported,
       [](Case& c){c.request.service=static_cast<ServiceId>(0xffffffffu);});
 deny("slot zero",StatusV2::invalidSlot,
       [](Case& c){c.request.slot=0;});
 deny("slot UINT16_OVERFLOW",StatusV2::invalidSlot,
       [](Case& c){c.request.slot=65536;});
 deny("cross guest",StatusV2::invalidSlot,
       [](Case& c){c.request.slot=2;});
 deny("administratively disabled claim",StatusV2::disabled,
       [](Case& c){c.view.enabled=false;});
 deny("JS host origin claimed",StatusV2::forbiddenOriginClaim,
       [](Case& c){c.view.origin=OriginClaim::jsHost;});
 deny("W07 callback origin claimed",StatusV2::forbiddenOriginClaim,
       [](Case& c){c.view.origin=OriginClaim::w07Callback;});
 deny("MMIO origin claimed",StatusV2::forbiddenOriginClaim,
       [](Case& c){c.view.origin=OriginClaim::mmio;});
 deny("IRQ origin claimed",StatusV2::forbiddenOriginClaim,
       [](Case& c){c.view.origin=OriginClaim::irq;});
 deny("unknown origin claimed",StatusV2::forbiddenOriginClaim,
       [](Case& c){c.view.origin=OriginClaim::unknown;});
 deny("reentrant/busy claim",StatusV2::claimedBusy,
       [](Case& c){c.view.busy=true;});
 deny("not ready guest claim",StatusV2::invalidPhase,
       [](Case& c){c.view.guestReady=false;});
 deny("suspended guest claim",StatusV2::invalidPhase,
       [](Case& c){c.view.phase=PhaseClaim::suspended;});
 deny("running guest claim",StatusV2::invalidPhase,
       [](Case& c){c.view.phase=PhaseClaim::running;});
 deny("stopped guest claim",StatusV2::invalidPhase,
       [](Case& c){c.view.phase=PhaseClaim::stopped;});
 deny("requested wrong PC",StatusV2::wrongPc,
       [](Case& c){c.request.expectedPc=kSyntheticPc+4;});
 deny("view wrong PC",StatusV2::wrongPc,
       [](Case& c){c.view.currentPc=kSyntheticPc+4;});
 deny("requested stale epoch",StatusV2::wrongEpoch,
       [](Case& c){c.request.epoch=8;});
 deny("requested missing epoch",StatusV2::wrongEpoch,
       [](Case& c){c.request.epoch=0;});
 deny("requested stale revision",StatusV2::staleRevision,
       [](Case& c){c.request.revision=3;});
 deny("empty claimed budget",StatusV2::claimedQuotaEmpty,
       [](Case& c){c.view.claimedBudget=0;});
 deny("revision overflow",StatusV2::revisionExhausted,
       [](Case& c){c.request.revision=MAX;c.view.revision=MAX;});
 deny("regressive ticks",StatusV2::clockRegression,
       [](Case& c){c.view.hasPrevious=true;c.view.previousTicks=60750001;});
 auto ns=base();ns.request.value=0;
 check(compute(ns.request,ns.view).candidate.rawTicks==0,
       "zero nanos valid before first commit");
 ns.request.value=1;
 check(compute(ns.request,ns.view).candidate.rawTicks==0,
       "one nanosecond floors to zero");
 ns.request.value=3999;
 check(compute(ns.request,ns.view).candidate.rawTicks==242,
       "3999ns floors to 242");
 ns.request.value=4000;
 check(compute(ns.request,ns.view).candidate.rawTicks==243,
       "4000ns exactly 243");
 ns.request.value=MAX;
 const U exact=(MAX/4000U)*243U+((MAX%4000U)*243U)/4000U;
 check(compute(ns.request,ns.view).candidate.rawTicks==exact,
       "UINT64_MAX ns quotient/remainder without overflow");
 ns.request.service=ServiceId::rawClockFromTicks;
 ns.request.value=0x100000000ULL;
 auto carry=compute(ns.request,ns.view);
 check(carry.computed()&&carry.candidate.high32==1&&
       carry.candidate.low32==0,"2^32 tick upper carry");
 ns.request.value=MAX;
 auto max=compute(ns.request,ns.view);
 check(max.computed()&&max.candidate.rawTicks==MAX&&
       max.candidate.high32==0xffffffffu&&
       max.candidate.low32==0xffffffffu,
       "UINT64_MAX ticks exact low/high");
 auto broken=max.candidate;broken.high32^=1;
 check(!consistent(broken),"forged high half denied structurally");
 broken=max.candidate;broken.low32^=1;
 check(!consistent(broken),"forged low half denied structurally");
 broken=max.candidate;broken.proposedCost=999999;
 check(!consistent(broken),"forged proposed cost denied structurally");
 broken=max.candidate;broken.service=static_cast<ServiceId>(0x12345);
 check(!consistent(broken),"forged service ID denied structurally");
 broken=max.candidate;broken.version=1;
 check(!consistent(broken),"forged ABI version denied structurally");
 broken=max.candidate;broken.sourceEpoch=0;
 check(!consistent(broken),"forged candidate missing epoch denied");
 auto eq=base();eq.request.service=ServiceId::rawClockFromTicks;
 eq.view.hasPrevious=true;eq.view.previousTicks=20;eq.request.value=20;
 check(compute(eq.request,eq.view).computed(),"equal last clock allowed");
 eq.request.value=21;
 check(compute(eq.request,eq.view).computed(),"forward clock allowed");
 auto forged=base();forged.view.claimedBudget=999999;
 forged.view.origin=OriginClaim::nativeScheduler;
 forged.request.epoch=forged.view.epoch;
 forged.request.revision=forged.view.revision;
 const auto forgedCandidate=compute(forged.request,forged.view);
 check(forgedCandidate.computed()&&forgedCandidate.candidate.proposedCost==1,
       "attacker can forge entire view and compute; NOT authority/quota");
 check(forged.view.claimedBudget==999999,
       "pure computation NEVER consumes even fake public quota");
 // 4096 distinct deterministic 3-guest synthetic computations + denial.
 std::array<Case,3> hosts={base(),base(),base()};
 for(unsigned n=0;n<3;n++){
  hosts[n].request.slot=hosts[n].view.slot=n+1;
  hosts[n].request.epoch=hosts[n].view.epoch=100+n;
 }
 U state=0x123456789abcdefULL;bool mixed=true;
 for(unsigned n=0;n<4096;n++){
  state=state*6364136223846793005ULL+1442695040888963407ULL;
  auto c=hosts[n%3];c.request.value=state;
  if(n%2)c.request.service=ServiceId::rawClockFromTicks;
  if(n%11==0)c.request.epoch^=1;
  if(n%13==0)c.request.service=static_cast<ServiceId>(999);
  if(n%17==0)c.view.claimedBudget=0;
  if(n%19==0)c.view.origin=OriginClaim::jsHost;
  auto original=c;auto result=compute(c.request,c.view);
  if(!same(original,c)){mixed=false;break;}
  if(result.computed()){
   const U want=c.request.service==ServiceId::rawClockFromTicks
       ?state:(state/4000U)*243U+((state%4000U)*243U)/4000U;
   if(!consistent(result.candidate)||result.candidate.rawTicks!=want){
    mixed=false;break;
   }
  }else if(result.candidate.rawTicks||result.candidate.proposedCost||
           result.candidate.high32||result.candidate.low32){
    mixed=false;break;
  }
 }
 check(mixed,"4096 deterministic pure 3-guest mixed grant/deny operations");
 std::cout<<"TOTAL_CHECKS "<<labels<<'\n';
}
