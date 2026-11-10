# TOAD PHASE19 — PURE synthetic service dispatcher ABI v1

HEADER: web-runtime/runtime-services/synthetic_service_dispatch.hpp
NAMESPACE: nsmbw::p19::services.
This is an invented-source-only PURE C++17 candidate, NOT Nintendo HLE.
NO JS import or export, no extern C, no CpuContext pointer, no mutable
ledger, no scheduler Ticket or issuer, no callback, MMIO, memory or output.

## Allowlist
- UINT32 version 1, synthetic PC 0x80010000.
- ServiceId rawClockFromNanoseconds 0x53560001; rawClockFromTicks
  0x53560002. All other values rejected.
- Request: version,id,slot,expectedPc,epoch,revision,serial,value.
- GateView: slot,pc,epoch,revision,serial,lastCommittedTicks,
  remainingBudget,origin,phase,enabled,guestReady,dispatchBusy,
  clockCommitted. These fields are ALL PUBLIC/FORGEABLE INPUTS.
- Result: Status and typed Candidate with exact UINT64 ticks/high32/
  low32, sourceEpoch/sourceRevision/sourceSerial echoed.
- Status: candidateOnly, unsupported, badVersion, invalidSlot, wrongPc,
  wrongEpoch, staleRevision, forbiddenOrigin, dispatchBusy,
  quotaExhausted, disabled, overflow, clockRegression, invalidPhase,
  staleSerial, revisionExhausted.
- No trusted bool: Origin::nativeScheduler is also FABRICABLE!
  Status::candidateOnly means arithmetic computed, NOT AUTHORIZED.
- Header is constexpr, noexcept, trivially copyable and
  standard-layout, no global state, no dynamic allocation.
- Exact RAW timebase floor(ns*243/4000) = 60,750,000 ticks/sec,
  using Phase18 pure safe integer converter. Raw ticks are NOT calendar
  ReadSystemTime/RTC epoch or Nintendo original HLE.

## REQUIRED W03 bridge — only Peach may implement
1. W03 snapshots its TRUE private scheduler guest slot/owner/generation,
   epoch, serial, expected PC, phase, revision, clockTicks and authoritative
   service quota. No JS caller may issue or send a Ticket to W03.
2. From that snapshot construct Request and GateView, invoke pure
   prepare(Request,GateView). It rejects unsupported/mismatched/disabled/
   busy/zero-quota/wrongPc/wrongEpoch/revision/serial/overflow/regression
   with Result.error and ZERO candidate. Check consistent(Candidate).
3. Status::candidateOnly is NOT authority and the echoed serial/epoch
   and origin are NOT proof. W03 rechecks native private owner, serial,
   token, phase and ACTUAL remaining quota, consumes budget in its OWN
   ledger and creates/consumes PRIVATE one-time Ticket. Never use a
   host-provided quota or allowlist flag as proof.
4. Only the native private Ticket may pass to armCanonicalClock with
   Candidate ticks, high32/low32 and W03-known sourceEpoch/revision.
   Arm does not write CPU. It denies copied/replayed ticket, guest
   recycle, bad PC/epoch/revision/clock regression and pending duplicates.
5. W03 internal scheduler tick alone performs no-throw, callback-free
   single commit of r3 upper, r4 lower, clockTicks and clockRevision.
   NEVER chain the Phase17 TransactionService second ledger.
6. W03 own diagnostic outcome is authoritative (for the synthetic
   service only); a Result from Toad is never a completion receipt.

## Threats, protections and limitations
Unknown service ID, wrong ABI, unknown slot/overflow slot, stale epoch,
revision or serial, wrong PC, guest lifecycle/reset/ABA, quota depleted,
W07 callback/MMIO/IRQ origin, reentrancy, malformed 32-bit halves,
numeric overflow, monotonic clock regression, and forged same-looking
GateView must never write GPR/PC/LR/FPR/GQR/RAM or clock on failure.
A public view can always be forged to return candidateOnly, so W03's
native capability gate (outside this helper) must deny it.
W03 actual thread synchronization is NOT proven by a pure thread test.
Native ABI sizes/offsets here are compiler-layout only, not Nintendo ABI.
No original game, Wii services, C# attestation, IOS/GX/VI/IRQ or boot.

Peach owns frame-host; Toad will test against exact immutable Peach
snapshot with REAL native private W03 Ticket but will NOT edit Peach
source. A new WebAssembly of this helper only proves code generation;
a functional new scheduler-owned Wasm in Node and Chromium needs Peach
to publish its own bridge with hash-pinned output, not old dist/loader.
