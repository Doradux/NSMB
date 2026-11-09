# Phase18 Peach — W03 is the ONE canonical synthetic clock owner

**Base:** Mario's provisional Phase17 preview `c12e8b090509f5e2e2da65b5ea5000beb7ebcc95`. This is NOT currently `main` and must not be merged or rebased without Mario. No Nintendo original code or real Wii HLE execution.

## Ownership / authority table

| Action | Authoritative owner | Phase | Mutation allowed |
| --- | --- | --- | --- |
| Compute ticks or ns→ticks (60,750,000/s) | Toad **pure** Time64 `nsmbw::w18` arithmetic | Any trusted C++ caller | None: immutable value returned |
| Issue guest capability | W03 `leaseSynthetic(guest)` | READY, outside dispatch | W03 private outstanding ticket serial only |
| Prepare canonical candidate | W03 `armCanonicalClock(ticket,expectedPc,plan)` | READY, quiescent, private ticket | W03 pending request only; NO GPR or clock writes |
| Retire/abort on pause/cancel/reset/reap | W03 lifecycle | W03 scheduler-controlled | Pending invalidated; committed CPU/ledger unchanged |
| Validate before commit | W03 `nsmbw_loop_tick()` | W03 actual `DispatchScope`, no W07 callback | Validates epoch/owner/PC/revision/monotonicity before first write |
| Commit GPR3/GPR4/ticks/revision | **W03 only**, single in-process no-fail block | Inside W03 scheduler only | One logical atomic operation; no allocation/checked RAM/W07 between writes |
| Observe clock | Native C++ `inspectSyntheticClock` | Read-only | Returns a **copy**, never `CpuContext*` |
| Original OSGetTime HLE / JS raw pointer | **No one** | Unsupported | Deny; no real Wii function claimed |

## Context lifecycle and versioned invariants

W03 owns its existing eight synthetic task slots (kind1 CPU only for clock), global `serviceEpoch` and strictly increasing 64-bit `serviceOwner`/one-use ticket serial, W03 actual CPU PC, `clockTicks`, and **new `clockRevision`**. Guest creation clears revision=0. W03 reset increments serviceEpoch and cannot revive old tickets; reap removes guest and owner. A queued event records expected owner/epoch/PC/revision. On resume after pause, a previously pending event is not replayed.

Candidate source epoch and revision are *read-only echoes* to detect stale input. **They are NOT credentials.** Without a valid private native `Ticket`, even correct numeric candidate data cannot arm anything. A copied ticket is retired on the first attempt (valid or denied), including during hostile W07 callbacks. There is no `trusted=true` bypass.

`CanonicalClockPlan` is a POD wire-compatible numeric description with `rawTicks`, `high32`, `low32`, `sourceEpoch` and `sourceRevision`. W03 verifies the split against the raw 64-bit candidate; malformed source halves fail *before* any CPU or ledger change. Accepted rawTicks are monotonic relative to W03's own previous clockTicks, with equality permitted. Revision must equal W03's current revision on arm and at commit. Revision reaching UINT64_MAX fails CLOSED, never wraps to 0; no host input can force it to wrap in a normal build.

`armSyntheticClock` from Phase17 remains a native-only backwards-compatible wrapper: it prepares a numeric value using W03's **same canonical ledger** and same internal authorization. It does NOT maintain another ledger. This preserves previous suite behavior while the new typed API requires explicit candidate revision+epoch.

On success the internal W03 dispatch block writes high32 to `CpuContext.gpr[3]`, low32 to `gpr[4]`, `Context.clockTicks` and increments `clockRevision` **without a single fallible callback between them**. The scheduler may append its normal synthetic trace afterward. On rejected arming, PC/LR/SP/GPRs/FPRs/GQRs/checked guest RAM/pages/trace/ticks/revision remain untouched; the ticket is intentionally consumed. On an already pending event invalidated at dispatch, pending/lastOutcome/cursor are scheduler metadata that necessarily change when W03 consumes the request, but CPU/clock/RAM must not change.

## Toad input integration gate

Toad Phase18 pure header `web-runtime/runtime-services/time64_pure_candidate.hpp` (early exact SHA `803683b497e6c2ea79fc2ef340a89b7192eea612`) defines `nsmbw::w18::Candidate{ticks,high32(),low32()}`, pure integer arithmetic `makeTicks`, `fromNanoseconds`, `addTicks`, `signedNanos`, `requireMonotonic`; it has **NO** ledger, CPU, JS trust, callback or mutable storage. W03's adapter must use `Candidate.ticks`+split and W03-owned snapshot revision/epoch, never invoke Time64 Phase17 `TransactionService.commit` or update a second CPU copy.

The two sources start on separate Phase18 branches. Cross-branch E2E must use SHA-pinned temporary Git archive from Toad, not modify either peer's worktree or cherry-pick into main. If Toad changes contract/signature, re-run exact-SHA cross-suite and request new peer review.

## Negative test matrix (native actual W03/W04/W07)

- Default, forged, duplicate, copied, stale, revoked, cancel/reaped/ID-recycled tickets: deny.
- Wrong epoch/version/expected PC, unsupported service PC, malformed high/low, monotonic regression, UINT64 limit/revision wrap: deny; no partial CPU/clock writes.
- A live guest with a queued valid service cannot create a second outstanding ticket while pending; upon tick only that guest can commit.
- Multi-guest round-robin: own clock and GPR pair independent; no foreign W07 MMIO callback can publish for another READY guest. Nested W03 tick/reset/cancel/spawn denied.
- W04 quota fault or denied W07 device remains a genuine guest fault; no fabricated OSGetTime success or guest memory writes. Clock register-only service itself need not allocate a page.
- Deterministic 1024 guest ID/epoch recycling and revision competition; without trusted C++ ticket, no JS or guest-provided pointer can arm.
- Phase17 intentional source mutants must continue triggering their RED oracles; new Phase18 mutants must prove missing revision/epoch/pair/ledger write are caught.

