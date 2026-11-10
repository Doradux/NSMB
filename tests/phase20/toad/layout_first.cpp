// OWN invented service ABI layout, NOT Nintendo PPC ABI.
#include "synthetic_service_v2.hpp"
#include <cstddef>
#include <cstdint>
#include <type_traits>
using namespace nsmbw::p20::services;
static_assert(sizeof(RequestV2)==40&&alignof(RequestV2)==8);
static_assert(sizeof(ViewV2)==48&&alignof(ViewV2)==8);
static_assert(sizeof(CandidateV2)==56&&alignof(CandidateV2)==8);
static_assert(sizeof(ResultV2)==64&&alignof(ResultV2)==8);
static_assert(offsetof(RequestV2,value)==32);
static_assert(offsetof(ViewV2,claimedBudget)==32);
static_assert(offsetof(CandidateV2,rawTicks)==32);
static_assert(offsetof(CandidateV2,high32)==40);
static_assert(offsetof(CandidateV2,low32)==44);
static_assert(offsetof(CandidateV2,proposedCost)==48);
static_assert(std::is_trivially_copyable<ResultV2>::value);
static_assert(noexcept(compute(RequestV2{},ViewV2{})));
uint64_t toad20CrossTU(const RequestV2&,const ViewV2&) noexcept;
#include <iostream>
int main(){
 RequestV2 r{};
 r.slot=1;r.expectedPc=kSyntheticPc;r.epoch=7;r.value=1000000000ULL;
 ViewV2 v{};
 v.slot=1;v.currentPc=kSyntheticPc;v.epoch=7;
 v.claimedBudget=1;v.enabled=true;v.guestReady=true;
 v.origin=OriginClaim::nativeScheduler;v.phase=PhaseClaim::ready;
 if(toad20CrossTU(r,v)!=60750000ULL)return 7;
 const auto result=compute(r,v);
 if(!result.computed())return 8;
 // Explicit BIG-ENDIAN PPC-oriented scalar bytes. NEVER memcpy C++ structs.
 const auto value=result.candidate.rawTicks;
 const uint8_t network[8]{
  static_cast<uint8_t>(value>>56u),static_cast<uint8_t>(value>>48u),
  static_cast<uint8_t>(value>>40u),static_cast<uint8_t>(value>>32u),
  static_cast<uint8_t>(value>>24u),static_cast<uint8_t>(value>>16u),
  static_cast<uint8_t>(value>>8u),static_cast<uint8_t>(value)
 };
 uint64_t recovered=0;
 for(const uint8_t byte:network)recovered=(recovered<<8u)|byte;
 if(recovered!=value)return 9;
 std::cout<<"PASS P20_LAYOUT_TWO_TU_BE_VALUES_ONLY\n";
}
