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
