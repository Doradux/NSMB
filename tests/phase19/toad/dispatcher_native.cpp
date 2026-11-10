// Invented C++ only, no Nintendo guest/authoritative W03 mutation.
#include "synthetic_service_dispatch.hpp"
#include <array>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <iostream>
#include <limits>
using namespace nsmbw::p19::services;
using U=uint64_t;
constexpr U MAX=std::numeric_limits<U>::max();
int count=0;
void test(bool ok,const char* name){
 if(!ok){std::cerr<<"FAIL "<<name<<'\n';std::exit(7);}
 ++count;std::cout<<"PASS "<<name<<'\n';
}
struct Case {Request req;GateView gate;};
Case base(){
 Case f{};
 f.req.version=kAbiVersion;f.req.id=ServiceId::rawClockFromNanoseconds;
 f.req.slot=1;f.req.expectedPc=kSyntheticEntryPc;
 f.req.epoch=7;f.req.revision=12;f.req.serial=91;
 f.req.value=1000000000ULL;
 f.gate.slot=1;f.gate.pc=kSyntheticEntryPc;
 f.gate.epoch=7;f.gate.revision=12;f.gate.serial=91;
 f.gate.remainingBudget=1;f.gate.origin=Origin::nativeScheduler;
 f.gate.phase=Phase::ready;f.gate.enabled=true;f.gate.guestReady=true;
 return f;
}
template<class Fn>void denied(const char* label,Status expected,Fn mutate){
 auto b=base();mutate(b);
 Request savedReq=b.req;GateView savedGate=b.gate;
 const auto r=prepare(b.req,b.gate);
 test(r.status==expected,label);
 test(r.candidate.version==0 &&r.candidate.ticks==0 &&
      r.candidate.high32==0 &&r.candidate.low32==0 &&
      r.candidate.sourceEpoch==0 &&r.candidate.sourceSerial==0 &&
      r.candidate.slot==0,"DENIAL has no reusable candidate");
 test(std::memcmp(&savedReq,&b.req,sizeof(Request))==0 &&
      std::memcmp(&savedGate,&b.gate,sizeof(GateView))==0,
      "DENIAL does not change bytes of request or gate");
}
int main(){
 auto b=base();const auto save=b;
 const auto result=prepare(b.req,b.gate);
 test(result.computed(),"correct invented native candidate");
 test(result.status==Status::candidateOnly,"status is candidate ONLY, never authority");
 test(result.candidate.ticks==60750000ULL,"1s=60.75M raw ticks");
 test(result.candidate.high32==0&&result.candidate.low32==60750000u,
      "GPR hi/lo split exact");
 test(result.candidate.sourceEpoch==7&&result.candidate.sourceRevision==12&&
      result.candidate.sourceSerial==91,"source snapshot echoed, no trust");
 test(consistent(result.candidate),"candidate pair internally consistent");
 test(std::memcmp(&b,&save,sizeof(Case))==0,"success full input bytes unchanged");
 denied("unknown service",Status::unsupported,[](Case& x){
   x.req.id=static_cast<ServiceId>(0x12345678u);});
 denied("zero service",Status::unsupported,[](Case& x){
   x.req.id=static_cast<ServiceId>(0);});
 denied("wrong ABI",Status::badVersion,[](Case& x){x.req.version=2;});
 denied("zero ABI",Status::badVersion,[](Case& x){x.req.version=0;});
 denied("slot zero",Status::invalidSlot,[](Case& x){x.req.slot=0;});
 denied("slot overflow",Status::invalidSlot,[](Case& x){x.req.slot=65536;});
 denied("cross guest",Status::invalidSlot,[](Case& x){x.req.slot=2;});
 denied("disabled",Status::disabled,[](Case& x){x.gate.enabled=false;});
 denied("JS origin",Status::forbiddenOrigin,[](Case& x){x.gate.origin=Origin::jsHost;});
 denied("W07 callback",Status::forbiddenOrigin,[](Case& x){x.gate.origin=Origin::w07Callback;});
 denied("MMIO origin",Status::forbiddenOrigin,[](Case& x){x.gate.origin=Origin::mmio;});
 denied("IRQ origin",Status::forbiddenOrigin,[](Case& x){x.gate.origin=Origin::irq;});
 denied("unknown origin",Status::forbiddenOrigin,[](Case& x){x.gate.origin=Origin::unknown;});
 denied("busy reentry",Status::dispatchBusy,[](Case& x){x.gate.dispatchBusy=true;});
 denied("suspended guest",Status::invalidPhase,[](Case& x){x.gate.phase=Phase::suspended;});
 denied("running guest",Status::invalidPhase,[](Case& x){x.gate.phase=Phase::running;});
 denied("stopped guest",Status::invalidPhase,[](Case& x){x.gate.phase=Phase::stopped;});
 denied("guest not ready",Status::invalidPhase,[](Case& x){x.gate.guestReady=false;});
 denied("wrong expected PC",Status::wrongPc,[](Case& x){x.req.expectedPc=kSyntheticEntryPc+4;});
 denied("wrong native current PC",Status::wrongPc,[](Case& x){x.gate.pc=kSyntheticEntryPc+4;});
 denied("old epoch",Status::wrongEpoch,[](Case& x){x.req.epoch=6;});
 denied("zero epoch",Status::wrongEpoch,[](Case& x){x.req.epoch=0;});
 denied("stale revision",Status::staleRevision,[](Case& x){x.req.revision=11;});
 denied("stale serial",Status::staleSerial,[](Case& x){x.req.serial=90;});
 denied("zero serial",Status::staleSerial,[](Case& x){x.req.serial=0;});
 denied("no quota",Status::quotaExhausted,[](Case& x){x.gate.remainingBudget=0;});
 denied("revision UINT64_MAX",Status::revisionExhausted,[](Case& x){
   x.req.revision=MAX;x.gate.revision=MAX;});
 denied("clock regression",Status::clockRegression,[](Case& x){
   x.gate.clockCommitted=true;x.gate.lastCommittedTicks=60750001ULL;});
 auto ns=base();ns.req.value=0;
 test(prepare(ns.req,ns.gate).candidate.ticks==0,"0 ns initial");
 ns.req.value=1;
 test(prepare(ns.req,ns.gate).candidate.ticks==0,"1ns floors to zero");
 ns.req.value=3999;
 test(prepare(ns.req,ns.gate).candidate.ticks==242,"3999ns floors to 242");
 ns.req.value=4000;
 test(prepare(ns.req,ns.gate).candidate.ticks==243,"4000ns exactly 243");
 ns.req.value=MAX;
 const auto maxNs=prepare(ns.req,ns.gate);
 const U exact=(MAX/4000ULL)*243ULL+((MAX%4000ULL)*243ULL)/4000ULL;
 test(maxNs.computed()&&maxNs.candidate.ticks==exact,
      "UINT64_MAX ns exact quotient remainder, no double");
 ns.req.id=ServiceId::rawClockFromTicks;ns.req.value=0x100000000ULL;
 const auto carry=prepare(ns.req,ns.gate);
 test(carry.computed()&&carry.candidate.high32==1 &&
      carry.candidate.low32==0,"tick 2^32 carry high+1");
 ns.req.value=MAX;
 const auto maxTicks=prepare(ns.req,ns.gate);
 test(maxTicks.computed()&&maxTicks.candidate.high32==0xffffffffu &&
      maxTicks.candidate.low32==0xffffffffu,
      "raw UINT64_MAX tick math accepted, not guest authority");
 auto altered=maxTicks.candidate;altered.high32^=1;
 test(!consistent(altered),"corrupted high32 rejected");
 altered=maxTicks.candidate;altered.low32^=1;
 test(!consistent(altered),"corrupted low32 rejected");
 altered=maxTicks.candidate;altered.id=static_cast<ServiceId>(6);
 test(!consistent(altered),"candidate unknown ID rejected");
 altered=maxTicks.candidate;altered.sourceEpoch=0;
 test(!consistent(altered),"candidate zero epoch rejected");
 altered=maxTicks.candidate;altered.sourceSerial=0;
 test(!consistent(altered),"candidate zero serial rejected");
 auto eq=base();eq.req.id=ServiceId::rawClockFromTicks;
 eq.req.value=60750000ULL;eq.gate.clockCommitted=true;
 eq.gate.lastCommittedTicks=60750000ULL;
 test(prepare(eq.req,eq.gate).computed(),"monotonic clock equality allowed");
 eq.req.value=60750001ULL;
 test(prepare(eq.req,eq.gate).computed(),"monotonic clock forward allowed");
 // An attacker can fabricate a matching GateView. This must never
 // confer W03 native ticket authority: integration harness proves it.
 auto forged=base();
 test(prepare(forged.req,forged.gate).computed(),
      "forged pure snapshot CAN compute — never native trust");
 // 3 distinct contexts, 4096 mixed adversarial operations (ONE test).
 std::array<Case,3> guests={base(),base(),base()};
 for(unsigned i=0;i<3;i++){
   guests[i].req.slot=i+1;guests[i].gate.slot=i+1;
   guests[i].req.epoch=guests[i].gate.epoch=100+i;
   guests[i].req.serial=guests[i].gate.serial=1000+i;
 }
 U seed=0xdeadbeef2468ace0ULL;
 bool all=true;
 for(unsigned i=0;i<4096;i++){
   seed=seed*6364136223846793005ULL+1442695040888963407ULL;
   Case& target=guests[i%3];
   target.req.value=seed;
   target.req.id=i%2?ServiceId::rawClockFromTicks:
                        ServiceId::rawClockFromNanoseconds;
   target.req.revision=target.gate.revision;
   auto local=target;
   if(i%11==0)local.req.epoch^=1;
   if(i%13==0)local.req.slot=65536;
   if(i%17==0)local.gate.origin=Origin::jsHost;
   if(i%19==0)local.gate.remainingBudget=0;
   const auto old=local;
   const auto r=prepare(local.req,local.gate);
   if(std::memcmp(&old,&local,sizeof(Case))!=0){all=false;break;}
   if(r.computed()){
     if(!consistent(r.candidate)||r.candidate.slot!=old.req.slot){all=false;break;}
     if(prepare(local.req,local.gate).candidate.ticks!=r.candidate.ticks){all=false;break;}
   }else if(r.candidate.ticks||r.candidate.high32||r.candidate.slot){
     all=false;break;
   }
   if(i%257==0){
     ++target.gate.epoch;++target.req.epoch;
     ++target.gate.serial;++target.req.serial;
   }
 }
 test(all,"4096 deterministic mixed three-guest pure cases");
 std::cout<<"TOTAL_CHECKS "<<count<<'\n';
}
