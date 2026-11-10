// 8 real native host threads, PURE candidate evaluation only.
// W03 native scheduler itself is NOT being run concurrently.
#include "synthetic_service_dispatch.hpp"
#include <array>
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>
using namespace nsmbw::p19::services;
constexpr unsigned THREADS=8,STEPS=4096;
int main(){
 GateView view{};
 view.slot=1;view.pc=kSyntheticEntryPc;view.epoch=1;
 view.revision=7;view.serial=9;view.remainingBudget=1;
 view.origin=Origin::nativeScheduler;view.phase=Phase::ready;
 view.enabled=true;view.guestReady=true;
 const GateView& shared=view;
 std::array<std::thread,THREADS> workers;
 std::array<uint64_t,THREADS> checksums{};
 std::atomic<bool> pass{true};
 for(unsigned t=0;t<THREADS;t++){
  workers[t]=std::thread([&,t]{
   uint64_t seed=0x9e3779b97f4a7c15ULL^(uint64_t(t)<<48u),sum=0;
   for(unsigned i=0;i<STEPS;i++){
    seed=seed*6364136223846793005ULL+1442695040888963407ULL;
    Request req{};
    req.slot=1;req.expectedPc=kSyntheticEntryPc;
    req.epoch=1;req.revision=7;req.serial=9;req.value=seed;
    const auto result=prepare(req,shared);
    const uint64_t expected=(seed/4000ULL)*243ULL+
      ((seed%4000ULL)*243ULL)/4000ULL;
    if(!result.computed() || !consistent(result.candidate) ||
       result.candidate.ticks!=expected ||
       result.candidate.sourceSerial!=9){
       pass.store(false,std::memory_order_relaxed);break;
    }
    sum^=result.candidate.ticks+(uint64_t(i)<<32u);
   }
   checksums[t]=sum;
  });
 }
 for(auto& t:workers)t.join();
 for(unsigned t=0;t<THREADS;t++){
  uint64_t seed=0x9e3779b97f4a7c15ULL^(uint64_t(t)<<48u),sum=0;
  for(unsigned i=0;i<STEPS;i++){
   seed=seed*6364136223846793005ULL+1442695040888963407ULL;
   const uint64_t expected=(seed/4000ULL)*243ULL+
     ((seed%4000ULL)*243ULL)/4000ULL;
   sum^=expected+(uint64_t(i)<<32u);
  }
  if(sum!=checksums[t])pass.store(false,std::memory_order_relaxed);
 }
 if(!pass.load(std::memory_order_relaxed)){
  std::cerr<<"FAIL concurrency pure dispatcher numerical mismatch\n";
  return 8;
 }
 std::cout<<"PASS 8_THREADS_32768_PURE_DISPATCHER_CALLS_SAME_READONLY_VIEW\n";
}
