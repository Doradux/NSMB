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

## P19 native and explicit RED/GREEN evidence
The first ABI smoke was deliberately RED before implementing the public
header (compiler refused absent synthetic_service_dispatch.hpp). After
implementation g++17 -O2 -Werror ABI GREEN; the test did not claim W03
authority.

Independent dispatcher_native.cpp now covers 107 labeled C++ checks
including 4096 deterministic three-guest mixed adversarial read-only
operations in ONE named check, not 4096 tests. Each denied Request
returns an all-zero Candidate and has no bytewise change to Request or
GateView. A fully forged request plus GateView CAN compute success,
which is the critical negative proof that public origin and nonce echoes
are NOT permissions.

Native dispatcher_w03_native.cpp links real existing W03 scheduler
frame_loop, guest_cpu, W04 guest_memory, W07 device_policy and the
Phase18 timebase helper. Its 31 named checks include 512 successive
real W03 native synthetic service commits and 1024 guest reset/recycle
cycles. The private native one-use Ticket is REQUIRED before actual
armCanonicalClock: a forged matching GateView always fails with
ClockArm::invalidTicket; stale copies, wrong epoch/revision/high32
fail without any GPR/PC/clock mutation. With test-only
NSMB_PHASE18_CLOCK_TEST, full copied GPR/FPR/GQR/LR/PC/trace and clock
are checked for unchanged data during failures. This is a REAL
native W03 service transaction, NOT an exposed host C/JS dispatcher
or new WebAssembly guest W03 service path.

New Node wrapper runs C++ both with and without ASan+UBSan, checks
actual labeled test counts and runs ELEVEN deliberately corrupted
source-site variants of Toad and W03 in /tmp only, each RED while
unmodified source GREEN. W03 mutations use exact cached source
and are NOT committed to Peach's worktree.

## Thread purity and diagnostic benchmark
The stateless dispatcher can be called concurrently as a *numeric*
function: 8 native pthread workers x4096 deterministic inputs =32768
pure computations, sharing ONE const GateView, checked against an
independent serial integer quotient/remainder oracle. This does NOT
prove W03 scheduler thread-safety, nor does it mean the actual 32K
operations are separate Node test methods.
A local single-run g++ -O2 timing of 2,000,000 pure prepare calls on
marcos-hpr: elapsed_host_ns=9354479, checksum=76963717532.
It is a diagnostic elapsed measurement, not a performance guarantee,
game tick timing or benchmark of original Nintendo execution.
Native compiler and test driver under tests/phase19/toad.

## ABI byte layout, GCC + WebAssembly compiler
A separate strict C++17 layout fixture confirms both marcos-hpr GCC
and the cached Emscripten 6.0.13 frontend agree under -Werror,
-Wconversion and -Wsign-conversion:
Request sizeof48 align8 value offset40; GateView sizeof56 align8;
Candidate sizeof56 align8 ticks offset40, high32 offset48,
low32 offset52; Result sizeof64 align8. All enums underlying sizes are
explicit UINT32 or UINT8. The tested layout is SYNTHETIC host/Wasm
ABI only, not PPC/Wii original ABI. Pointers are forbidden; boolean
values in GateView remain internally interpreted C++ only and are not
copied across JS as trusted bytes. Such layout agreement does not
imply W03 private Ticket export or real Wii service compatibility.

## Latest reinforced native source mutations
Two additional RED controls prove W03 native must update the one
clockTicks ledger and increment exactly one clockRevision in the SAME
callback-free synthetic scheduler commit; removing either operation
from an isolated source copy makes the 31-check real W03 test fail.
Further RED controls remove dispatcher enabled/busy safeguards and the
native tests reject compromised behavior as expected.
These tests do not mutate a peer Git tree and cannot prove genuine Wii
HLE, author DOL authenticity, C# producer lineage or new browser W03.