## What has NOT been proven

A synchronous, single-threaded native W03 block is transactionally non-reentrant only under W03's current execution model. Real multithreading, Wii interrupts, original HLE dispatch, GX/IOS/VI, real game execution, authenticated original DOL checksum, actual C# producer instrumentation and fresh Emscripten/recompiled Phase18 Wasm remain separate STOPs.

The existing `dist/frame_loop.wasm` cannot contain these new W03 sources; a precompiled Chromium PASS is background regression, never a claim of Phase18 Wasm or Wii execution. The optional builder must be run only with authorized, pinned em++/REA and external clean output, and a fresh browser test must load the **exact** newly hashed product before declaring Wasm functionality.

## Phase18 H5–H8 evidence: pure Time64 source and complete-state RED tests

The optional header-only `web-runtime/frame-host/time64_clock_bridge.hpp`
provides **two** native adapters only if their matching Toad headers are
actually present in the C++ compile's include search paths:

- `armPureTime64Clock(Ticket&, pc, nsmbw::w18::Candidate, sourceEpoch, sourceRevision)` maps the minimal numeric `ticks/high32()/low32()` candidate.
- `armCheckedTime64Clock(Ticket&, pc, nsmbw::time64_pure::ClockCandidate)` maps the richer pure `rawTicks/high32/low32/sourceEpoch/sourceRevision` candidate.

Both call **the exact same** `armCanonicalClock` admission and existing
W03 scheduler dispatch. They do not call `TransactionService.open/commit`,
never update any second ledger or private CPU copy, and make no C/JS export.
An absent peer header causes **no adapter to be available at compile-time**;
there is NO fabricated-fallback candidate. The candidate itself is plain
forgeable data, never a ticket: W03's private Ticket/epoch/owner/serial is
still required. A failed Toad numeric calculation must be checked via
`Result.ok()` before requesting a W03 lease; W03 independently checks
source version and arithmetic split even when a caller misbehaves.

`tests/phase18/peach/pure_time64_w03_e2e.test.mjs` extracts the EXACT Toad
headers from a pinned public commit into a temporary read-only overlay,
then compiles both their numeric code and the ACTUAL current W03/W04/W07
sources with g++ `-Werror` and runs the real synthetic CPU service through
W03 tick. The test checks exact 60.75MHz integer conversion, signed and
uint64 overflow, r3/r4 32-bit carry, no intermediate guest RAM/clock writes,
W03 canonical revision and clock changes together, and denial of both
stale reference versions and malformed high/low fields. **It does not
modify or cherry-pick Toad's worktree**; pin gets updated to reviewed exact
SHA when Toad final changes. The early source pin was
`803683b497e6c2ea79fc2ef340a89b7192eea612`, then the richer two-header
pin `a6e7343c722648b2b705e7d887dbac9d934d2e7b`.

`tests/phase18/peach/canonical_clock_adversarial.cpp` compiles real W03
with `-DNSMB_PHASE18_CLOCK_TEST` to access **test-only** by-value
`ClockNativeTestSnapshot` (full actual `CpuContext` including all
GPR/FPR/GQR, PC/LR/SP, trace ring, clockTicks+revision and guest status).
It compares COMPLETE state before and after denied arms, seeds real W04
checked RAM, injects a stale version or PC into a pending service to prove
revalidation inside the real scheduler, exercises UINT64_MAX ticks and a
revision overflow, and runs **4096 deterministic dual-guest action cases**
with a fixed LCG seed `0x0BADC0DE`. It closes by injecting a test-only
service-serial exhaustion and proving fail-closed. These helpers are inside
`#ifdef NSMB_PHASE18_CLOCK_TEST`, and production `nm` checks verify they
are absent without that macro; no test debug CPU pointer is exposed to JS.

`tests/phase18/peach/canonical_clock_mutation.test.mjs` uses eight
source-only throwaway compile mutants under `/tmp` and proves the live
native test detects deletion of (1) source epoch, (2) canonical revision,
(3) high/low pair validation, (4) revision increment at COMMIT,
(5) in-tick revision validation, (6) in-tick PC validation,
(7) revision overflow latch, and (8) copied Ticket retirement.
Every mutated binary MUST compile under `-Werror` and fail a specifically
identified oracle with exit2; the healthy source passes. These 8 controls
are Node **methods**, not eight successes in the mutated C++ executables.

`tests/phase18/peach/canonical_clock_native_abi.test.mjs` ensures the
normal C++ build exports only mangled native methods, not a C/JS issuer,
raw CpuContext pointer or test-only corruption hooks. It verifies a forged
private `Ticket` does NOT compile. The optional-Toda-source test is
compatibility-aware: no header in a standalone Peach worktree means
**compile-time denial**, but once Mario merges the reviewed Toad source,
the actual header must allow compilation; never a stub claiming success.

All tests are purely synthetic native source tests, not generated Nintendo
code. The old precompiled Wasm and an old Chrome PASS do not prove any
Phase18 code was compiled or executed in a browser. The preview base itself
remains NOT main until Mario's integration.
