# PHASE16 Peach — scheduler-owned native CPU service gate (synthetic only)

**Code reviewed against:** `d5f4f2a93fc08fd4b1ee4ad22acf042abc3b365d` (public main phase15).
**Owner:** Peach. **No Nintendo code, original Wii function, or HLE dispatch.**

## What is new (source-level implementation, not a mock)

`web-runtime/frame-host/frame_loop.cpp` integrates a C++ namespace
`nsmbw::trusted_cpu` using its **actual** private W03 `tasks`,
`Context::cpu`, `nsmbw_loop_tick`, `nsmbw_loop_reset`, spawn,
pause/resume, cancel and reap operations. It compiles and links directly
with the existing `guest_cpu.cpp`, `translator_abi_fixture.cpp`,
`guest_memory.cpp`, `synthetic_guest.cpp`, `device_policy.cpp`, and
`input_snapshot.cpp` in native g++ tests. This is not a detached JS
simulation: successful calls mutate W03's real privately owned
`CpuContext` registers as exposed by `nsmbw_loop_cpu_gpr`.

`web-runtime/frame-host/trusted_cpu_service.hpp` exposes exactly these
C++-ONLY declarations (never decorated `extern "C"`, `EXPORT` or
`EMSCRIPTEN_KEEPALIVE`):

- `Ticket leaseSynthetic(uint32_t guest) noexcept`: mint one ticket for a
  presently LIVE, READY `kind=1` synthetic CPU context. Ticket fields
  are private and no pointer to context is returned. Each new lease
  immediately revokes the prior one for that slot.
- `Status publishSyntheticPair(Ticket&, uint32_t expectedPc, uint64_t callerProvidedTicks) noexcept`:
  atomic **register-only** placement of high32 into **GPR3** and low32
  into **GPR4** after validating precise guest/epoch/owner/lease and
  expected PC. On success ticket retired, PC/LR/SP untouched. On
  non-ok no guest register, page, trace or memory mutation.
- `Status` is a typed native enum with explicit codes
  `ok(0), invalidTicket(1), stale(2), notReady(3),
  pcMismatch(4), executing(5), unsupported(6)`.
  Unsupported remains reserved; it is **not** a successful fake HLE.

Tickets are native C++ capabilities. The `Ticket` constructor and all
fields are private and a default-constructed Ticket is always invalid.
Ticket copies cannot replay after first use. A private monotonically
increasing **64-bit serviceOwner and per-lease serial** plus reset epoch
protects guest ID recycling, stale lease reuse and reset. Serial and
epoch wrap/exhaustion FAIL CLOSED rather than permitting reuse.
`nsmbw_loop_tick` retires outstanding tickets before dispatching each
guest step. No application-facing JS may construct, pass, inspect, or
guess a token or a `CpuContext*`; no `_nsmbw_trusted_*` public
Emscripten C ABI exists. `forgeForNativeTest()` exists ONLY in
the `NSMB_PHASE16_TRUSTED_CPU_TEST` conditional **native test build**.

This architecture is explicitly for an in-process trusted C++ caller
in future; the current C++ namespace is **not an authorization
boundary between untrusted native C++ modules** and is **not a browser
plugin API**. The non-exported surface does NOT establish trusted
provenance of any Nintendo function. No clock or native time source is
wired into W03.

## Native quiescence and irreversible service boundary

W03's actual scheduler `nsmbw_loop_tick()` now sets `dispatching`
using a scope guard and rejects nested scheduler ticking. Its lifecycle
mutators (reset, spawn, pause/resume, cancel, reap, quota-retry, test
fixture spawns) reject entry while `dispatching` or `serviceExecuting`
with synthetic lastError 8; successful `publishSyntheticPair` is
permitted only **outside active dispatch**, only on READY kind=1 CPU
contexts, and only with exact current expected PC.

A test-installed **typed W07 MMIO callback** tries `publish`, W03
reset, cancel, spawn and nested tick during the actual guest
`LWZ` stage. Every attempt is rejected; the device's own status5 fault
persists without publishing fake r3/r4 values, moving PC, or
converting MMIO rejection to success.

