# W18-C — raw Time64 candidate, ZERO additional production ledgers

**Source-only synthetic infrastructure, 2026-11-09. No Nintendo game
code, original Wii OSGetTime HLE, original DOL/ROM/REL, external producer
attestation or newly built Wasm is involved.**

## Pinned public semantics and exact types

Wiicompiled public clock source pinned at
f02d000ba8e67240a04d95676da89023f781222f:
runtime/src/hle/os/os_time.cpp models raw OS__GetTime as a 64-bit
timebase returned in GPR3 upper32, GPR4 lower32.
runtime/include/timebase_contract.h encodes 243 MHz / 4 =
**60,750,000 ticks per second**, equivalently exact
floor(nanoseconds * 243 / 4000). This is NOT ReadSystemTime,
calendar adjustment, wall-clock synchronization, IOS IRQ/RTC or a proven
Nintendo-original hardware timebase.

Primary shared header:
web-runtime/runtime-services/time64_pure_candidate.hpp.
Agreed W03-facing interface namespace nsmbw::w18:

- Candidate { uint64_t ticks; uint32_t high32() const noexcept; uint32_t low32() const noexcept; }
- Error : uint8_t { ok, overflow, regression, invalid }
- Result { Error error; Candidate candidate; bool ok() const noexcept; }
- Pure constexpr/noexcept makeTicks(uint64_t), fromNanoseconds(uint64_t),
  addTicks(uint64_t base,uint64_t delta), signedNanos(int64_t),
  requireMonotonic(Candidate,uint64_t lastCommittedTicks).

No implicit 64-bit wrap and no floating point or silent saturation.
Unsigned max ns -> exact integer quotient/remainder, max ticks and carry
checked. Negative signed input rejects incl INT64_MIN. addTicks rejects
overflow by subtraction BEFORE addition. These values are pure,
not a lease. Only W03 independent private native ticket/phase/guest/epoch
checks can authorize a live guest service.

Additional optional purely functional envelope:
web-runtime/runtime-services/time64_pure_clock.hpp, namespace
nsmbw::time64_pure. Reference { lastHostNanos, lastCommittedTicks,
sourceEpoch, sourceRevision, initialized }, ClockCandidate { rawTicks,
high32, low32, sourceEpoch, sourceRevision }, Result { Error, candidate };
prepareFromTicks, prepareFromNanos, prepareFromSignedNanos, checkedAddTicks,
checkedSignedDelta, validateForCommit, preflightReference.
It delegates numeric conversion and checked add to nsmbw::w18.
It echoes observed W03 revision/epoch for stale detection; it NEVER proves
they belong to a live guest. W03 MUST revalidate its actual current
private Ticket, guest ID/owner/epoch/PC/phase and ledger version under
its own nonreentrant dispatch. SourceEpoch/Revision are NOT credentials.
No instance address, mutable state, guest ID, callbacks or ledger exist
in either header.

## Two-phase boundary — one native writer

A native W03 caller snapshots its actual guest owner, epoch, serial, PC,
clockRevision, clockTicks, policy and phase. Pure Time64 computes a
candidate without writing anything. Before accepting an event W03 checks
its own private lease, guest ID/generation, epoch, serial, READY,
allowlisted expected PC, exact revision and hi32/lo32 consistency.
W07 callbacks and untrusted JS requests cannot issue a lease. A pending
event contains a frozen candidate and version metadata only.

During actual W03 scheduler callback-free dispatch recheck all epochs,
owner/serial, PC, phase and revision. Only after ALL fallible conditions
pass perform ONE group of no-throw scalar writes, inside one
scheduler-owned nonreentrant region, to GPR3 upper, GPR4 lower,
the SINGLE canonical W03 clock ledger and revision. No allocator,
device/MMIO, guest RAM or fallible callbacks between writes.

Absolutely NO call to the Phase17 TransactionService.commit follows
the W03 write, or precedes it. Its separate CPU copy and ledger are
test oracles only. Two sequential fallible commits can tear state.
Pure validateForCommit is NOT an authority grant.

## Failure injection matrix

| Input or scheduler condition | Pure check | W03 native expected |
| --- | --- | --- |
| UINT64_MAX tick +1 | overflow no candidate | no state write |
| Float near UINT64_MAX ns | integer oracle detects | reject wrong implementation |
| 2^32 carry, 2^64-1 ticks | exact hi32/lo32 | atomic pair+ledger |
| Negative signed ns/delta | invalid / regression | no commit |
| Decreasing host ns | regressiveHost | no time rollback |
| Lower ticks than ledger | regressiveTicks | no GPR rollback |
| Wrong epoch/version reference | staleEpoch/Revision | W03 revoke independently |
| Host-invented valid candidate | numerically valid, NOT authority | private lease required |
| Corrupted hi32/lo32 | malformed | reject before either GPR |
| Stale or duplicated W03 Ticket | not pure concern | consume and deny at W03 |
| Cancel/reap/reset between phases | reference stale | never commit |
| Cross-guest proposal same ticks | valid arithmetic | deny wrong guest |
| W07 IRQ/MMIO or callback reentry | no device API | W03 deny |
| Invalid PC/phase/pending event | cannot judge guest | W03 gate |
| Revision UINT64_MAX | overflow fail closed | deny version wrap |
| Native service ABA same address | pure no owner/pointer | W03 serial+epoch guard |
| Concurrent threads | pure has no mutable state | W03 explicit synchronization |

