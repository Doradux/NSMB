// Phase9: public synthetic DETERMINISTIC time64 CpuContext ABI proof.
// This is NOT authentic Wii OSGetTime, oscillator read or IOS/VI scheduling.
#include "../frame-host/guest_cpu.hpp"
#include <array>
#include <cstdint>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif
extern "C" {
uint32_t nsmbw_services_tick_store32(uint32_t guestAddress,uint32_t lowTicks);
uint32_t nsmbw_services_tick_status();
uint32_t nsmbw_services_tick_is_claimed();
uint32_t nsmbw_mem_pages();
uint32_t nsmbw_loop_ready();
uint32_t nsmbw_loop_paused();
uint32_t nsmbw_loop_done();
uint32_t nsmbw_loop_faulted();
uint32_t nsmbw_loop_cancelled();
uint32_t nsmbw_loop_trace_length();
}
namespace {
constexpr uint32_t Slots=3u;
std::array<CpuContext,Slots> cpu{};
uint64_t publishedTicks=0;
bool published=false;
uint32_t lastStatus=0;
// ABI-shaped function: actual C++ CpuContext*, no JS pseudo-register pair.
// Caller has already committed the checked lowword RAM snapshot.
uint64_t callSnapshot=0;
}
extern "C" void nsmbw_synthetic_time64_guest(CpuContext* ctx) {
  if(!ctx) return;
  ctx->gpr[3]=static_cast<uint32_t>(callSnapshot>>32);
  ctx->gpr[4]=static_cast<uint32_t>(callSnapshot);
}
extern "C" {
uint32_t EXPORT nsmbw_services_time64_publish(uint32_t slot,uint32_t guestAddress,
                                               uint32_t high,uint32_t low) {
  lastStatus=0;
  if(slot>=Slots){lastStatus=7;return 0;}
  if(nsmbw_services_tick_is_claimed()!=1u){lastStatus=9;return 0;}
  const uint64_t next=(static_cast<uint64_t>(high)<<32)|low;
  if(published && next<publishedTicks){lastStatus=10;return 0;}
  // This native checked single-word store fails closed on quota, alignment,
  // unsupported MMIO/GX; a failure NEVER commits time or CpuContext regs.
  if(nsmbw_services_tick_store32(guestAddress,low)!=1u) {
    lastStatus=nsmbw_services_tick_status();
    if(lastStatus==0)lastStatus=1;
    return 0;
  }
  // No callbacks or allocations after checked memory commit.
  callSnapshot=next;
  nsmbw_synthetic_time64_guest(&cpu[slot]);
  publishedTicks=next;
  published=true;
  return 1;
}
uint32_t EXPORT nsmbw_services_time64_status(){return lastStatus;}
uint32_t EXPORT nsmbw_services_time64_gpr(uint32_t slot,uint32_t index){
  return slot<Slots && index<32u ? cpu[slot].gpr[index] : 0u;
}
uint32_t EXPORT nsmbw_services_time64_context_bytes(){return sizeof(CpuContext);}
uint32_t EXPORT nsmbw_services_time64_context_alignment(){return alignof(CpuContext);}
uint32_t EXPORT nsmbw_services_time64_reset(){
  lastStatus=0;
  // Reset is permitted ONLY after the host reset W03/W04 globally.
  if(nsmbw_mem_pages()!=0 || nsmbw_loop_ready()!=0 || nsmbw_loop_paused()!=0 ||
     nsmbw_loop_done()!=0 || nsmbw_loop_faulted()!=0 ||
     nsmbw_loop_cancelled()!=0 || nsmbw_loop_trace_length()!=0){
    lastStatus=11;return 0;
  }
  cpu={};publishedTicks=0;published=false;callSnapshot=0;
  return 1;
}
}
