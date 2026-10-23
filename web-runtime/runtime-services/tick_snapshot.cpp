// Phase11 synthetic deterministic native 64-bit time authority.
// NOT Wii OSGetTime, interrupts, HLE, or a real hardware timebase.
#include <cstdint>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif
extern "C" {
uint32_t nsmbw_interop_write32(uint32_t address, uint32_t value);
uint32_t nsmbw_interop_status();
}
namespace {
uint32_t serviceStatus=0;
constexpr uint32_t kClaimAddress=0xFFFFFFFCu;
constexpr uint32_t kClaimCode=0x5449434Bu;
constexpr uint32_t kHighAddress=0xFFFFFFF8u;
bool claimed=false;
bool highPending=false;
uint32_t pendingHigh=0;
bool hasSample=false;
uint64_t lastSample=0;
bool guestRamWord(uint32_t address) noexcept {
  if((address&3u)!=0u || (address&0xC0000000u)==0x40000000u)return false;
  const uint32_t physical=address&0x3FFFFFFFu;
  return physical<=0x017FFFFCu ||
    (physical>=0x10000000u && physical<=0x17FFFFFCu);
}
// One native ledger for both the legacy JavaScript path and Time64 C++.
// A checked RAM fault, invalid address or regressive timestamp cannot mutate
// the native monotonic ledger, guest RAM, or CpuContext.
uint32_t commitFull64(uint32_t address,uint32_t hi,uint32_t lo) {
  serviceStatus=0;
  if(!claimed){serviceStatus=9;return 0;}
  if(highPending){serviceStatus=12;return 0;}
  const uint64_t next=(static_cast<uint64_t>(hi)<<32)|lo;
  if(hasSample && next<lastSample){serviceStatus=10;return 0;}
  if(!guestRamWord(address)){serviceStatus=7;return 0;}
  const uint32_t ok=nsmbw_interop_write32(address,lo);
  serviceStatus=nsmbw_interop_status();
  if(ok!=1u || serviceStatus!=0u){
    if(serviceStatus==0u)serviceStatus=1;
    return 0;
  }
  lastSample=next;hasSample=true;
  return 1;
}
}
extern "C" {
uint32_t EXPORT nsmbw_services_tick_is_claimed(){return claimed?1u:0u;}
uint32_t EXPORT nsmbw_services_tick_claim(){
  if(claimed)return 0;
  claimed=true;return 1;
}
// Compatible facade registration and paired full64 host publication.
// The reserved host controls never enter ordinary guest RAM or MMIO.
uint32_t EXPORT nsmbw_services_tick_store32(uint32_t address,uint32_t value){
  serviceStatus=0;
  if(address==kClaimAddress && value==kClaimCode){
    if(claimed){serviceStatus=8;return 0;}
    claimed=true;return 1;
  }
  if(address==kHighAddress){
    if(!claimed){serviceStatus=9;return 0;}
    if(highPending){serviceStatus=12;return 0;}
    highPending=true;pendingHigh=value;return 1;
  }
  // Typed legacy error compatibility: malformed claim magic, MMIO/GX and
  // unsupported addresses return 7, not missing-high status 12.
  // Consume staged highword after invalid requests; no replay or ghost RAM.
  if(!guestRamWord(address)){
    highPending=false;pendingHigh=0;serviceStatus=7;return 0;
  }
  if(!highPending){serviceStatus=12;return 0;}
  const uint32_t high=pendingHigh;
  highPending=false;pendingHigh=0;
  return commitFull64(address,high,value);
}
// C++-only function deliberately not exported to JS: normal Time64 guest ABI
// cannot bypass the monotonic ledger through another call path.
uint32_t nsmbw_services_tick_commit64(uint32_t address,uint32_t high,uint32_t low){
  return commitFull64(address,high,low);
}
void nsmbw_services_tick_reset_ledger(){
  hasSample=false;lastSample=0;
  highPending=false;pendingHigh=0;serviceStatus=0;
}
uint32_t EXPORT nsmbw_services_tick_status(){return serviceStatus;}
void EXPORT nsmbw_services_tick_status_reset(){serviceStatus=0;}
}
