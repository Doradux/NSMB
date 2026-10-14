# W07 Phase 3 — single-threaded device lifecycle and retry contract

Status: **synthetic C++/Wasm prototype only**, no Wii HLE/GX emulation.
Parent: reviewed + integrated W07 013fa19 on main da10f58.
Source contains no original game data, translated code, private manifests or device ROM.

## ABI additions; legacy exports and statuses unchanged

    nsmbw_interop_device_invoked() -> uint32_t 0/1
    nsmbw_interop_retry_safe()    -> uint32_t 0/1

The meaning is **conservative**: a device callback was entered during the
immediately preceding checked interop call, even if it rejected, returned
a malformed response, or a LATER destination RAM store failed. The
callback may have read-clear-register behavior or already emitted a GX
FIFO command. Therefore when status != 0 AND device_invoked == 1,
**DO NOT RETRY** that guest instruction without external reconciliation.
retry_safe == 1 means NO DEVICE CALLBACK entered (not proof of full
transactionality for any future unimplemented external service).
Read status, device_invoked and retry_safe **immediately after step**,
before scheduling another context or direct checked access.

Existing status codes stay stable:
0 success, 1 unmapped guest RAM, 2 32-bit wrap, 3 RAM page quota/OOM,
4 unhandled MMIO/GX/region straddle, 5 explicit device rejection,
6 invalid callback reply or reentrant policy violation.

On failure status 3 AND retry_safe == 1, the host may deliberately
increase the sparse RAM budget and retry the same guest function in a
later bounded frame. On status 3 AND retry_safe == 0, source MMIO read
might already have consumed a register or produced another irreversible
side effect: context MUST fault nonretryable rather than dispatch again.
Failure status 4 with device_invoked==0 is a safe denial but is still
NOT a license to busy-loop retry: the HLE service is absent.
Always treat status 5/6 as a fault; no autonomous replay.

This API intentionally exposes **no JS raw host callback pointers**.
The normal binary registers no handlers and rejects MMIO/GX by default.
Only a distinct TEST fixture Wasm binary installs simulated handlers.

## Handler policy lifecycle

- MMIO and GX FIFO are registered separately via typed C++ link-only
  callbacks. scalar 8/16/32-bit accesses and byte range crossings are
  validated before entering a callback.
- Callback reentrancy and mutation of registered callback pointers
  while a callback is active return invalid-policy status 6.
  An internal guard releases after the callback returns, allowing
  following independent operations.
- A rejected or malformed callback reply still counts as entered and
  potentially side-effectful; never mistake a rejected reply for an
  ordinary quota failure that can be replayed.
- Reset clears guest memory, device callbacks and last-operation
  device-invoked state while retaining the W04 host-selected page quota.
  Reset is MODULE-WIDE, never a per-context switch or automatic
  cancellation of a single task.
- Event order is measured through a test-only 64-entry fixed log.
  Overflow is counted, not silently expanded. No actual CPU interrupt,
  Wii timer, deferred EFB read or GX service is implemented.

## Contract for Luigi's W03 host

A bounded loop must store per guest context:
id, PC, sourceGuest, destinationGuest, regs and a separate fault status.
Each tick calls nsmbw_interop_step() then immediately:
- reads nsmbw_interop_status()
- reads nsmbw_interop_device_invoked()
- reads nsmbw_interop_retry_safe()

No context switch/intervening checked memory operation before this
snapshot. Successful steps may commit PC and registers. A failed step
must leave the failed PC uncommitted; if deviceInvoked=1, mark the
context nonretryable and DO NOT invoke the same device instruction
again even after raising the RAM budget. Other ready contexts continue.
This is a scheduler host contract, **not** a full device transaction
or a universal protection against a malicious host manually repeating
the same call; no guest instruction ID/replay journal exists yet.

The APIs are single-threaded module globals. No async callbacks or
pthreads may call into a shared module while one guest step is active.
Reentrant and cross-thread operations are not supported; register or
remove callbacks only at intentional stopped/frame boundaries.

## Tests (synthetic fixtures and real browser)

    .\web-runtime\interop\build.ps1 -Emsdk "C:\path\to\emsdk" -WithTestFixture
    node --test web-runtime/interop/test/*.test.mjs

The updated fixture injects: callback denial, invalid reply, recursive
MMIO dispatch, illegal registry clear, read-side effect followed by a
quota failure, 128 cycles of register/reset, RAM-only quota retry,
MMIO read then GX write ordering, and fixed-cap event logs. Browser
also checks device invocation before a later quota fault and deliberate
non-retry before doing 10k synthetic RAM roundtrips. These are not
hardware timing measurements or legitimate-game execution.

## Remaining blockers

WiiCompiled MemoryInline direct pointer paths/4 GiB address space are
still incompatible. True MMIO/GX FIFO, DMA, IOS/HLE, executable-write
guard, EFB, interrupts, 64-bit, float/paired-single, guest fibers,
browser-thread safety and actual game-compatible W01 DOL hash remain
unimplemented/unverified. The module cannot run original guest
functions yet; commercial assets/binaries/generated code must remain
in the owner's private directory, outside GitHub.
