#pragma once
// Phase17 Peach — synthetic scheduler-owned PREPARE (arm) + internal COMMIT.
// This is a narrow in-process C++ test seam, NOT a Nintendo Wii HLE or an
// authorization boundary against arbitrary linked native C++ modules.
// No extern "C", no EMSCRIPTEN_KEEPALIVE and NO JS-accessible CpuContext*.
#include <cstdint>
#include "trusted_cpu_service.hpp"
#ifdef NSMB_PHASE18_CLOCK_TEST
#include "guest_cpu.hpp"
#include <array>
#endif

namespace nsmbw::trusted_cpu {
enum class ClockArm : uint32_t {
  accepted=0, invalidTicket=1, stale=2, notReady=3, wrongPc=4,
  dispatchBusy=5, alreadyPending=6, regression=7, unsupportedPc=8,
  epochMismatch=9, staleRevision=10, badPair=11, revisionExhausted=12,
  quotaExhausted=13
};
enum class ClockOutcome : uint32_t {
  none=0, committed=1, abortedStale=2, abortedPc=3,
  abortedRegression=4, cancelled=5, abortedRevision=6,
  abortedOverflow=7, abortedQuota=8
};
struct ClockSnapshot {
  bool guestExists=false;
  bool committed=false;
  bool pending=false;
  uint64_t ticks=0;
  ClockOutcome last=ClockOutcome::none;
  // Added at end so old W17 C++ aggregate consumers remain compatible.
  uint64_t revision=0;
  uint64_t epoch=0;
};
// One PURE candidate description; authority is separately supplied by a
// private native Ticket. Toad's time64_pure_clock.hpp returns the same scalar
// shape, and W03 validates both halves and echo metadata BEFORE staging.
// This struct is NOT a grant, nor a mutable CPU pointer or second ledger.
struct CanonicalClockPlan final {
  uint64_t rawTicks=0;
  uint32_t high32=0, low32=0;
  uint64_t sourceEpoch=0, sourceRevision=0;
};
// Trusted in-process issuer: consume an existing private W03 Ticket (including
// on any DENIED attempt), record a monotonic candidate, and wait for the REAL
// scheduler's next guest dispatch. No CPU register or ledger write on arm.
// Only a deliberately declared synthetic PC is eligible; no Wii override.
// The external Toad Time64 ledger is NOT connected: this is a LOCAL W03 ledger.
ClockArm armSyntheticClock(Ticket& ticket, uint32_t expectedPc,
                           uint64_t preparedTicks) noexcept;
// W18 canonical W03 ownership: exactly one clockTicks+revision per real
// W03 guest, no second mutable Time64 TransactionService anywhere in path.
// Candidate sourceEpoch/sourceRevision are *echoes* to check for staleness,
// not authorization. Only Ticket can authorize a scheduler-owned arm.
ClockArm armCanonicalClock(Ticket& ticket, uint32_t expectedPc,
                           const CanonicalClockPlan& plan) noexcept;
// Read-only native diagnostics; never an exported JS or guest-facing ABI.
// Returned by VALUE, never a CpuContext pointer.
ClockSnapshot inspectSyntheticClock(uint32_t guest) noexcept;
#ifdef NSMB_PHASE18_CLOCK_TEST
// Native TEST-ONLY oracle. It cannot exist in production builds, Wasm or JS.
// Full CpuContext and W03 trace are returned as COPIES (no raw CPU pointer).
struct ClockNativeTestSnapshot final {
  bool valid=false;
  CpuContext cpu{};
  ClockSnapshot clock{};
  std::array<uint32_t,256> trace{};
  uint32_t traceLength=0,traceDropped=0;
  uint32_t state=0,error=0;
};
ClockNativeTestSnapshot clockNativeTestSnapshot(uint32_t guest) noexcept;
bool clockNativeTestSetRevision(uint32_t guest,uint64_t revision) noexcept;
bool clockNativeTestSetExpectedRevision(uint32_t guest,uint64_t revision) noexcept;
bool clockNativeTestSetExpectedPc(uint32_t guest,uint32_t expectedPc) noexcept;
bool clockNativeTestExhaustSerial() noexcept;
#endif
}
