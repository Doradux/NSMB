#pragma once
// PHASE19 TOAD — invented-only, HEADER-ONLY, PURE C++17 service dispatcher.
// NO Nintendo OSGetTime HLE; no external C/JS API, CpuContext*, Ticket
// issuance, W07/MMIO, memory, callbacks, mutable global/service state.
// This file can ONLY compute a mathematically valid, untrusted CANDIDATE.
// A JS/native caller may fabricate every Request or GateView bit. NEVER
// regard candidateOnly as authority or quota consumption. Real W03 private
// scheduler must issue and consume Ticket, enforce its OWN slot/epoch/owner/
// serial/PC/quota/busy/phase, then write its SINGLE canonical clock ledger.
#include "time64_pure_candidate.hpp"
#include <cstddef>
#include <cstdint>
#include <limits>
#include <type_traits>

namespace nsmbw::p19::services {
constexpr uint32_t kAbiVersion=1u;
constexpr uint32_t kSyntheticEntryPc=0x80010000u;
constexpr uint32_t kMaximumSlot=0xFFFFu;
enum class ServiceId : uint32_t {
  rawClockFromNanoseconds=0x53560001u,
  rawClockFromTicks=0x53560002u
};
enum class Origin : uint8_t {
  unknown=0, nativeScheduler=1, jsHost=2, w07Callback=3,
  mmio=4, irq=5
};
enum class Phase : uint8_t { unknown=0, ready=1, running=2,
                             suspended=3, stopped=4 };
enum class Status : uint32_t {
  candidateOnly=0, unsupported=1, badVersion=2, invalidSlot=3,
  wrongPc=4, wrongEpoch=5, staleRevision=6, forbiddenOrigin=7,
  dispatchBusy=8, quotaExhausted=9, disabled=10, overflow=11,
  clockRegression=12, invalidPhase=13, staleSerial=14,
  revisionExhausted=15
};
// All scalar, public and FORGEABLE. Do not put "trusted=true" in either.
// Serial and epoch are ECHOES of scheduler data; no secret/authority inside.
struct Request final {
  uint32_t version=kAbiVersion;
  ServiceId id=ServiceId::rawClockFromNanoseconds;
  uint32_t slot=0;
  uint32_t expectedPc=0;
  uint64_t epoch=0;
  uint64_t revision=0;
  uint64_t serial=0;
  uint64_t value=0;
};
// View is an UNTRUSTED read-only description of one W03 snapshot,
// NEVER an authority grant. W03 must check actual private fields again.
struct GateView final {
  uint32_t slot=0;
  uint32_t pc=0;
  uint64_t epoch=0;
  uint64_t revision=0;
  uint64_t serial=0;
  uint64_t lastCommittedTicks=0;
  uint32_t remainingBudget=0;
  Origin origin=Origin::unknown;
  Phase phase=Phase::unknown;
  bool enabled=false;
  bool guestReady=false;
  bool dispatchBusy=false;
  bool clockCommitted=false;
};
struct Candidate final {
  uint32_t version=0;
  ServiceId id=ServiceId::rawClockFromNanoseconds;
  uint32_t slot=0;
  uint32_t expectedPc=0;
  uint64_t sourceEpoch=0;
  uint64_t sourceRevision=0;
  uint64_t sourceSerial=0;
  uint64_t ticks=0;
  uint32_t high32=0;
  uint32_t low32=0;
};
struct Result final {
  Status status=Status::unsupported;
  Candidate candidate{};
  constexpr bool computed() const noexcept {
    return status==Status::candidateOnly;
  }
};
static_assert(std::is_trivially_copyable<Request>::value);
static_assert(std::is_trivially_copyable<GateView>::value);
static_assert(std::is_trivially_copyable<Candidate>::value);
static_assert(std::is_trivially_copyable<Result>::value);
static_assert(std::is_standard_layout<Request>::value);
static_assert(std::is_standard_layout<GateView>::value);
static_assert(std::is_standard_layout<Candidate>::value);
static_assert(std::is_standard_layout<Result>::value);
static_assert(sizeof(uint32_t)==4 && sizeof(uint64_t)==8);
static_assert(offsetof(Candidate,ticks)%alignof(uint64_t)==0);
static_assert(offsetof(Candidate,high32)>offsetof(Candidate,ticks));
static_assert(sizeof(ServiceId)==4 && sizeof(Status)==4);
static_assert(sizeof(Origin)==1 && sizeof(Phase)==1);

constexpr bool isAllowlisted(ServiceId id) noexcept {
  return id==ServiceId::rawClockFromNanoseconds ||
         id==ServiceId::rawClockFromTicks;
}
constexpr Result deny(Status status) noexcept {
  // Every denial returns a ZERO candidate to avoid stale payload reuse.
  return {status,{}};
}
// Stateless policy validation with STRICT allowlist. Host can forge a
// matching GateView; successful computation is NEVER a permission.
// The scheduler must perform authoritative revalidation while staging.
constexpr Result prepare(const Request& request,
                         const GateView& view) noexcept {
  if(request.version!=kAbiVersion)return deny(Status::badVersion);
  if(!isAllowlisted(request.id))return deny(Status::unsupported);
  if(request.slot==0u || request.slot>kMaximumSlot ||
     request.slot!=view.slot)return deny(Status::invalidSlot);
  if(!view.enabled)return deny(Status::disabled);
  if(view.origin!=Origin::nativeScheduler)
    return deny(Status::forbiddenOrigin);
  if(view.dispatchBusy)return deny(Status::dispatchBusy);
  if(!view.guestReady || view.phase!=Phase::ready)
    return deny(Status::invalidPhase);
  if(request.expectedPc!=kSyntheticEntryPc ||
     request.expectedPc!=view.pc)return deny(Status::wrongPc);
  if(request.epoch==0u || request.epoch!=view.epoch)
    return deny(Status::wrongEpoch);
  if(request.revision!=view.revision)
    return deny(Status::staleRevision);
  if(request.serial==0u || request.serial!=view.serial)
    return deny(Status::staleSerial);
  if(view.remainingBudget==0u)return deny(Status::quotaExhausted);
  if(view.revision==std::numeric_limits<uint64_t>::max())
    return deny(Status::revisionExhausted);
  const auto value=(request.id==ServiceId::rawClockFromNanoseconds)
    ?nsmbw::w18::fromNanoseconds(request.value)
    :nsmbw::w18::makeTicks(request.value);
  if(!value.ok())return deny(Status::overflow);
  if(view.clockCommitted &&
     nsmbw::w18::requireMonotonic(value.candidate,
                                   view.lastCommittedTicks)
       !=nsmbw::w18::Error::ok)
    return deny(Status::clockRegression);
  return {Status::candidateOnly,
    Candidate{kAbiVersion,request.id,request.slot,request.expectedPc,
      view.epoch,view.revision,view.serial,value.candidate.ticks,
      value.candidate.high32(),value.candidate.low32()}};
}
// Extra structural verification AFTER transport; still not AUTHORITY.
constexpr bool consistent(const Candidate& p) noexcept {
  return p.version==kAbiVersion && isAllowlisted(p.id) &&
    p.slot>0 && p.slot<=kMaximumSlot &&
    p.expectedPc==kSyntheticEntryPc &&
    p.sourceEpoch!=0 && p.sourceSerial!=0 &&
    p.high32==static_cast<uint32_t>(p.ticks>>32u) &&
    p.low32==static_cast<uint32_t>(p.ticks);
}
static_assert(!prepare(Request{},GateView{}).computed());
static_assert(!isAllowlisted(static_cast<ServiceId>(0xFFFFFFFFu)));
static_assert(nsmbw::w18::fromNanoseconds(1000000000ULL).candidate.ticks==
              60750000ULL);
} // namespace nsmbw::p19::services
