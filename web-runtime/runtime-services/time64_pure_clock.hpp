#pragma once
// PHASE18 TOAD — PURE deterministic, SOURCE-ONLY raw timebase math.
// Absolutely no CpuContext, scheduler ticket, guest memory, device, clock
// ledger, syscalls, JS trust, mutable state or Wii HLE in this header.
// Source-pinned public clock ratio: 243MHz/4 = 60,750,000 tick/s.
// This is NOT ReadSystemTime, guest RTC epoch, a source of authority, or
// proof of Wii original-code execution. W03 alone owns any live CPU/ledger.
#include "time64_pure_candidate.hpp"
#include <cstdint>
#include <limits>
#include <type_traits>

namespace nsmbw::time64_pure {
constexpr uint64_t kRawTicksPerSecond = 60750000ULL;
constexpr uint64_t kNanosecondsPerSecond = 1000000000ULL;
constexpr uint64_t kClockNumerator = 243ULL;
constexpr uint64_t kClockDenominator = 4000ULL;
static_assert(kRawTicksPerSecond*kClockDenominator ==
              kNanosecondsPerSecond*kClockNumerator);

enum class Error : uint8_t {
  ok, staleEpoch, staleRevision, negativeHost, regressiveHost,
  regressiveTicks, overflow, malformed
};
// This structure contains W03-supplied *facts* and MUST NOT be treated as an
// authenticated capability. The host can forge every input field here.
// W03 MUST separately verify native owner/serial/guest/PC/phase while
// holding its own non-reentrant scheduler-owned commit region.
struct Reference final {
  uint64_t lastHostNanos=0;
  uint64_t lastCommittedTicks=0;
  uint64_t sourceEpoch=0;
  uint64_t sourceRevision=0;
  bool initialized=false;
};
// A value object only. Source identity fields are W03-observed reference
// versions, not a permit; no callback and no pointer are carried.
struct ClockCandidate final {
  uint64_t rawTicks=0;
  uint32_t high32=0;
  uint32_t low32=0;
  uint64_t sourceEpoch=0;
  uint64_t sourceRevision=0;
};
struct Result final {
  Error error=Error::malformed;
  ClockCandidate candidate{};
  constexpr bool ok() const noexcept { return error==Error::ok; }
};
static_assert(std::is_trivially_copyable<Reference>::value);
static_assert(std::is_trivially_copyable<ClockCandidate>::value);
static_assert(std::is_trivially_copyable<Result>::value);

constexpr Error preflightReference(const Reference& reference,
                                   uint64_t offeredEpoch,
                                   uint64_t offeredRevision) noexcept {
  if (reference.sourceEpoch==0 ||
      offeredEpoch!=reference.sourceEpoch) return Error::staleEpoch;
  if (offeredRevision!=reference.sourceRevision) return Error::staleRevision;
  // If canonical W03 increments its uint64 revision at commit, deny wrap.
  if (reference.sourceRevision==std::numeric_limits<uint64_t>::max())
    return Error::overflow;
  return Error::ok;
}
constexpr ClockCandidate makeCandidate(uint64_t ticks,
                                       const Reference& reference) noexcept {
  return {ticks,static_cast<uint32_t>(ticks>>32u),
          static_cast<uint32_t>(ticks),reference.sourceEpoch,
          reference.sourceRevision};
}
// Independently validate ALL fields against a NEW W03 reference BEFORE W03's
// sole, synchronous no-throw commit. This function never grants authority.
constexpr Error validateForCommit(const ClockCandidate& candidate,
                                  const Reference& reference) noexcept {
  const Error e=preflightReference(reference,candidate.sourceEpoch,
                                  candidate.sourceRevision);
  if(e!=Error::ok)return e;
  if(candidate.high32!=static_cast<uint32_t>(candidate.rawTicks>>32u) ||
     candidate.low32!=static_cast<uint32_t>(candidate.rawTicks))
    return Error::malformed;
  if(reference.initialized && candidate.rawTicks<reference.lastCommittedTicks)
    return Error::regressiveTicks;
  return Error::ok;
}
constexpr Result prepareFromTicks(uint64_t ticks,
                                  const Reference& reference,
                                  uint64_t offeredEpoch,
                                  uint64_t offeredRevision) noexcept {
  const Error e=preflightReference(reference,offeredEpoch,offeredRevision);
  if(e!=Error::ok)return {e,{}};
  if(reference.initialized && ticks<reference.lastCommittedTicks)
    return {Error::regressiveTicks,{}};
  return {Error::ok,makeCandidate(ticks,reference)};
}
// floor(ns*243/4000) WITHOUT overflow in intermediate 64-bit arithmetic.
// Quotient+remainder and explicit checked multiplication/addition guards
// remain valid even if the source ratio is revised in a later review.
constexpr Result prepareFromNanos(uint64_t hostNanos,
                                  const Reference& reference,
                                  uint64_t offeredEpoch,
                                  uint64_t offeredRevision) noexcept {
  const Error e=preflightReference(reference,offeredEpoch,offeredRevision);
  if(e!=Error::ok)return {e,{}};
  if(reference.initialized && hostNanos<reference.lastHostNanos)
    return {Error::regressiveHost,{}};
  const auto numeric=nsmbw::w18::fromNanoseconds(hostNanos);
  if(!numeric.ok())return {Error::overflow,{}};
  return prepareFromTicks(numeric.candidate.ticks,reference,
                          offeredEpoch,offeredRevision);
}
constexpr Result prepareFromSignedNanos(int64_t hostNanos,
                                        const Reference& reference,
                                        uint64_t offeredEpoch,
                                        uint64_t offeredRevision) noexcept {
  if(hostNanos<0)return {Error::negativeHost,{}};
  return prepareFromNanos(static_cast<uint64_t>(hostNanos),reference,
                          offeredEpoch,offeredRevision);
}
// Numeric operations ONLY; W03 must do independent, current-guest preflight.
// checkedAddTicks is useful for seed deltas without inventing a host epoch.
constexpr Result checkedAddTicks(uint64_t baseTicks,uint64_t deltaTicks,
                                 const Reference& reference,
                                 uint64_t offeredEpoch,
                                 uint64_t offeredRevision) noexcept {
  const Error e=preflightReference(reference,offeredEpoch,offeredRevision);
  if(e!=Error::ok)return {e,{}};
  const auto numeric=nsmbw::w18::addTicks(baseTicks,deltaTicks);
  if(!numeric.ok())return {Error::overflow,{}};
  return prepareFromTicks(numeric.candidate.ticks,reference,
                          offeredEpoch,offeredRevision);
}
// A raw clock cannot move backwards even when the caller presents a signed
// delta. We reject negative incl INT64_MIN WITHOUT ever negating INT64_MIN.
constexpr Result checkedSignedDelta(uint64_t baseTicks,int64_t deltaTicks,
                                    const Reference& reference,
                                    uint64_t offeredEpoch,
                                    uint64_t offeredRevision) noexcept {
  if(deltaTicks<0)return {Error::regressiveTicks,{}};
  return checkedAddTicks(baseTicks,static_cast<uint64_t>(deltaTicks),
                         reference,offeredEpoch,offeredRevision);
}
static_assert(prepareFromNanos(1000000000ULL,
              Reference{0,0,1,0,false},1,0).candidate.rawTicks==
              kRawTicksPerSecond);
static_assert(prepareFromNanos(3999,Reference{0,0,1,0,false},1,0)
              .candidate.rawTicks==242);
static_assert(prepareFromTicks(0x100000000ULL,Reference{0,0,1,0,false},1,0)
              .candidate.high32==1);
} // namespace nsmbw::time64_pure
