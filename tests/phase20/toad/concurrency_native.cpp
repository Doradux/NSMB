#include "synthetic_service_v2.hpp"
#include <array>
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>
using namespace nsmbw::p20::services;
constexpr uint32_t workers=8,iterations=4096;
int main(){
 ViewV2 gate{};
 gate.slot=1;gate.currentPc=kSyntheticPc;gate.epoch=17;
 gate.claimedBudget=1;gate.origin=OriginClaim::nativeScheduler;
 gate.phase=PhaseClaim::ready;gate.enabled=true;gate.guestReady=true;
 const ViewV2& shared=gate;
 std::array<std::thread,workers> threads{};
 std::array<uint64_t,workers> sums{};
 std::atomic<bool> pass{true};
 for(uint32_t t=0;t<workers;t++)threads[t]=std::thread([&,t]{
  uint64_t state=0xcafebabe13579bdfULL^(static_cast<uint64_t>(t)<<48u);
  uint64_t sum=0;
  for(uint32_t i=0;i<iterations;i++){
   state=state*6364136223846793005ULL+1442695040888963407ULL;
   RequestV2 r{};r.slot=1;r.expectedPc=kSyntheticPc;
   r.epoch=17;r.value=state;
   const auto c=compute(r,shared);
   const uint64_t expected=(state/4000U)*243U+
                          ((state%4000U)*243U)/4000U;
   if(!c.computed()||!consistent(c.candidate)||
      c.candidate.rawTicks!=expected){pass.store(false);break;}
   sum^=(expected+(static_cast<uint64_t>(i)<<32u));
  }
  sums[t]=sum;
 });
 for(auto& t:threads)t.join();
 for(uint32_t t=0;t<workers;t++){
  uint64_t state=0xcafebabe13579bdfULL^(static_cast<uint64_t>(t)<<48u);
  uint64_t sum=0;
  for(uint32_t i=0;i<iterations;i++){
   state=state*6364136223846793005ULL+1442695040888963407ULL;
   const uint64_t expected=(state/4000U)*243U+
                           ((state%4000U)*243U)/4000U;
   sum^=expected+(static_cast<uint64_t>(i)<<32u);
  }
  if(sums[t]!=sum)pass.store(false);
 }
 if(!pass.load()){std::cerr<<"FAIL concurrency pure numeric values\n";return 8;}
 std::cout<<"PASS V2_32768_PURE_CALLS_8_THREADS_SERIAL_ORACLE\n";
}
