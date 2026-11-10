// Pure TEST-ONLY host diagnostic, NOT Wii frame latency or scheduler FPS.
#include "synthetic_service_dispatch.hpp"
#include <chrono>
#include <cstdint>
#include <iostream>
using namespace nsmbw::p19::services;
constexpr uint64_t LOOPS=2000000ULL;
int main(){
 GateView view{};
 view.slot=1;view.pc=kSyntheticEntryPc;
 view.epoch=1;view.revision=0;view.serial=1;
 view.remainingBudget=1;view.enabled=true;view.guestReady=true;
 view.phase=Phase::ready;view.origin=Origin::nativeScheduler;
 Request r{};
 r.slot=1;r.expectedPc=kSyntheticEntryPc;
 r.epoch=1;r.revision=0;r.serial=1;
 volatile uint64_t sink=0;
 const auto start=std::chrono::steady_clock::now();
 for(uint64_t i=1;i<=LOOPS;i++){
  r.value=(i*1000003ULL)^(i<<18u);
  const auto value=prepare(r,view);
  if(!value.computed())return 3;
  sink=sink^value.candidate.ticks;
 }
 const auto end=std::chrono::steady_clock::now();
 const auto ns=std::chrono::duration_cast<std::chrono::nanoseconds>(
   end-start).count();
 if(ns<=0)return 4;
 std::cout<<"P19_TOAD_DISPATCHER_DIAGNOSTIC loops="<<LOOPS
          <<" elapsed_host_ns="<<ns
          <<" checksum="<<sink<<"\n";
}