**Limits:** This is a safe synthetic scheduler quiescence boundary in a
single-threaded W03 native build; it is **not proof of authentic guest
fibers, shared-thread scheduling, interrupt safety, W04 transactionality
of an arbitrary future service or Wii OS/HLE correctness.** W04/W07
callbacks remain untrusted for arbitrary external side effects. No
real OSGetTime handler or HLE import/export has been registered. Future
OSGetTime requires an actual scheduler-owned callsite that obtains the
lease inside the native dispatch authority; the current public
`publishSyntheticPair` deliberately rejects use *during* dispatch,
so the HLE hook cannot simply be plugged into a guest instruction.

## Evidence on marcos-hpr, without emcc

From assigned Peach phase16 worktree:

```bash
env -u LD_LIBRARY_PATH -u LD_PRELOAD node --test \
  tests/phase16/peach/trusted_cpu_native.test.mjs \
  tests/phase16/peach/trusted_cpu_mutation.test.mjs
```

The first Node method builds **real linked C++** from the W03 scheduler
and existing W04/W07 sources using local g++ with
`-std=c++17 -O2 -Wall -Wextra -Werror -pedantic`, then runs
**70 independently labeled assertions** on the native executable.
These 67 checks are NOT 67 Node test methods.

The other 3 Node tests build temporary **RED variants of the actual
W03 source** in isolated `/tmp` directories: removing expected-PC
validation, removing the non-reentrant service gate or removing the
scheduler reset quiescence check causes explicit native adversarial
test failures with exit2. The tracked code is never mutated by these
negative controls. The source with the protections enabled is GREEN.

Existing .wasm from phase15 are **unchanged** and cannot prove this
new C++ gate operates inside browser Wasm. On marcos-hpr no `emcc`,
`dotnet`, external REA 6.5 or applicable Windows REA checkout was
available. Normal Node/browser baseline tests still exercise old
precompiled Wasm and must be presented as **regression**, not
verification of this new native C++ feature. No fake .wasm/JS exports or
mock callbacks were added to the production runtime.

## Agreement with Toad / next gated architecture

The upstream public `OS__GetTime_HLE(CpuContext*)` shape uses
raw unsigned 64-bit ticks: **GPR3 high32, GPR4 low32**, without the
separate `ReadSystemTime` epoch base. Toad's phase15 source-only
`ReferenceClock` supplies an independent synthetic timebase model
and 60,750,000 ticks/sec exact ratio. W03's new pure native register
gate accepts **caller-provided** ticks and intentionally has **no
knowledge of timebase, ownership of monotonic clock, HLE registry,
callbacks or original Wii symbols**. Their integration is a separate
peer-reviewed change and must not expose `CpuContext*` to JS.

Suggested next stage, **only after Mario approval**, is a
scheduler-managed, allowlisted **synthetic** service-instruction
callback, with trusted guest identity, expectedPC, epoch/quiescence,
single-use call authority, Toad clock ownership and atomic return;
negative tests for quota/MMIO/device/clock regression and no retry.
It must not accept a JS-supplied raw context address or a forged
callback claiming native HLE compatibility.

## Hard STOP and review checklist

- Owner's original DOL SHA mismatch remains STOP. Public W01 static
  evidence and Luigi producer model are synthetic; no authentic leaf
  selected or executed.
- Recursive translator MAP coverage and public profile metadata
  are not authenticated equivalent.
- Real Wii HLE/GX/IOS/VI/IRQ, FPR/GQR/64-bit guest instructions,
  native callbacks, memory pointers and game boot are unverified.
- Do not overwrite tracked `dist/*.wasm` with arbitrary builds.
  Rebuild new W03 Wasm reproducibly with authorized Emscripten,
  inspect typed exports/imports with REA 6.5 if available, compare
  native and real Chromium results and obtain peer review before
  any actual browser runtime effect can be asserted.
- Luigi reviews Peach exact published SHA; Peach reviews Toad exact
  published SHA; Mario alone integrates reviewed commits in main.
