#pragma once
// Phase17: independent SYNTHETIC Time64 transaction; NOT Nintendo OSGetTime
// HLE, not a W03 scheduler-owned callsite, not a JS/Wasm interface.
// Authoritative issuer is NOT implemented in production. Test-only friend
// under an explicit flag simulates W03 preflight in native unit tests.
#include "os_time64_reference.hpp"
#include <array>
#include <atomic>
#include <cstdint>
#include <limits>
#include <optional>
#include <utility>
namespace nsmbw::w03 { class Time64TransactionIssuer; }
namespace nsmbw::w17 {
using CpuContext = ::CpuContext;
using Operation = nsmbw::w15::Operation;
class TransactionService;
enum class Action : uint8_t { open, commit, reset };
enum class Phase : uint8_t {
  quiescent, dispatching, reentrant, deviceFault, quotaFault,
  mmio, irq, resetting
};
enum class Error : uint8_t {
  ok, untrusted, consumed, wrongAction, badSlot, noGuest, occupied,
  staleGeneration, badGeneration, wrongPc, regression, overflow,
  stalePrepared, busy, deviceDenied, quotaDenied, mmioDenied,
  irqDenied, memoryDenied, notQuiescent
};
class Authority final {
#if defined(NSMB_PHASE17_TIME64_SYNTHETIC_TEST)
  friend class ::nsmbw::w03::Time64TransactionIssuer;
#endif
  friend class TransactionService;
  TransactionService* owner_;
  uint64_t incarnation_;
  unsigned slot_;
  uint64_t generation_;
  uint32_t expectedPc_;
  Action action_;
  Phase phase_;
  bool usable_ = true;
  Authority(TransactionService& owner, unsigned slot, uint64_t generation,
            uint32_t pc, Action action, Phase phase) noexcept;
public:
  Authority() = delete;
  Authority(const Authority&) = delete;
  Authority& operator=(const Authority&) = delete;
  Authority(Authority&& rhs) noexcept
    : owner_(rhs.owner_), incarnation_(rhs.incarnation_), slot_(rhs.slot_),
      generation_(rhs.generation_), expectedPc_(rhs.expectedPc_),
      action_(rhs.action_), phase_(rhs.phase_), usable_(rhs.usable_) {
    rhs.usable_ = false;
  }
  Authority& operator=(Authority&&) = delete;
};
class Prepared final {
  friend class TransactionService;
  const TransactionService* owner_;
  uint64_t incarnation_;
  unsigned slot_;
  uint64_t generation_;
  uint64_t revision_;
  uint32_t pc_;
  uint64_t ticks_;
  bool usable_ = true;
  Prepared(const TransactionService& owner, unsigned slot, uint64_t generation,
           uint64_t revision, uint32_t pc, uint64_t ticks) noexcept;
public:
  Prepared() = delete;
  Prepared(const Prepared&) = delete;
  Prepared& operator=(const Prepared&) = delete;
  Prepared(Prepared&& rhs) noexcept
    : owner_(rhs.owner_), incarnation_(rhs.incarnation_), slot_(rhs.slot_),
      generation_(rhs.generation_), revision_(rhs.revision_), pc_(rhs.pc_),
      ticks_(rhs.ticks_), usable_(rhs.usable_) { rhs.usable_=false; }
  Prepared& operator=(Prepared&&) = delete;
  uint64_t ticks() const noexcept { return ticks_; }
  uint32_t high32() const noexcept { return static_cast<uint32_t>(ticks_>>32); }
  uint32_t low32() const noexcept { return static_cast<uint32_t>(ticks_); }
};
struct Proposal final {
  Error error;
  std::optional<Prepared> candidate;
};
class TransactionService final {
  friend class Authority;
  friend class Prepared;
  // Monotonic process-global instance IDs; permanently latch closed at UINT64_MAX.
  // No original/raw CPU handle exposed outside this synthetic model.
  static uint64_t allocateIncarnation() noexcept {
    static std::atomic<uint64_t> counter{1};
    uint64_t current=counter.load(std::memory_order_relaxed);
    while (current) {
      const uint64_t following =
        current==std::numeric_limits<uint64_t>::max()?0:current+1;
      if (counter.compare_exchange_weak(current,following,
          std::memory_order_relaxed,std::memory_order_relaxed))
        return current;
    }
    return 0;
  }
  const uint64_t incarnation_ = allocateIncarnation();
  struct Slot {
    CpuContext cpu{};
    uint64_t ticks=0;
    uint64_t generation=0;
    uint64_t retiredGeneration=0;
    uint64_t revision=0;
    bool active=false;
  };
  std::array<Slot,3> slots_{};
  static Error denied(Operation op) noexcept {
    if (op==Operation::registersOnly) return Error::ok;
    if (op==Operation::mmio) return Error::mmioDenied;
    if (op==Operation::irq) return Error::irqDenied;
    return Error::memoryDenied;
  }
  static Error phaseDenied(Phase phase) noexcept {
    switch (phase) {
      case Phase::quiescent: return Error::ok;
      case Phase::dispatching: case Phase::reentrant:
      case Phase::resetting: return Error::busy;
      case Phase::deviceFault: return Error::deviceDenied;
      case Phase::quotaFault: return Error::quotaDenied;
      case Phase::mmio: return Error::mmioDenied;
      case Phase::irq: return Error::irqDenied;
    }
    return Error::notQuiescent;
  }
  Error admit(Authority& auth, Action action) const noexcept {
    if (!auth.usable_) return Error::consumed;
    auth.usable_=false; // Failed admission also consumes one-use ticket.
    if (incarnation_==0 || auth.owner_!=this ||
        auth.incarnation_!=incarnation_) return Error::untrusted;
    if (auth.action_!=action) return Error::wrongAction;
    if (auth.slot_>=slots_.size()) return Error::badSlot;
    return phaseDenied(auth.phase_);
  }
public:
  TransactionService() noexcept = default;
  TransactionService(const TransactionService&) = delete;
  TransactionService& operator=(const TransactionService&) = delete;
  TransactionService(TransactionService&&) = delete;
  TransactionService& operator=(TransactionService&&) = delete;
  Error open(Authority&& authority, const CpuContext& seed) noexcept {
    const Error e=admit(authority,Action::open);
    if (e!=Error::ok) return e;
    Slot& slot=slots_[authority.slot_];
    if (slot.active) return Error::occupied;
    if (authority.generation_==0 ||
        authority.generation_<=slot.retiredGeneration)
      return Error::staleGeneration;
    if (seed.pc!=authority.expectedPc_) return Error::wrongPc;
    slot.cpu=seed;slot.generation=authority.generation_;
    slot.revision=0;slot.ticks=0;slot.active=true;
    return Error::ok;
  }
  Error reset(Authority&& authority) noexcept {
    const Error e=admit(authority,Action::reset);
    if (e!=Error::ok) return e;
    Slot& slot=slots_[authority.slot_];
    if (!slot.active) return Error::noGuest;
    if (slot.generation!=authority.generation_) return Error::badGeneration;
    if (slot.cpu.pc!=authority.expectedPc_) return Error::wrongPc;
    const uint64_t retired=slot.generation;
    slot=Slot{};
    slot.retiredGeneration=retired;
    return Error::ok;
  }
  // Explicitly read-only: prepare never mutates CPU registers, clock ledger,
  // active guest state or revision. It only builds a move-only candidate.
  Proposal prepareTicks(unsigned slotId,uint64_t generation,uint32_t expectedPc,
                        uint64_t requestedTicks,
                        Operation operation=Operation::registersOnly) const noexcept {
    if (incarnation_==0) return {Error::untrusted,std::nullopt};
    if (slotId>=slots_.size()) return {Error::badSlot,std::nullopt};
    const Slot& slot=slots_[slotId];
    if (!slot.active) return {Error::noGuest,std::nullopt};
    if (slot.generation!=generation) return {Error::badGeneration,std::nullopt};
    if (slot.cpu.pc!=expectedPc) return {Error::wrongPc,std::nullopt};
    const Error e=denied(operation);
    if (e!=Error::ok) return {e,std::nullopt};
    if (slot.revision==std::numeric_limits<uint64_t>::max())
      return {Error::overflow,std::nullopt};
    if (requestedTicks<slot.ticks) return {Error::regression,std::nullopt};
    return {Error::ok,std::optional<Prepared>{Prepared{
      *this,slotId,generation,
      slot.revision,expectedPc,requestedTicks}}};
  }
  Proposal prepareNanoseconds(unsigned slotId,uint64_t generation,
                              uint32_t expectedPc,uint64_t nanos,
                              Operation operation=Operation::registersOnly) const noexcept {
    return prepareTicks(slotId,generation,expectedPc,
      nsmbw::w15::nanoseconds_to_ticks(nanos),operation);
  }
  Proposal prepareAdvance(unsigned slotId,uint64_t generation,
                          uint32_t expectedPc,uint64_t delta,
                          Operation operation=Operation::registersOnly) const noexcept {
    if (incarnation_==0) return {Error::untrusted,std::nullopt};
    if (slotId>=slots_.size()) return {Error::badSlot,std::nullopt};
    const Slot& slot=slots_[slotId];
    if (!slot.active) return {Error::noGuest,std::nullopt};
    if (slot.generation!=generation) return {Error::badGeneration,std::nullopt};
    if (slot.cpu.pc!=expectedPc) return {Error::wrongPc,std::nullopt};
    const Error e=denied(operation);
    if (e!=Error::ok) return {e,std::nullopt};
    if (delta>std::numeric_limits<uint64_t>::max()-slot.ticks)
      return {Error::overflow,std::nullopt};
    return prepareTicks(slotId,generation,expectedPc,slot.ticks+delta,operation);
  }
  // Abort only consumes its local ticket; no service state can be changed.
  Error abort(Prepared&& proposed) const noexcept {
    if (!proposed.usable_) return Error::consumed;
    proposed.usable_=false;
    if (incarnation_==0 || proposed.owner_!=this ||
        proposed.incarnation_!=incarnation_) return Error::untrusted;
    return Error::ok;
  }
  // This commit currently updates only PRIVATE synthetic CpuContext copies.
  // ALL validation runs before the first write; no fallible callbacks exist
  // between r3/r4/ledger/revision writes. Future real W03 integration MUST
  // replace this with a reviewed scheduler-owned non-reentrant co-commit.
  // Do not claim this native model is a production CPU/HLE endpoint.
  Error commit(Prepared&& proposed, Authority&& authority) noexcept {
    if (!proposed.usable_) {
      (void)admit(authority,Action::commit);
      return Error::consumed;
    }
    proposed.usable_=false;
    const Error e=admit(authority,Action::commit);
    if (e!=Error::ok) return e;
    if (incarnation_==0 || proposed.owner_!=this ||
        proposed.incarnation_!=incarnation_) return Error::untrusted;
    if (proposed.slot_!=authority.slot_) return Error::badSlot;
    if (proposed.generation_!=authority.generation_) return Error::badGeneration;
    if (proposed.pc_!=authority.expectedPc_) return Error::wrongPc;
    const Slot& inspect=slots_[proposed.slot_];
    if (!inspect.active) return Error::noGuest;
    if (inspect.generation!=proposed.generation_) return Error::badGeneration;
    if (inspect.cpu.pc!=proposed.pc_) return Error::wrongPc;
    if (inspect.revision!=proposed.revision_) return Error::stalePrepared;
    if (inspect.revision==std::numeric_limits<uint64_t>::max())
      return Error::overflow;
    if (proposed.ticks_<inspect.ticks) return Error::regression;
    // COMMIT POINT. All operations below are non-throwing scalar writes,
    // single-thread native-scheduler-only, with no callback or reentry.
    // Real multithreaded W03 needs a separately reviewed critical section.
    Slot& slot=slots_[proposed.slot_];
    slot.cpu.gpr[3]=static_cast<uint32_t>(proposed.ticks_>>32);
    slot.cpu.gpr[4]=static_cast<uint32_t>(proposed.ticks_);
    slot.ticks=proposed.ticks_;
    ++slot.revision;
    return Error::ok;
  }
  bool snapshot(unsigned slotId,CpuContext& cpu,uint64_t& ticks,
                uint64_t& generation,uint64_t& revision) const noexcept {
    if (slotId>=slots_.size() || !slots_[slotId].active) return false;
    const Slot& slot=slots_[slotId];
    cpu=slot.cpu;ticks=slot.ticks;
    generation=slot.generation;revision=slot.revision;
    return true;
  }
};
inline Authority::Authority(TransactionService& owner,unsigned slot,
                            uint64_t generation,uint32_t pc,Action action,
                            Phase phase) noexcept
 : owner_(&owner),incarnation_(owner.incarnation_),slot_(slot),
   generation_(generation),expectedPc_(pc),action_(action),phase_(phase) {}
inline Prepared::Prepared(const TransactionService& owner,unsigned slot,
                          uint64_t generation,uint64_t revision,uint32_t pc,
                          uint64_t ticks) noexcept
 : owner_(&owner),incarnation_(owner.incarnation_),slot_(slot),
   generation_(generation),revision_(revision),pc_(pc),ticks_(ticks) {}
} // namespace nsmbw::w17
