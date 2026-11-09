# Phase17 W17-C — Time64 prepare / commit / abort contract

**SOURCE-ONLY, standalone synthetic reference. NOT an OSGetTime HLE,
not a guest Wii timebase device and not the real W03 scheduler.**
Original Nintendo executable bytes, ROM/DOL, copyrighted translated source,
secrets and live guest state are neither loaded nor required.

## Exact pinned public facts
- Public `Wiicompiled` pinned source
  [OS time](https://github.com/patchzyy/Wiicompiled/blob/f02d000ba8e67240a04d95676da89023f781222f/runtime/src/hle/os/os_time.cpp):
  OS__GetTime_HLE returns the raw 64-bit timebase, high32 in r3,
  low32 in r4. The upper/lower/upper hardware polling sequence is not a
  guest RAM low32 value. **ReadSystemTime is different**: guest system
  epoch adjustments are outside this fixture.
- Public [timebase contract](https://github.com/patchzyy/Wiicompiled/blob/f02d000ba8e67240a04d95676da89023f781222f/runtime/include/timebase_contract.h):
  243 MHz/4 = 60,750,000 ticks/sec. `floor(nanos*243/4000)`,
  implemented by bounded uint64 quotient/remainder without floats.
- Source-only predecessor:
  `web-runtime/runtime-services/time64_epoch_service.hpp`,
  `docs/phase16/time/OSGETTIME64_TRUST_BOUNDARY.md`. Peach's independent
  phase16 same-address placement-new ABA test is fixed through monotonic
  process-wide owner incarnations; NO pointer-only trust.

## Typed standalone implementation
`web-runtime/runtime-services/time64_transaction.hpp` declares:
- `TransactionService` owns precisely three **PRIVATE synthetic CPU copies**
  with guest generation, retired generation watermark, revision, timebase,
  lifetime incarnation. No raw CpuContext pointer is returned or exported.
  The service is noncopyable/nonmovable and runs ONLY as a **single-thread,
  non-reentrant native synthetic unit**.
- `prepareTicks(slot,guestGeneration,expectedPc,ticks,operation)`,
  `prepareNanoseconds(...,hostNs,...)`, and `prepareAdvance(...,delta,...)`
  build an opaque move-only `Prepared` with owner incarnation, slot,
  generation, revision, expected PC and candidate ticks. **PREPARE is
  const and never changes guest CPU, clock ledger, revision or guest state.**
  The `Prepared` token internally retains a `const TransactionService*`,
  not a mutable CPU pointer; proposal construction needs NO const_cast.
  All uint64 bounds/monotonicity and unsupported guest memory/MMIO/IRQ are
  denied at prepare time. No implicit wall clock is sampled.
- `abort(Prepared&&)` consumes just that local candidate; it does not
  write the service, CPU or ledger. Reuse/duplicate abort or commit is denied.
- `commit(Prepared&&,Authority&&)` first consumes both one-use tickets,
  verifies owner pointer **and nonreusable incarnation**, slot, generation,
  PC, ledger revision, valid timebase, and synthetic scheduler phase.
  Every possible failure occurs BEFORE writing anything. The local commit
  point is four consecutive **nothrow scalar writes**: CPU r3 high32,
  r4 low32, clock ledger and revision. There is no reentrant callback,
  allocator or device operation between writes, so no injected fault can
  leave one side committed while the other is unchanged **in this
  single-thread, private synthetic model**.
- `open` and `reset` also demand an `Authority`; reset keeps the
  generation watermark, and a new guest must use a strictly larger
  nonzero generation. If lifetime incarnation reaches UINT64_MAX,
  all subsequent services fail closed (never reuse after overflow).
  A stale prepared candidate after reset or two competing candidates
  from the same ledger revision cannot commit.
- `Phase`: `quiescent` is the **synthetic issuer's claim**, not a proof
  of actual W03 dispatcher quiescence. `dispatching`, `reentrant`,
  `deviceFault`, `quotaFault`, `mmio`, `irq`, `resetting`, or
  unknown phase deny before both writes. No caller-supplied `trusted=true`
  flag turns them into genuine scheduler authority.
- `Authority` has a PRIVATE constructor, is move-only/single-use, and
  ONLY a test-only `nsmbw::w03::Time64TransactionIssuer` in native test
  compilation with `-DNSMB_PHASE17_TIME64_SYNTHETIC_TEST` can mint it.
  Normal C++ builds cannot mint even by defining a fake issuer class;
  there is NO production issuer implementation. This compile fence is
  not cryptographic authentication or security against arbitrary malicious
  native code. No JS/WebAssembly export or HLE is registered.

## Required W03 ↔ Time64 joint integration (pending Peach/Mario)
The native W03 scheduler **must** own the actual guest state and
non-reentrant critical section, and must not pass a raw CpuContext*
to JavaScript or an arbitrary callback. The proposed handshake is:

1. W03 verifies *its own* guest ID/slot, unrevoked owner+epoch/generation,
   exact expected PC, READY/allowlisted dispatch phase, no guest callback or
   in-flight interrupt/device mutation, before authorizing service.
2. Time64 makes a read-only proposal with precise ticks, 64-bit hi/lo,
   time-ledger generation+revision, no writes and no host-side activation.
3. Under ONE scheduler-owned synchronous no-throw critical section, W03
   rechecks its epoch/serial/PC and Time64 version. Only if both sides
   preflight successfully may it publish **both** real GPRs AND its
   authoritative clock ledger without any fallible callbacks between.
4. On ANY rejection before the joint commit, both GPRs, PC/LR/SP/FPR/GQR,
   RAM/device state, ledger, epoch and version stay unchanged; abort only
   consumes proposal. On reset/reuse, both token families revoke.
5. Test a real W03-owned callsite and all failure paths independently on
   the **combined reviewed source**. Synthetic local co-commit is NOT
   an implementation or demonstration of this external scheduler contract.

Peach owns `web-runtime/frame-host/**`. Toad does **not** edit Peach's
files, borrow its private Ticket type or install a patch in W03. The two
header contracts must be separately reviewed at exact SHAs before Mario
integrates them. Any acceptance before W03 owns the phase/ledger critical
section would be an unsafe false-green.

## Reproduction
On `marcos-hpr`, branch `agent/toad/phase17-time64-transaction`:
```sh
env -u LD_LIBRARY_PATH -u LD_PRELOAD /usr/bin/node --test tests/phase17/toad/time64_transaction.test.mjs
env -u LD_LIBRARY_PATH -u LD_PRELOAD /usr/bin/node --test tests/phase16/toad/time64_epoch.test.mjs tests/phase15/toad/os_time64_reference.test.mjs
```
Phase17 Node suite compiles native C++ with `g++ -std=c++17 -O2
-Wall -Wextra -Werror -pedantic`; a single Node test covers **90 labeled
native assertions**, plus 512 deterministic complete transactions.
Other Node cases run four **RED** mutant copies of the temporary header:
remove incarnation, remove clock ledger write, permit device fault,
remove candidate revision guard. Each mutant fails; clean source GREEN.
An additional independent 3-translation-unit C++ test constructs owner A
in a fixed aligned buffer in TU A, retains its candidate and scheduler
permit, destroys A, and placement-news owner B in the **same address**
from TU B. Both A permits reject; B's registers and clock remain zero.
It tests cross-TU owner-incarnation identity rather than trusting pointer
addresses or the author's single-file native harness.
1024 additional seeded JS BigInt samples are assertions within ONE test,
not 1024 Node test methods. The compiler rejects fake authority when
the synthetic test flag is not set. The temporary mutants and binaries
are cleaned, never committed.

## Hard STOP / nonclaims
This model cannot prove concurrency safety in a multithread scheduler,
a real W03 trusted issuer, safe tick-dispatch HLE, original Nintendo
execution, actual mftb/mftbu timebase, OS time epoch, IRQ, IOS or GX.
It also cannot authenticate private DOL SHA or upstream C# recursive
producer provenance. No freshly compiled Emscripten Wasm/REA6.5 exists
from this change; old Chromium tests exercise prebuilt synthetic binaries.
**Mario alone can authorize source integration after exact SHA peer QA;
all original Nintendo execution blocks remain.**
