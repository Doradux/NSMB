#pragma once
// Phase17 Peach — synthetic scheduler-owned PREPARE (arm) + internal COMMIT.
// This is a narrow in-process C++ test seam, NOT a Nintendo Wii HLE or an
// authorization boundary against arbitrary linked native C++ modules.
// No extern "C", no EMSCRIPTEN_KEEPALIVE and NO JS-accessible CpuContext*.
#include <cstdint>
#include "trusted_cpu_service.hpp"

namespace nsmbw::trusted_cpu {
enum class ClockArm : uint32_t {
  accepted=0, invalidTicket=1, stale=2, notReady=3, wrongPc=4,
  dispatchBusy=5, alreadyPending=6, regression=7, unsupportedPc=8
};
enum class ClockOutcome : uint32_t {
  none=0, committed=1, abortedStale=2, abortedPc=3,
  abortedRegression=4, cancelled=5
};
struct ClockSnapshot {
  bool guestExists=false;
  bool committed=false;
  bool pending=false;
  uint64_t ticks=0;
  ClockOutcome last=ClockOutcome::none;
};
// Trusted in-process issuer: consume an existing private W03 Ticket (including
// on any DENIED attempt), record a monotonic candidate, and wait for the REAL
// scheduler's next guest dispatch. No CPU register or ledger write on arm.
// Only a deliberately declared synthetic PC is eligible; no Wii override.
// The external Toad Time64 ledger is NOT connected: this is a LOCAL W03 ledger.
ClockArm armSyntheticClock(Ticket& ticket, uint32_t expectedPc,
                           uint64_t preparedTicks) noexcept;
// Read-only native diagnostics; never an exported JS or guest-facing ABI.
// Returned by VALUE, never a CpuContext pointer.
ClockSnapshot inspectSyntheticClock(uint32_t guest) noexcept;
}
