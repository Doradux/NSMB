#pragma once
// W16-B: C++-ONLY synthetic scheduler-owned CpuContext service capability.
// NOT Nintendo OSGetTime, NOT an HLE dispatch, NOT an Emscripten/JS export.
// A ticket authorizes exactly one register-pair update on a live W03 guest.
// Never expose Ticket or CpuContext* to JavaScript, nor mint one from JS input.
#include <cstdint>
namespace nsmbw::trusted_cpu {
enum class Status : uint32_t {
  ok=0, invalidTicket=1, stale=2, notReady=3,
  pcMismatch=4, executing=5, unsupported=6
};
class Ticket final {
  uint32_t guest_=0;
  uint64_t epoch_=0, owner_=0, serial_=0;
  Ticket(uint32_t guest, uint64_t epoch, uint64_t owner,
         uint64_t serial) noexcept
    : guest_(guest), epoch_(epoch), owner_(owner), serial_(serial) {}
  friend Ticket leaseSynthetic(uint32_t) noexcept;
  friend Status publishSyntheticPair(Ticket&,uint32_t,uint64_t) noexcept;
#ifdef NSMB_PHASE16_TRUSTED_CPU_TEST
  friend Ticket forgeForNativeTest(uint32_t,uint64_t,uint64_t,uint64_t) noexcept;
#endif
public:
  Ticket() noexcept = default; // Empty, permanently invalid (never authority).
  Ticket(const Ticket&) noexcept = default;
  Ticket& operator=(const Ticket&) noexcept = default;
};
// Trusted native caller only: the returned ticket has private fields, is
// single-use and tied to this exact W03 instance, live guest, and reset epoch.
// Issuing a newer ticket revokes the prior outstanding ticket for that guest.
Ticket leaseSynthetic(uint32_t guest) noexcept;
// Atomic register-only synthetic publish. The expected PC is checked before
// any guest mutation; on all non-ok statuses PC/LR/SP/FPR/GQR/RAM unchanged.
// Both registers are written within the same non-reentrant native operation.
Status publishSyntheticPair(Ticket& ticket, uint32_t expectedPc,
                            uint64_t callerProvidedTicks) noexcept;
#ifdef NSMB_PHASE16_TRUSTED_CPU_TEST
// Explicit native TEST-ONLY forgery oracle; absent in normal builds/Wasm.
Ticket forgeForNativeTest(uint32_t guest,uint64_t epoch,
                          uint64_t owner,uint64_t serial) noexcept;
#endif
}
