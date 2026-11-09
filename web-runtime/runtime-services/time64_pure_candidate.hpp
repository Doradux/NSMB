#pragma once
// PHASE18: SOURCE-ONLY PURE numeric raw Wii timebase candidate.
// Public source timebase ratio (243MHz/4) is independent from any guest
// calendar epoch / ReadSystemTime. This is NOT a Nintendo OSGetTime HLE.
// No CpuContext, guest ID, JS trust flag, ticket, state, device, mutex,
// global variable, ledger, heap, callback, or writes.
#include <cstdint>
#include <limits>
#include <type_traits>

namespace nsmbw::w18 {
constexpr uint64_t kRawTicksPerSecond=60750000ULL;
constexpr uint64_t kNanoNumerator=243ULL;
constexpr uint64_t kNanoDenominator=4000ULL;
constexpr uint64_t kNanosecondsPerSecond=1000000000ULL;
static_assert(kRawTicksPerSecond*kNanoDenominator==
              kNanosecondsPerSecond*kNanoNumerator);
enum class Error : uint8_t {ok, overflow, regression, invalid};
struct Candidate final {
  uint64_t ticks=0;
  constexpr uint32_t high32() const noexcept {
    return static_cast<uint32_t>(ticks>>32u);
  }
  constexpr uint32_t low32() const noexcept {
    return static_cast<uint32_t>(ticks);
  }
};
struct Result final {
  Error error=Error::invalid;
  Candidate candidate{};
  constexpr bool ok() const noexcept {return error==Error::ok;}
};
static_assert(std::is_trivially_copyable<Candidate>::value);
static_assert(std::is_trivially_copyable<Result>::value);
// Any tick value is mathematically representable, but cannot authorize
// a guest service by itself. Actual guest/owner/revision/PC/phase/clock
// checks belong to W03's native single canonical ledger.
constexpr Result makeTicks(uint64_t ticks) noexcept {
  return {Error::ok,Candidate{ticks}};
}
// Exact floor(ns * 243 / 4000), with no float/64-bit multiplication wrap.
// q <= UINT64_MAX/4000, so q*243 is representable for all uint64 ns;
// explicit bounds make the proof robust to future ratio changes.
constexpr Result fromNanoseconds(uint64_t ns) noexcept {
  constexpr uint64_t MAX=std::numeric_limits<uint64_t>::max();
  const uint64_t q=ns/kNanoDenominator;
  const uint64_t r=ns%kNanoDenominator;
  if(q>MAX/kNanoNumerator)return {Error::overflow,{}};
  const uint64_t whole=q*kNanoNumerator;
  // r*243 <= 3999*243, provably no overflow.
  const uint64_t fraction=(r*kNanoNumerator)/kNanoDenominator;
  if(fraction>MAX-whole)return {Error::overflow,{}};
  return makeTicks(whole+fraction);
}
constexpr Result addTicks(uint64_t base,uint64_t delta) noexcept {
  if(delta>std::numeric_limits<uint64_t>::max()-base)
    return {Error::overflow,{}};
  return makeTicks(base+delta);
}
constexpr Result signedNanos(int64_t ns) noexcept {
  if(ns<0)return {Error::invalid,{}};
  return fromNanoseconds(static_cast<uint64_t>(ns));
}
constexpr Error requireMonotonic(Candidate candidate,uint64_t lastTicks) noexcept {
  return candidate.ticks<lastTicks?Error::regression:Error::ok;
}
static_assert(fromNanoseconds(1000000000ULL).candidate.ticks==60750000ULL);
static_assert(fromNanoseconds(3999).candidate.ticks==242);
static_assert(fromNanoseconds(4000).candidate.ticks==243);
static_assert(makeTicks(0x100000000ULL).candidate.high32()==1);
static_assert(makeTicks(0x100000000ULL).candidate.low32()==0);
static_assert(addTicks(std::numeric_limits<uint64_t>::max(),1).error==Error::overflow);
} // namespace nsmbw::w18
