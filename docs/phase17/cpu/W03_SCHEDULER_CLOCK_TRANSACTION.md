# Phase17 W17-B — scheduler-owned synthetic CPU clock event

**Scope:** copyright-free native C++ tests against the ACTUAL W03/W04/W07
scheduler, not New Super Mario Bros. Wii, an authentic Wii CPU service, or
a linked native `OSGetTime` HLE. Parent for Peach Phase17:
`fe5a34f74afe1f12880fc8eee999fe8e0c9c7d02`.

## Two phases and exact authority

**Before dispatch, trusted in-process C++ only:**

1. W03's existing `nsmbw::trusted_cpu::leaseSynthetic(guest)` mints a
   single-use private `Ticket`, bound to guest ID, W03's generation-like
   `serviceOwner`, global `serviceEpoch`, and lease serial.
2. New native C++ `armSyntheticClock(ticket,expectedPc,preparedTicks)`
   retires the ticket and all copies on *every attempted authorization*.
   It accepts only a READY `kind=1` copyright-free synthetic guest, with
   `expectedPc == SyntheticCpu::Entry`, exact actual PC, no pending event,
   quiescent W03 scheduler, and a time candidate monotonic relative to
   W03's **local** per-context synthetic ledger. A denied arm does not touch
   GPR3/GPR4, PC/LR/SP, FPR/GQR, checked RAM/pages or the clock ledger.
3. An accepted arm records one pending event with guest, epoch, owner,
   expected PC and candidate. **PREPARE DOES NOT WRITE CPU OR CLOCK.**
   W03 refuses issuing a new lease while one event is pending.

**Inside the actual `nsmbw_loop_tick()` scheduler dispatch only:**

4. The selected context's pending event is consumed exactly once, with
   revalidation of guest kind, epoch, owner, expected PC and monotonicity.
   On any stale/PC/regression failure, event is discarded, a non-success
   `ClockOutcome` is stored, and guest registers/clock/RAM remain unchanged.
5. The success branch has NO host callback, checked memory access,
   allocation, interrupt, native HLE, or fallible external operation.
   W03 synchronously writes high32 of candidate to **GPR3**, low32 to
   **GPR4**, and then updates its **own** per-guest local 64-bit ledger.
   All three writes happen in one native non-reentrant callstack; no
   guest-visible intermediate state or callback is exposed.
6. This is a **separate synthetic scheduler event**, NOT an original PowerPC
   opcode. It does not advance the guest PC, LR, SP or PowerPC instruction
   count. A later tick may execute the ordinary existing synthetic opcode
   at the same PC. Do not describe it as a working original OSGetTime.

**Cancellation and reset:** suspend/cancel drops pending events (ledger
and GPR unchanged), reap/reset clears the entire guest context, global epoch
prevents stale tickets controlling recycled IDs. During an actual W07 MMIO
callback or nested tick, arm/lease, reset/spawn/cancel and other W03
lifecycle calls fail closed. Hostile callbacks cannot arm another READY
guest; a copied private ticket is invalidated even if the callback's attempt
was rejected.

The native `scheduler_clock.hpp` interface has **no** `extern "C"`,
`EMSCRIPTEN_KEEPALIVE`, raw `CpuContext*`, JS factory, or host pointer
export. Its `ClockSnapshot` is a by-value diagnostic for trusted native C++
only. Ticket privacy is not cryptography and does NOT protect against an
arbitrary malicious module already linked into the trusted C++ address space.

## Agreement required from Toad — two distinct ledgers

Toad owns `web-runtime/runtime-services/**` and the independent Phase17
Time64 `prepare/commit/abort` API. This implementation intentionally writes
only W03's **local ledger**, not the Toad ledger. Calling Toad `commit` after
the W03 success would be unsafe if that commit could fail: CPU GPRs would
show a new time but Toad's ledger would remain old. Calling Toad first has
the reverse failure risk. **DO NOT WIRE THOSE TWO FALLIBLE OPERATIONS IN
SEQUENCE.**

The future bridge must have exactly one scheduler-owned, non-reentrant
commit region with BOTH sets of validation complete before either write,
and no allocation/failure/device callback inside. The Toad prepared
candidate must carry authenticated guest ID, Time64 instance incarnation,
generation, expected PC and an opaque single-use right from the
scheduler; reset/ABA must invalidate it. Toad's review must approve a
genuinely no-fail/finalize commit or a shared transactional owner for both.
A JS-supplied `trusted=true` flag, public guessed address, synthetic fake
permit, or raw `CpuContext*` is not an authority source.

Native contracts sent early through `coord.js message Peach Toad`;
integration will be separately validated on SHA-pinned reviewed Toad
source, never by modifying Toad's worktree.

## Reproduction

From `/home/marcos/NSMBcowork/worktrees/peach-Phase17`:

```bash
env -u LD_LIBRARY_PATH -u LD_PRELOAD node --test \
  tests/phase17/peach/scheduler_clock_native.test.mjs \
  tests/phase17/peach/scheduler_clock_mutation.test.mjs
```

One Node test compiles real W03/W04/W07 sources using g++17 `-O2 -Wall
-Wextra -Werror -pedantic` and runs labeled native scenarios, including
128 real reset/recycle iterations as ONE stress check. The seven Node
RED mutants compile independently mutated ephemeral W03 source in `/tmp`
and must cause their explicit native oracle to exit 2. Mutants include
missing non-allowlisted PC guard, monotonic regression, copied ticket
retirement, dispatch busy gate, one half of the GPR pair, the local clock
ledger write, and suspend cancellation.

Expected invariants: GPR3/GPR4 and W03 local ledger update together on a
valid scheduler tick; rejected/cancelled operations retain CPU/ledger,
checked W04 RAM and page count, PC/LR/SP, without invoking W07 devices.
A rejected MMIO operation remains a non-retryable genuine guest fault, not
a fake successful service. The test suite MUST NOT count native assertions
and seeded loop iterations as additional Node test methods.

## Unverified gates

- The current `dist/frame_loop.wasm` is precompiled from earlier phases.
  It does **not** contain or prove this Phase17 C++ implementation unless
  a new Emscripten build is produced, SHA-pinned, and tested in Node AND
  real Chromium with an explicit export/import ABI audit.
- `emcc`/`em++`, `.NET` and REA6.5 may not be available on
  `marcos-hpr`. A tool missing from PATH is `BLOCKED-ENV` for this
  environment, not universal impossibility. No `sudo` without approval.
- Authenticated original DOL SHA remains mismatched, producer C# recursion
  is not attested, no original Wii guest leaf/IOS/IRQ/GX has run, and no
  legitimate original OSGetTime native HLE is registered.
- The W03 local synthetic clock is **not** an authenticated monotonic host
  time source, and resetting a W03 guest resets its local ledger. Time64
  historical/physical semantics and epoch ownership remain with Toad.
- Only Mario merges to main after independent exact-SHA peer review.
