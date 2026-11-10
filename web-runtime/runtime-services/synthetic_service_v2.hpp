#pragma once
// TOAD P20 V2: PUBLIC, PURE, invented only.
// NO actual Wii HLE, guest CPU pointer, W03 Ticket issuer/authority,
// mutable quota or clock ledger, external JS import/export or callbacks.
// ALL RequestV2 / ViewV2 fields can be forged by untrusted callers.
// A status of candidateOnly means ONLY "mathematically computed".
// W03 scheduler must independently authorize, reserve/consume PRIVATE
// quota and commit GPR3/GPR4, canonical ticks/revision as one transaction.
#include "synthetic_service_dispatch.hpp"
#include <cstddef>
#include <cstdint>
#include <limits>
#include <type_traits>
namespace nsmbw::p20::services {
constexpr uint32_t kAbiVersion=2u;
constexpr uint32_t kSyntheticPc=0x80010000u;
constexpr uint32_t kMaximumSlot=0xffffu;
using ServiceId=nsmbw::p19::services::ServiceId;
enum class OriginClaim:uint8_t {
 unknown=0,nativeScheduler=1,jsHost=2,w07Callback=3,mmio=4,irq=5
};
enum class PhaseClaim:uint8_t {
 unknown=0,ready=1,running=2,suspended=3,stopped=4
};
enum class StatusV2:uint32_t {
 candidateOnly=0,unsupported=1,badVersion=2,invalidSlot=3,
 wrongPc=4,wrongEpoch=5,staleRevision=6,forbiddenOriginClaim=7,
 claimedBusy=8,claimedQuotaEmpty=9,disabled=10,overflow=11,
 clockRegression=12,invalidPhase=13,revisionExhausted=14
};
// No serial, issuer, nonce or token: none of those can be issued from
// public Request data. PRIVATE W03 Ticket remains W03-owned.
struct RequestV2 final {
 uint32_t version=kAbiVersion;
 ServiceId service=ServiceId::rawClockFromNanoseconds;
 uint32_t slot=0,expectedPc=0;
 uint64_t epoch=0,revision=0,value=0;
};
// ViewV2 is ONLY an UNTRUSTED numerical preflight hint.
// "nativeScheduler" and claimedBudget>0 are not privileges!
struct ViewV2 final {
 uint32_t slot=0,currentPc=0;
 uint64_t epoch=0,revision=0,previousTicks=0;
 uint32_t claimedBudget=0;
 OriginClaim origin=OriginClaim::unknown;
 PhaseClaim phase=PhaseClaim::unknown;
 bool enabled=false,guestReady=false,busy=false,hasPrevious=false;
};
struct CandidateV2 final {
 uint32_t version=0;
 // DENIAL must be zero in EVERY byte-valued public numeric field.
 ServiceId service=static_cast<ServiceId>(0u);
 uint32_t slot=0,expectedPc=0;
 uint64_t sourceEpoch=0,sourceRevision=0,rawTicks=0;
 uint32_t high32=0,low32=0,proposedCost=0;
};
struct ResultV2 final {
 StatusV2 status=StatusV2::unsupported;
 CandidateV2 candidate{};
 constexpr bool computed() const noexcept {
  return status==StatusV2::candidateOnly;
 }
};
static_assert(sizeof(ServiceId)==4&&sizeof(StatusV2)==4);
static_assert(sizeof(OriginClaim)==1&&sizeof(PhaseClaim)==1);
static_assert(std::is_standard_layout<RequestV2>::value &&
              std::is_trivially_copyable<RequestV2>::value);
static_assert(std::is_standard_layout<ViewV2>::value &&
              std::is_trivially_copyable<ViewV2>::value);
static_assert(std::is_standard_layout<CandidateV2>::value &&
              std::is_trivially_copyable<CandidateV2>::value);
static_assert(std::is_standard_layout<ResultV2>::value &&
              std::is_trivially_copyable<ResultV2>::value);
static_assert(offsetof(CandidateV2,rawTicks)%alignof(uint64_t)==0);
static_assert(offsetof(CandidateV2,high32)>offsetof(CandidateV2,rawTicks));
static_assert(offsetof(CandidateV2,low32)>offsetof(CandidateV2,high32));
constexpr bool allowlisted(ServiceId id) noexcept {
 return id==ServiceId::rawClockFromNanoseconds||
        id==ServiceId::rawClockFromTicks;
}
constexpr ResultV2 denied(StatusV2 reason) noexcept {return {reason,{}};}
// This function NEVER mutates CPU, RAM, quota, epoch, trace or canonical clock.
constexpr ResultV2 compute(const RequestV2& req,
                           const ViewV2& view) noexcept {
 if(req.version!=kAbiVersion)return denied(StatusV2::badVersion);
 if(!allowlisted(req.service))return denied(StatusV2::unsupported);
 if(req.slot==0||req.slot>kMaximumSlot||req.slot!=view.slot)
  return denied(StatusV2::invalidSlot);
 if(!view.enabled)return denied(StatusV2::disabled);
 if(view.origin!=OriginClaim::nativeScheduler)
  return denied(StatusV2::forbiddenOriginClaim);
 if(view.busy)return denied(StatusV2::claimedBusy);
 if(!view.guestReady||view.phase!=PhaseClaim::ready)
  return denied(StatusV2::invalidPhase);
 if(req.expectedPc!=kSyntheticPc||view.currentPc!=kSyntheticPc)
  return denied(StatusV2::wrongPc);
 if(req.epoch==0||req.epoch!=view.epoch)
  return denied(StatusV2::wrongEpoch);
 if(req.revision!=view.revision)
  return denied(StatusV2::staleRevision);
 if(view.claimedBudget==0)
  return denied(StatusV2::claimedQuotaEmpty);
 if(view.revision==std::numeric_limits<uint64_t>::max())
  return denied(StatusV2::revisionExhausted);
 const auto value=(req.service==ServiceId::rawClockFromNanoseconds)
   ?nsmbw::w18::fromNanoseconds(req.value)
   :nsmbw::w18::makeTicks(req.value);
 if(!value.ok())return denied(StatusV2::overflow);
 if(view.hasPrevious&&
    nsmbw::w18::requireMonotonic(value.candidate,view.previousTicks)
      !=nsmbw::w18::Error::ok)
  return denied(StatusV2::clockRegression);
 return {StatusV2::candidateOnly,
   CandidateV2{kAbiVersion,req.service,req.slot,req.expectedPc,
     req.epoch,req.revision,value.candidate.ticks,
     value.candidate.high32(),value.candidate.low32(),1u}};
}
constexpr bool consistent(const CandidateV2& c) noexcept {
 return c.version==kAbiVersion&&allowlisted(c.service)&&
        c.slot!=0&&c.slot<=kMaximumSlot&&
        c.expectedPc==kSyntheticPc&&c.sourceEpoch!=0&&
        c.proposedCost==1&&
        c.high32==static_cast<uint32_t>(c.rawTicks>>32u)&&
        c.low32==static_cast<uint32_t>(c.rawTicks);
}
static_assert(!compute(RequestV2{},ViewV2{}).computed());
static_assert(static_cast<uint32_t>(ServiceId::rawClockFromNanoseconds)
              ==0x53560001u);
static_assert(static_cast<uint32_t>(ServiceId::rawClockFromTicks)
              ==0x53560002u);
static_assert(nsmbw::w18::fromNanoseconds(1000000000ULL).candidate.ticks
              ==60750000ULL);
} // namespace nsmbw::p20::services