## Tests and limits

Native C++ g++17 -O2 -Wall -Wextra -Werror -pedantic checks
arithmetical boundary conditions, reference revision/epoch,
unauthenticated malformed candidate denial, guest isolation and
synthetic three-guest single-ledger mock. A 2048-step seeded fuzz loop
counts as ONE labeled native check, not 2048 Node methods.
Node uses an independently expressed BigInt quotient/remainder oracle
for 2048 cases, and six deliberate RED mutation controls:
overflow bypass, floating point, wrong high32, tick regression
bypass, stale revision bypass and stale epoch bypass.
Compiler or runtime mutant RED is required; originals must be GREEN.
ASan and UBSan run separately. A guest mock is NOT proof of W03 actual
native scheduler behavior: integration requires source-pinned Peach
Phase18 real frame_loop.cpp with W04/W07 linkage.

The approved Phase17 legacy TransactionService and tests remain
untouched, as do main, all Phase17 branches and Peach frame-host code.
The Phase18 parent is provisional Mario Phase17 preview c12e8b0 and
cannot be described as an integrated main release.
Toolchain emcc/em++, dotnet and REA6.5 unavailable on host PATH;
no unauthorized installations or sudo. Private DOL identity mismatch,
actual C# producer provenance, original Wii timebase/IOS/GX/IRQ and
game boot remain STOP. Only Mario integrates after exact peer reviews.

## Exact pinned real native W03 cross-module experiment (independent)

At first W03 Phase18 peer SHA
e8a3e8ba5dfbb7a32d205f669b130e9076f60e55 on Peach's branch,
Toad copied ONLY Git-tracked public/synthetic web-runtime source into a
disposable /tmp archive via git archive, without touching Peach worktree.
The test source tests/phase18/toad/w03_pure_integration_native.cpp
links that pinned REAL W03 frame_loop.cpp/guest_cpu/W04/W07 to our PURE
time64_pure_clock.hpp. NO Phase17 TransactionService instantiated
or committed; W03 armCanonicalClock consumes PRIVATE Ticket and only
W03 publishes GPR3/GPR4, clockTicks and clockRevision in its scheduler.

Positive pinned C++ -O2 -Werror native E2E: 27/27 labeled checks, includes
512 consecutive real W03 commits from pure floor-nanosecond candidates,
256 W03 reset/recycle cycles, duplicate ticket and stale epoch/revision,
malformed pair, arithmetic overflow, independent second guest state,
no guest opcode/checked RAM and zero extra ledger commits.
Node integration at NSMB_PHASE18_PEACH_SNAPSHOT=/tmp/archived/web-runtime
runs 7 methods: positive (nested 27 C++ named checks), native ASan/UBSan
and FIVE deliberately broken native W03 frame_loop.cpp mutants: bypass
epoch/version/pair validation, skip canonical ledger write or increment.
Each mutant compiles but fails its corresponding independent native
assertion. Exact SHA is validated separately with git rev-parse and origin.

Run reproducibly (from Toad Phase18 worktree), use NEW disposable temp dir:

  tmp=$(mktemp -d /tmp/toad18-w03-qa-XXXXXX)
  git -C /home/marcos/NSMB archive e8a3e8ba5dfbb7a32d205f669b130e9076f60e55 web-runtime/frame-host web-runtime/src web-runtime/interop web-runtime/runtime-services | tar -xf - -C "$tmp"
  env -u LD_LIBRARY_PATH -u LD_PRELOAD NSMB_PHASE18_PEACH_SNAPSHOT="$tmp/web-runtime" /usr/bin/node --test tests/phase18/toad/w03_pure_integration.test.mjs
  rm -rf "$tmp"    # only once confirmed it is a new /tmp archive

This 7-method file intentionally SKIPS source-pinned integration unless
NSMB_PHASE18_PEACH_SNAPSHOT explicitly points to a reviewed W03 tree.
Never treat a skip as proof of compatibility. On combined source after
Mario's authorized merge, supply the actual source root and re-run.

This is a synthetic REAL-native scheduler execution against pinned code,
not a new Emscripten/Chrome build, original game, or release HLE. Peach may
publish a later SHA; exact-final fresh review and re-run are mandatory.
