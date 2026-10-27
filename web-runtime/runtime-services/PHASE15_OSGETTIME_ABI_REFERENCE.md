# W15-C — source-grounded synthetic OSGetTime r3/r4 reference

**Status: source-only reference model; NO registered Wii HLE, NO linked W03 guest
call, NO authentic Nintendo code or game execution.** All material in this
directory is authored independently from PUBLIC ABI contracts.

## Pinned public evidence (read-only)

- [Wiicompiled `runtime/src/hle/os/os_time.cpp` pinned upstream snapshot](https://github.com/patchzyy/Wiicompiled/blob/f02d000ba8e67240a04d95676da89023f781222f/runtime/src/hle/os/os_time.cpp)
  (blob `a89e4a4a65f344435a99b27e3fa2efc27f11d046`):
  `OS__GetTime_HLE(CpuContext*)` reads the raw timebase using an
  upper/lower/upper retry and writes `ctx->gpr[3] = hi;`,
  `ctx->gpr[4] = lo;` (hi/lo; unsigned).
  The **different** `OsHleInternal::ReadSystemTime` reads a base from
  guest memory and **adds** the 64-bit raw timebase. The native
  OS____GetSystemTime routine also affects interrupt state: NOT simulated.
- [`runtime/include/timebase_contract.h` pinned upstream snapshot](https://github.com/patchzyy/Wiicompiled/blob/f02d000ba8e67240a04d95676da89023f781222f/runtime/include/timebase_contract.h)
  (blob `5cf37e52b95ddf0e390897b8ac9a2b6988b5b4dd`):
  243 MHz bus / 4 = 60,750,000 timebase ticks/s, EXACT conversion
  `floor(nanoseconds*243/4000)` with quotient+remainder to avoid
  overflow. This is not a `double` calculation and not a wall clock.
- Our public `web-runtime/frame-host/guest_cpu.hpp` defines the **464-byte,
  8-byte aligned** W03 `CpuContext` with `uint32_t gpr[32]`. Translated
  functions use `extern "C" void fn(CpuContext*)`. The isolated native
  reference header includes that public type but does NOT get to access
  W03's private scheduling slots or mutable guest pointers.

## Runtime contract demonstrated only by our SOURCE-ONLY native fixture

`os_time64_reference.hpp` is a model with three internally owned
`CpuContext` objects and per-guest monotonic `uint64_t` ledgers.
`publish(slot,ticks)` atomically updates **only** two 32-bit GPRs
(`r3=ticks>>32`, `r4=ticks&0xffffffff`) and the ledger on success;
never writes into guest RAM. A whole-context bytewise snapshot and
ledger comparison checks no mutations on failure. This deliberately
**does not** register `OS__GetTime_HLE` in native dispatch, does not link
into the existing `joined_tick.wasm`, and cannot be reached from browser
game execution.

`synthetic_time64_host.mjs` is an *independent JS BigInt arithmetic
oracle* (not a service or a Wasm export). It rejects numeric/float
coercion, host regression and uint64 overflow; exposes no fake guest
reset, memory, IRQ, MMIO or native handler. It uses caller-supplied
virtual ticks only, never Date/performance time.

## Fail-closed matrix / limitations

| Case | In native reference | Authentic Wii implementation gate |
| --- | --- | --- |
| 64-bit low32 wrap, high32, uint64 max | tested | trusted W03 `CpuContext*` slot binding required |
| Host time regression | rejected before CPU change | upstream timebase may legitimately wrap after 2^64; no policy chosen for real Wii |
| Overflow + BigInt precision | rejected / exact integers | real time source, clocks and epochs unverified |
| Three per-guest slots, independent ledgers | modeled | W03 scheduler/guest ownership not connected |
| Reset | only on caller's **test-supplied** `verifiedQuiescent=true` | **STOP:** must bind to actual W03 reset state + no pending guest work; JS oracle has NO reset method |
| Guest memory quota / physical pages | `guestMemory` operation always rejects before GPR/RAM changes | **STOP:** no genuine W04 quota claim made by this fixture |
| MMIO, IRQ or unknown operation | rejects with explicit distinct fault | **STOP:** no device, interrupt or OS/HLE integration |
| Timebase->system-time epoch base | NOT applied; distinct APIs | **STOP:** cannot claim `OSGetSystemTime` or calendar semantics |
| Native timebase upper/lower retry | reference accepts atomic caller `uint64_t` | **STOP:** no `mftbu/mftb` device/sequence atomics or race model |
| Real Nintendo function | NEVER loaded | **STOP:** original DOL hash mismatch and unverified imported dependencies |

The reference's `closeAfterVerifiedReset(...,true)` takes an **assumption
provided by an isolated test**; it is not a proof of real quiescence.
Never expose that argument as a production JS/Wasm API or register an
HLE override without a trusted W03 predicate. There is no successful
stub for unsupported OS operations.

## Reproduce from assigned Toad branch, marcos-hpr Ubuntu

```bash
env -u LD_LIBRARY_PATH -u LD_PRELOAD \
  /usr/bin/node --test tests/phase15/toad/os_time64_reference.test.mjs
```

The Node suite invokes `g++ -std=c++17 -O2 -Wall -Wextra -Werror
-pedantic`, compiles the isolated C++ source in a unique temporary
directory outside Git, runs 42 native checks, then independently
exercises JS semantics including 128 deterministic split/reconstruction
iterations. Only **13 Node tests** are counted in Node's own test
summary; the 42 native checks are reported separately, and 128
iterations are subcases, not 128 further Node tests.

Existing runtime-services tests must be run separately to prove no
regression. No production Wasm is rebuilt, no new binary or JS source
is served by the public browser. **Do not label Chrome, Emscripten
binary or REA tests PASS unless they are genuinely run on an applicable
artifact.**

## Required cross-team decision BEFORE integration

Peach owns W03 frame-host and synthetic leaf execution. Mario and
Peach must define a narrow native, **slot-indexed, trusted**
CPU-context callback that returns a meaningful status BEFORE any
mutation, supports per-guest epoch ownership and tests global reset/
quiescence. A general exported Wasm function accepting arbitrary
JS-supplied `CpuContext*` is NOT safe. A raw GPR-returning synthetic
function is not proof that the upstream HLE dispatch and exit semantics
work. Do not add any HLE symbol or relink Wasm until that separate
contract has a reviewed, tested implementation and Mario authorization.

W01 audit only demonstrates synthetic static source-evidence gates.
The original source DOL SHA mismatch, recursive C# MAP provenance,
GPR ABI/HLE/IOS/GX and future original leaf dependency verification
remain independent hard STOPs. No original Nintendo bytes, profile
secrets or credentials are in this deliverable.
