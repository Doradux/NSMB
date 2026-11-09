// Pure arithmetic concurrency: 8 independent workers, shared CONST reference.
// No guest code or HLE, and NO mutable source clock/CPU/ledger state.
#include "time64_pure_clock.hpp"
#include "time64_pure_candidate.hpp"
#include <array>
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>
constexpr unsigned WORKERS=8;
constexpr unsigned STEPS=4096;
int main() {
 const nsmbw::time64_pure::Reference ref{0,0,11,1,false};
 std::array<uint64_t,WORKERS> sums{};
 std::atomic<bool> good{true};
 std::array<std::thread,WORKERS> workers;
 for(unsigned w=0;w<WORKERS;w++){
  workers[w]=std::thread([&,w] {
   uint64_t state=0x9e3779b97f4a7c15ULL^(uint64_t(w)<<48u);
   uint64_t checksum=0;
   for(unsigned i=0;i<STEPS;i++){
    state=state*6364136223846793005ULL+1442695040888963407ULL;
    const auto simple=nsmbw::w18::fromNanoseconds(state);
    const auto wrapped=nsmbw::time64_pure::prepareFromNanos(state,ref,11,1);
    if(!simple.ok()||!wrapped.ok()||
       simple.candidate.ticks!=wrapped.candidate.rawTicks||
       simple.candidate.high32()!=wrapped.candidate.high32||
       simple.candidate.low32()!=wrapped.candidate.low32 ||
       wrapped.candidate.sourceEpoch!=11 ||
       wrapped.candidate.sourceRevision!=1||
       nsmbw::time64_pure::validateForCommit(wrapped.candidate,ref)!=
        nsmbw::time64_pure::Error::ok){
      good.store(false,std::memory_order_relaxed);break;
    }
    checksum ^= simple.candidate.ticks+(uint64_t(i)<<32u);
   }
   sums[w]=checksum;
  });
 }
 for(auto& w:workers)w.join();
 bool nonzero=true;
 for(const auto v:sums)nonzero&=(v!=0);
 if(!good.load(std::memory_order_relaxed)||!nonzero){
   std::cerr<<"FAIL pure concurrent cross-worker results"<<'\n';
   return 9;
 }
 // Check one more deterministic rerun of each worker as a serial oracle.
 for(unsigned w=0;w<WORKERS;w++){
  uint64_t state=0x9e3779b97f4a7c15ULL^(uint64_t(w)<<48u),sum=0;
  for(unsigned i=0;i<STEPS;i++){
   state=state*6364136223846793005ULL+1442695040888963407ULL;
   sum^=nsmbw::w18::fromNanoseconds(state).candidate.ticks+
     (uint64_t(i)<<32u);
  }
  if(sum!=sums[w])return 10;
 }
 std::cout<<"PASS PURE_CONCURRENT_8_THREADS_32768_VALUES"<<'\n';
}
