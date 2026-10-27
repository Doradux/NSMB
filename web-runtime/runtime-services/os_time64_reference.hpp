#pragma once
// W15-C: SOURCE-ONLY synthetic OSGetTime register ABI reference.
// Never exported into joined Wasm; no original Wii game code, no native HLE
// registration, no raw CpuContext* pointer allowed across a JS/Wasm boundary.
#include "../frame-host/guest_cpu.hpp"
#include <array>
#include <cstdint>
#include <limits>

namespace nsmbw::w15 {
constexpr uint64_t kTicksPerSecond = 60750000ULL;
constexpr uint64_t kNanoDenominator = 4000ULL;
constexpr uint64_t kTickNumerator = 243ULL;
static_assert(kTicksPerSecond * kNanoDenominator ==
              1000000000ULL * kTickNumerator);
constexpr uint64_t nanoseconds_to_ticks(uint64_t nanos) noexcept {
  // uint64-safe integer floor(nanos * 243 / 4000), no double rounding.
  return (nanos / kNanoDenominator) * kTickNumerator +
         ((nanos % kNanoDenominator) * kTickNumerator) /
             kNanoDenominator;
}
static_assert(nanoseconds_to_ticks(1000000000ULL) == kTicksPerSecond);
static_assert(nanoseconds_to_ticks(3999) == 242);
static_assert(nanoseconds_to_ticks(4000) == 243);

enum class Fault : uint32_t {
  ok = 0, invalidSlot = 1, noGuest = 2, clockRegression = 3,
  tickOverflow = 4, unverifiedEpoch = 5, unsupportedMemory = 6,
  unsupportedMmio = 7, unsupportedIrq = 8, guestAlreadyOpen = 9,
};
enum class Operation : uint32_t {
  registersOnly = 0, guestMemory = 1, mmio = 2, irq = 3,
};
struct Result {
  Fault fault;
  bool committed() const noexcept { return fault == Fault::ok; }
};

// One independent synthetic clock ledger and private CpuContext per slot.
// The real host MUST own the context lifecycle. No HLE symbol is exported.
// This class deliberately has no RAM/MMIO/IRQ interfaces or wall clock.
class ReferenceClock {
  struct Guest {
    CpuContext cpu{};
    uint64_t timebase = 0;
    bool active = false;
  };
  std::array<Guest, 3> guests_{};
public:
  Result open(unsigned index, const CpuContext& seed) noexcept {
    if (index >= guests_.size()) return {Fault::invalidSlot};
    auto& guest = guests_[index];
    if (guest.active) return {Fault::guestAlreadyOpen};
    guest.cpu = seed;
    guest.timebase = 0;
    guest.active = true;
    return {Fault::ok};
  }
  Result publish(unsigned index, uint64_t ticks,
                 Operation requested = Operation::registersOnly) noexcept {
    if (index >= guests_.size()) return {Fault::invalidSlot};
    auto& guest = guests_[index];
    if (!guest.active) return {Fault::noGuest};
    // Unsupported service requests fail BEFORE changing any state.
    if (requested == Operation::guestMemory)
      return {Fault::unsupportedMemory};
    if (requested == Operation::mmio) return {Fault::unsupportedMmio};
    if (requested == Operation::irq) return {Fault::unsupportedIrq};
    if (requested != Operation::registersOnly)
      return {Fault::unsupportedMemory};
    if (ticks < guest.timebase) return {Fault::clockRegression};
    // Exactly two 32-bit GPR writes and ONE ledger commit. No RAM write.
    guest.cpu.gpr[3] = static_cast<uint32_t>(ticks >> 32);
    guest.cpu.gpr[4] = static_cast<uint32_t>(ticks);
    guest.timebase = ticks;
    return {Fault::ok};
  }
  Result advance(unsigned index, uint64_t delta) noexcept {
    if (index >= guests_.size()) return {Fault::invalidSlot};
    auto& guest = guests_[index];
    if (!guest.active) return {Fault::noGuest};
    if (delta > std::numeric_limits<uint64_t>::max() - guest.timebase)
      return {Fault::tickOverflow};
    return publish(index, guest.timebase + delta);
  }
  // This boolean represents an ASSUMPTION made by a native test controller;
  // production integration is DENIED until W03 proves it from real counters.
  Result closeAfterVerifiedReset(unsigned index,
                                 bool verifiedQuiescent) noexcept {
    if (index >= guests_.size()) return {Fault::invalidSlot};
    auto& guest = guests_[index];
    if (!guest.active) return {Fault::noGuest};
    if (!verifiedQuiescent) return {Fault::unverifiedEpoch};
    guest = Guest{};
    return {Fault::ok};
  }
  bool snapshot(unsigned index, CpuContext& output,
                uint64_t& ticks) const noexcept {
    if (index >= guests_.size() || !guests_[index].active) return false;
    output = guests_[index].cpu;
    ticks = guests_[index].timebase;
    return true;
  }
};
} // namespace nsmbw::w15
