#include "synthetic_service_v2.hpp"
#include <type_traits>
#include <iostream>
using namespace nsmbw::p20::services;
static_assert(std::is_trivially_copyable<RequestV2>::value);
static_assert(std::is_trivially_copyable<ViewV2>::value);
static_assert(std::is_trivially_copyable<CandidateV2>::value);
static_assert(std::is_trivially_copyable<ResultV2>::value);
static_assert(noexcept(compute(RequestV2{},ViewV2{})));
int main(){
  ViewV2 v{};v.slot=1;v.currentPc=kSyntheticPc;v.epoch=7;
  v.revision=2;v.claimedBudget=1;v.origin=OriginClaim::nativeScheduler;
  v.phase=PhaseClaim::ready;v.enabled=true;v.guestReady=true;
  RequestV2 r{};r.version=kAbiVersion;r.service=ServiceId::rawClockFromNanoseconds;
  r.slot=1;r.expectedPc=kSyntheticPc;r.epoch=7;r.revision=2;
  r.value=1000000000ULL;
  auto c=compute(r,v);
  if(!c.computed()||c.candidate.rawTicks!=60750000ULL)return 4;
  std::cout<<"PASS P20_V2_UNTRUSTED_CANDIDATE_ONLY\n";
}
