#pragma once
// Phase16: ISOLATED synthetic Time64 service contract, never registered as HLE.
// No JavaScript grant constructor, no exported raw guest CPU pointer.
// The W03 issuer is only DECLARED here: no trusted production implementation exists.
#include "os_time64_reference.hpp"
#include <array>
#include <atomic>
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
  // A test producer can exist ONLY in a binary compiled with this explicit
  // synthetic-only test flag. Normal production builds contain no issuer.
#if defined(NSMB_PHASE16_TIME64_SYNTHETIC_TEST)
  friend class ::nsmbw::w03::Time64PermitIssuer;
#endif
  friend class Time64EpochService;
  Time64EpochService* owner_;
  uint64_t ownerIncarnation_;
  unsigned slot_;
  uint64_t generation_;
  uint32_t expectedPc_;
  Act act_;
  bool quiet_;
  bool usable_ = true;
  Time64Permit(Time64EpochService& owner, unsigned slot, uint64_t generation,
               uint32_t pc, Act act, bool quiet) noexcept;
public:
  Time64Permit(const Time64Permit&) = delete;
  Time64Permit& operator=(const Time64Permit&) = delete;
  Time64Permit(Time64Permit&& rhs) noexcept
    : owner_(rhs.owner_), ownerIncarnation_(rhs.ownerIncarnation_),
      slot_(rhs.slot_), generation_(rhs.generation_),
      expectedPc_(rhs.expectedPc_), act_(rhs.act_), quiet_(rhs.quiet_),
      usable_(rhs.usable_) { rhs.usable_ = false; }
  Time64Permit& operator=(Time64Permit&&) = delete;
};

// Slots own ONLY private CPU copies; W03 never supplies a caller-chosen pointer.
// No registration of native OSGetTime, no guest memory, MMIO or IRQ effects.
class Time64EpochService final {
  friend class Time64Permit;
  // A process-wide monotonic service incarnation, independent of address.
  // Atomic CAS permanently latches to 0 on uint64 exhaustion: fail closed,
  // NEVER issue an identity already used before, including placement-new ABA.
  static uint64_t allocateIncarnation() noexcept {
    static std::atomic<uint64_t> next{1};
    uint64_t candidate = next.load(std::memory_order_relaxed);
    while (candidate != 0) {
      const uint64_t successor = candidate == std::numeric_limits<uint64_t>::max()
        ? 0 : candidate + 1;
      if (next.compare_exchange_weak(candidate, successor,
            std::memory_order_relaxed, std::memory_order_relaxed))
        return candidate;
    }
    return 0;
  }
  const uint64_t incarnation_ = allocateIncarnation();
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
    if (incarnation_ == 0 || permit.owner_ != this ||
        permit.ownerIncarnation_ != incarnation_) return {Error::untrusted};
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
  Time64EpochService() noexcept = default;
  Time64EpochService(const Time64EpochService&) = delete;
  Time64EpochService& operator=(const Time64EpochService&) = delete;
  Time64EpochService(Time64EpochService&&) = delete;
  Time64EpochService& operator=(Time64EpochService&&) = delete;

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
    if (!permit.usable_ || permit.owner_ != this ||
        incarnation_ == 0 || permit.ownerIncarnation_ != incarnation_ ||
        permit.act_ != Act::sample ||
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
inline Time64Permit::Time64Permit(Time64EpochService& owner, unsigned slot,
                                  uint64_t generation, uint32_t pc,
                                  Act act, bool quiet) noexcept
  : owner_(&owner), ownerIncarnation_(owner.incarnation_), slot_(slot),
    generation_(generation), expectedPc_(pc), act_(act), quiet_(quiet) {}
} // namespace nsmbw::w16
