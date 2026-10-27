#pragma once
// Phase16: ISOLATED synthetic Time64 service contract, never registered as HLE.
// No JavaScript grant constructor, no exported raw guest CPU pointer.
// The W03 issuer is only DECLARED here: no trusted production implementation exists.
#include "os_time64_reference.hpp"
#include <array>
#include <cstdint>
#include <limits>

namespace nsmbw::w03 { class Time64PermitIssuer; }

namespace nsmbw::w16 {
using nsmbw::w15::Operation;
class Time64EpochService;
enum class Act : uint8_t { open, sample, reset };
enum class Error : uint8_t {
  ok, untrusted, wrongAction, badSlot, noGuest, occupied,
  badGeneration, staleGeneration, wrongPc, notQuiet,
  regression, overflow, memoryDenied, mmioDenied, irqDenied
};
struct Outcome {
  Error error;
  bool committed() const noexcept { return error == Error::ok; }
};

// A move-only, single-use capability. Only a future reviewed W03 native issuer
// may mint one; synthetic tests define a LOCAL issuer fake to test this seam.
// This is a compile-time authority boundary, not cryptographic attestation.
class Time64Permit final {
  friend class ::nsmbw::w03::Time64PermitIssuer;
  friend class Time64EpochService;
  Time64EpochService* owner_;
  unsigned slot_;
  uint64_t generation_;
  uint32_t expectedPc_;
  Act act_;
  bool quiet_;
  bool usable_ = true;
  Time64Permit(Time64EpochService& owner, unsigned slot, uint64_t generation,
               uint32_t pc, Act act, bool quiet) noexcept
    : owner_(&owner), slot_(slot), generation_(generation),
      expectedPc_(pc), act_(act), quiet_(quiet) {}
public:
  Time64Permit(const Time64Permit&) = delete;
  Time64Permit& operator=(const Time64Permit&) = delete;
  Time64Permit(Time64Permit&& rhs) noexcept
    : owner_(rhs.owner_), slot_(rhs.slot_), generation_(rhs.generation_),
      expectedPc_(rhs.expectedPc_), act_(rhs.act_), quiet_(rhs.quiet_),
      usable_(rhs.usable_) { rhs.usable_ = false; }
  Time64Permit& operator=(Time64Permit&&) = delete;
};

// Slots own ONLY private CPU copies; W03 never supplies a caller-chosen pointer.
// No registration of native OSGetTime, no guest memory, MMIO or IRQ effects.
class Time64EpochService final {
  struct Slot {
    CpuContext cpu{};
    uint64_t timebase = 0;
    uint64_t generation = 0;
    uint64_t retiredGeneration = 0; // retained across reset: no ABA reuse
    bool active = false;
  };
  std::array<Slot, 3> slots_{};

  Outcome validate(Time64Permit& permit, Act action) noexcept {
    if (!permit.usable_) return {Error::untrusted};
    permit.usable_ = false; // ANY attempt consumes even on failure
    if (permit.owner_ != this) return {Error::untrusted};
    if (permit.act_ != action) return {Error::wrongAction};
    if (permit.slot_ >= slots_.size()) return {Error::badSlot};
    return {Error::ok};
  }
  static Outcome denied(Operation operation) noexcept {
    if (operation == Operation::guestMemory) return {Error::memoryDenied};
    if (operation == Operation::mmio) return {Error::mmioDenied};
    if (operation == Operation::irq) return {Error::irqDenied};
    if (operation != Operation::registersOnly) return {Error::memoryDenied};
    return {Error::ok};
  }
public:
  Outcome open(Time64Permit&& permit, const CpuContext& seed) noexcept {
    const auto status = validate(permit, Act::open);
    if (!status.committed()) return status;
    Slot& slot = slots_[permit.slot_];
    if (slot.active) return {Error::occupied};
    if (permit.generation_ == 0 ||
        permit.generation_ <= slot.retiredGeneration) return {Error::staleGeneration};
    if (seed.pc != permit.expectedPc_) return {Error::wrongPc};
    slot.cpu = seed;
    slot.timebase = 0;
    slot.generation = permit.generation_;
    slot.active = true;
    return {Error::ok};
  }

  Outcome publish(Time64Permit&& permit, uint64_t ticks,
                  Operation operation = Operation::registersOnly) noexcept {
    const auto status = validate(permit, Act::sample);
    if (!status.committed()) return status;
    Slot& slot = slots_[permit.slot_];
    if (!slot.active) return {Error::noGuest};
    if (slot.generation != permit.generation_) return {Error::badGeneration};
    if (slot.cpu.pc != permit.expectedPc_) return {Error::wrongPc};
    const auto denial = denied(operation);
    if (!denial.committed()) return denial;
    if (ticks < slot.timebase) return {Error::regression};
    // Commit both GPRs and timebase only AFTER all possible faults.
    slot.cpu.gpr[3] = static_cast<uint32_t>(ticks >> 32);
    slot.cpu.gpr[4] = static_cast<uint32_t>(ticks);
    slot.timebase = ticks;
    return {Error::ok};
  }

  // Exact raw timebase nanoseconds conversion, no wall clock or OS epoch.
  Outcome publishNanoseconds(Time64Permit&& permit, uint64_t nanos,
                             Operation operation = Operation::registersOnly) noexcept {
    return publish(static_cast<Time64Permit&&>(permit),
                   nsmbw::w15::nanoseconds_to_ticks(nanos), operation);
  }

  Outcome advance(Time64Permit&& permit, uint64_t delta,
                  Operation operation = Operation::registersOnly) noexcept {
    // Advance checks overflow without mutating anything; publish checks
    // generation/PC/operation. Never dereference a forged/invalid slot.
    if (!permit.usable_ || permit.owner_ != this || permit.act_ != Act::sample ||
        permit.slot_ >= slots_.size()) return publish(static_cast<Time64Permit&&>(permit), 0, operation);
    const Slot& slot = slots_[permit.slot_];
    if (slot.active && slot.generation == permit.generation_ &&
        slot.cpu.pc == permit.expectedPc_ &&
        operation == Operation::registersOnly &&
        delta > std::numeric_limits<uint64_t>::max() - slot.timebase) {
      permit.usable_ = false;
      return {Error::overflow};
    }
    return publish(static_cast<Time64Permit&&>(permit),
                   slot.timebase + delta, operation);
  }

  Outcome reset(Time64Permit&& permit) noexcept {
    const auto status = validate(permit, Act::reset);
    if (!status.committed()) return status;
    Slot& slot = slots_[permit.slot_];
    if (!slot.active) return {Error::noGuest};
    if (slot.generation != permit.generation_) return {Error::badGeneration};
    if (slot.cpu.pc != permit.expectedPc_) return {Error::wrongPc};
    if (!permit.quiet_) return {Error::notQuiet};
    const uint64_t last = slot.generation;
    slot = Slot{};
    slot.retiredGeneration = last;
    return {Error::ok};
  }

  bool snapshot(unsigned index, CpuContext& cpu, uint64_t& ticks,
                uint64_t& generation) const noexcept {
    if (index >= slots_.size() || !slots_[index].active) return false;
    const Slot& slot = slots_[index];
    cpu = slot.cpu;
    ticks = slot.timebase;
    generation = slot.generation;
    return true;
  }
};
} // namespace nsmbw::w16
