// 2,000,000 public pure computations: synthetic host diagnostic only.
#include "synthetic_service_v2.hpp"
#include <chrono>
#include <cstdint>
#include <iostream>
namespace s=nsmbw::p20::services;
int main(){
 s::ViewV2 v{};v.slot=1;v.currentPc=s::kSyntheticPc;v.epoch=9;
 v.claimedBudget=1;v.origin=s::OriginClaim::nativeScheduler;
 v.phase=s::PhaseClaim::ready;v.enabled=true;v.guestReady=true;
 s::RequestV2 r{};r.slot=1;r.expectedPc=s::kSyntheticPc;r.epoch=9;
 volatile uint64_t sink=0;
 constexpr uint64_t n=2000000ULL;
 const auto begin=std::chrono::steady_clock::now();
 for(uint64_t i=1;i<=n;i++){
  r.value=(i*1000003ULL)^(i<<18U);
  const auto c=s::compute(r,v);
  if(!c.computed())return 8;
  sink=sink^c.candidate.rawTicks;
 }
 const auto end=std::chrono::steady_clock::now();
 const auto dt=std::chrono::duration_cast<std::chrono::nanoseconds>(end-begin).count();
 if(dt<=0)return 9;
 std::cout<<"P20_V2_PURE_ONLY_DIAGNOSTIC loops="<<n
          <<" elapsed_host_ns="<<dt<<" checksum="<<sink<<"\n";
}
