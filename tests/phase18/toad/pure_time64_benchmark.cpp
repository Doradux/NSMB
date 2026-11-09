// Optional reproducible throughput diagnostic for pure Time64 arithmetic.
// CPU wall-clock elapsed timing is NOT synthetic guest time or Wii execution.
#include "time64_pure_clock.hpp"
#include "time64_pure_candidate.hpp"
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <iostream>
constexpr unsigned LOOPS=2000000;
int main(){
 const nsmbw::time64_pure::Reference reference{0,0,1,0,false};
 volatile uint64_t sink=0;
 const auto begin=std::chrono::steady_clock::now();
 for(uint64_t i=1;i<=LOOPS;i++){
   const uint64_t ns=(i*1000003ULL)^(i<<18u);
   const auto c=nsmbw::w18::fromNanoseconds(ns);
   if(!c.ok())return 2;
   sink=sink^c.candidate.ticks;
 }
 const auto middle=std::chrono::steady_clock::now();
 for(uint64_t i=1;i<=LOOPS;i++){
   const uint64_t ns=(i*1000003ULL)^(i<<18u);
   const auto c=nsmbw::time64_pure::prepareFromNanos(ns,reference,1,0);
   if(!c.ok())return 3;
   sink=sink^c.candidate.rawTicks;
 }
 const auto end=std::chrono::steady_clock::now();
 const auto direct=std::chrono::duration_cast<std::chrono::nanoseconds>(
     middle-begin).count();
 const auto checked=std::chrono::duration_cast<std::chrono::nanoseconds>(
     end-middle).count();
 if(direct<=0||checked<=0)return 4;
 std::cout<<"NATIVE_TIMING_LOOPS="<<LOOPS
          <<" raw_elapsed_ns="<<direct
          <<" envelope_elapsed_ns="<<checked
          <<" sink="<<sink<<'\n';
 // Only measured elapsed times: not a pass/fail performance threshold.
}
