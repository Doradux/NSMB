#pragma once
// PHASE18: narrow, fail-closed compile-time dependency on Toad's public PURE
// math-only clock candidate. This header DOES NOT add a second ledger.
// The Toad header appears only when peer's reviewed Phase18 source is linked
// into a combined source tree; before that, there is NO callable adapter.
// No Nintendo original code, JS service import, raw CpuContext* or native HLE.
#include "scheduler_clock.hpp"
#if defined(__has_include)
# if __has_include("../runtime-services/time64_pure_candidate.hpp")
#  include "../runtime-services/time64_pure_candidate.hpp"
#  define NSMB_PHASE18_PURE_TIME64_PRESENT 1
# endif
# if __has_include("../runtime-services/time64_pure_clock.hpp")
#  include "../runtime-services/time64_pure_clock.hpp"
#  define NSMB_PHASE18_PURE_REFERENCE_PRESENT 1
# endif
#endif

#ifdef NSMB_PHASE18_PURE_TIME64_PRESENT
#include <type_traits>
namespace nsmbw::trusted_cpu {
static_assert(std::is_trivially_copyable_v<nsmbw::w18::Candidate>,
              "Pure Time64 input must be immutable scalar data");
// The generated Time64 value is NEVER authorization. Caller must first check
// pure Result.ok() BEFORE requesting W03 Ticket; the private Ticket grants
// only one W03 native guest service. Source epoch/revision are W03 snapshot
// echoes, checked against the live W03 guest by armCanonicalClock and tick.
inline ClockArm armPureTime64Clock(
    Ticket& ticket,uint32_t expectedPc,
    const nsmbw::w18::Candidate& candidate,
    uint64_t expectedEpoch,uint64_t expectedRevision) noexcept {
  const CanonicalClockPlan plan{
    candidate.ticks,candidate.high32(),candidate.low32(),
    expectedEpoch,expectedRevision};
  return armCanonicalClock(ticket,expectedPc,plan);
}
} // namespace nsmbw::trusted_cpu
#endif

#ifdef NSMB_PHASE18_PURE_REFERENCE_PRESENT
namespace nsmbw::trusted_cpu {
// Rich Toad ClockCandidate includes informational source epoch/revision.
// The native W03 Ticket remains mandatory, and W03 independently revalidates
// both echoes and the pair at arm AND current version at scheduler commit.
// Call the pure prepare result's ok() checker BEFORE leaseSynthetic(); a
// failed calculation is NOT a scheduler authorization request.
inline ClockArm armCheckedTime64Clock(
    Ticket& ticket,uint32_t expectedPc,
    const nsmbw::time64_pure::ClockCandidate& candidate) noexcept {
  const CanonicalClockPlan plan{candidate.rawTicks,candidate.high32,
                                candidate.low32,candidate.sourceEpoch,
                                candidate.sourceRevision};
  return armCanonicalClock(ticket,expectedPc,plan);
}
} // namespace nsmbw::trusted_cpu
#endif
