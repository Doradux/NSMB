# Phase19 Peach — real W03 synthetic fixture clock bridge (no Wii HLE)

## Problem/RED
Mario's Phase18 C++ had a true native C++ trusted ticket and canonical
`clockTicks+clockRevision`, but the prior *fresh* Emscripten Wasm export list
only exposed generic W03 spawn/tick/GPR reads: **no public way to trigger a
legitimate private W03 clock event**, no clock revision/tick observations.
A Node native test for this functionality initially failed at the linker
with undefined `nsmbw_loop_synthetic_clock_fixture_spawn` and read-only
clock getters. Simply invoking `createModule` in Chromium proved only
binary loading, not a guest clock operation.

## Concrete GREEN design
`web-runtime/frame-host/frame_loop.cpp` adds a strictly synthetic-only
`extern "C"` export with the following calling convention:

`int nsmbw_loop_synthetic_clock_fixture_spawn(id,stackTop,input,output,salt,nanosHi,nanosLo)`

It is **not** a general grant, clock override or service call. This C ABI
will only create one **NEW** `kind=1` W03 synthetic guest with a fixed
allowlisted `SyntheticCpu::Entry` PC; duplicate/existing ID is rejected
by the original `nsmbw_loop_cpu_spawn` and no existing guest can be
armed through this ABI. `nanosHi/Lo` are UNTRUSTED synthetic test values,
not an authenticated time source or a real Wii clock.

Before changing any guest registers or ledger, the W03 native function:

1. Computes the pure Time64 result through Toad's existing
   `time64_pure_clock.hpp::prepareFromNanos` with the current W03-owned
   `serviceEpoch` and revision zero for the brand-new guest.
2. Calls the checked existing `nsmbw_loop_cpu_spawn` for the declared
   synthetic entry and independent W04 stack/input/output memory.
3. Privately issues `leaseSynthetic(id)` in native C++ (not public JS),
   then privately invokes `armCanonicalClock` using all of the pure
   candidate fields (raw64, hi32, lo32, sourceEpoch and sourceRevision).
4. Should any private arm unexpectedly fail, erases only the freshly
   created fixture without altering any other guest. Existing source
   lifecycle gates continue to reject recursive W07 device callbacks.
5. Leaves all register/ledger writes until a subsequent real
   `nsmbw_loop_tick()`. Only the scheduler's original W03 native
   `DispatchScope` owns the single no-callback commit of GPR3/GPR4,
   `clockTicks` and `clockRevision`. No second Toad ledger/commit.

All exported extra observations return **32-bit scalar copies**:
`nsmbw_loop_clock_ticks_hi/lo(id)`,
`nsmbw_loop_clock_revision_hi/lo(id)`,
`nsmbw_loop_clock_pending(id)`,
`nsmbw_loop_clock_outcome(id)`.
Guest-context pointers, token minting, PC override and ledger setters
remain unexported. Reads of unknown IDs return zero.
A public requester CAN create artificial new fixture guest/time values;
the API is *not* a security perimeter against malicious JS, an
authenticated scheduler-driven Nintendo service or a source of real time.
It has **no power to alter any existing guest**, a deliberate strict
boundary for the observable public browser regression.

## Native proof before Wasm proof
`tests/phase19/peach/fresh_clock_native.cpp` links the actual W03/W04/W07
C++ and Toad pure math. The initially missing symbols made this RED.
Now 33 named native checks and 128 reset/recycle iterations exercise
prepare-only/no writes, actual W03 event, exact pair+ledger revision,
duplicate guest/unknown ID denial, independent guests, carry past 2^32,
zero/one/MAX uint64 nanos, cancel/reap/reuse, suspend/resume and
quota0 clock commit followed by expected W04 guest fault.
The native pass is **not** a substitute for compiling/instantiating a
fresh Wasm and executing the SAME fixture inside Node+Chromium. The new
artifact must be tied to its exact git HEAD, source hashes, ABI map and
byte digest. Legacy `dist/*.wasm` must not be substituted.

## Contract with Toad Phase19 dispatcher
Toad may introduce a versioned, allowlisted public synthetic service
candidate later. That candidate is solely read-only data; W03 still mints
native private authority and owns the unique canonical ledger and its
revision. A dispatcher cannot use a JS-supplied `trusted=true`, raw
`CpuContext*`, or fallback unknown service to manufacture authority.
The fixture remains a narrow independent proof route until a precise
reviewed Toad SHA and native integration contract exist.
