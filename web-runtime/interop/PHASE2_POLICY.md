# W07 Phase 2 — typed synthetic Wii device dispatch

Experimental synthetic diagnostic only. NOT a Wii MMIO emulator, graphics runtime, or playable game. Links the reviewed W04 sparse backend with synthetic guest function source. No Nintendo binaries/assets/source.

## Stable public JS/Wasm C ABI
    nsmbw_interop_step(srcGuest:u32,dstGuest:u32,addend:u32)->u32 success 1/0
    nsmbw_interop_status()->u32
    nsmbw_interop_reset()->void
    nsmbw_interop_read8/16/32(guestAddress:u32)->u32 data
    nsmbw_interop_write8/16/32(guestAddress:u32,value:u32)->u32 success 1/0

All addresses are guest 32-bit addresses, NEVER raw host pointers. Step calculates unsigned modulo-2^32 addition. Zero read data is valid and separate from status; status is overwritten after each access.

| Status | Meaning |
|---|---|
| 0 | Successful scalar guest operation |
| 1 | Unmapped RAM / unsupported RAM access |
| 2 | Guest 32-bit address wrap |
| 3 | Sparse page quota/allocation failure |
| 4 | MMIO/GX policy absent/unhandled or unsafe region straddle |
| 5 | Device handler explicitly rejected request |
| 6 | Malformed handler result or unsupported scalar width |

Statuses 0-4 are backwards compatible with W07 7138a64 for Luigi W03.

## C++-only typed device callback contract

web-runtime/interop/device_policy.hpp exposes enum Region {Mmio=1,GxFifo=2},
enum Operation {Read=1,Write=2} and a callback returning a typed
Reply { Result status; uint32_t value } for
(Region, Operation, guestAddress, width, inputValue).
NSMBDevice::install(Region, Callback) binds a TRUSTED C++ implementation.
No unsafe native callback pointers or host pointers cross JavaScript/Wasm.
Normal checked_interop.wasm includes NO handler: MMIO/GX fails closed.
test/mock_device_policy.cpp links ONLY to separate checked_interop_fixture.wasm,
never to normal public module.

Ranges: MMIO 0xCC000000..0xCDFFFFFF inclusive; GX FIFO specialized
0xCC008000..0xCC0080FF inclusive. Partial straddles reject without
callbacks. Reads/writes only widths 1/2/4, with big-endian bytes and
MEM1/MEM2 cached/uncached aliases delegated to W04. Cross-page stores
preallocate all pages or fail without partial RAM mutation. Interop reset
frees guest RAM, clears registered callbacks, retains host-chosen quota.

## Build and validate on authorized machine

    .\web-runtime\interop\build.ps1 -Emsdk "C:\path\to\private\emsdk" -WithTestFixture
    node --test web-runtime/interop/test/*.test.mjs

Two actual headless Chromium tests exercise normal guest step and a
test-fixture WASM with MMIO/GX callbacks, injected rejection, and a 10k
roundtrip microbenchmark. Node tests verify 8/16/32 paths, boundaries,
malformed callback responses, quota rollback, zero reads, reset/aliases
and 50k checked reads+writes. Timing observations are diagnostics, not
frame-rate SLAs or full Wii workloads. Rebuilt binaries are synthetic.

## Handoff to Luigi's host-driven scheduler

Per guest context store {id,pc,regs,sourceGuest,destinationGuest,addend,
state,status}. In a bounded host slice invoke nsmbw_interop_step once
for one runnable context; IMMEDIATELY read nsmbw_interop_status before
another context accesses the SAME module. Status is module-global and
not thread-safe. A nonzero status pauses only that caller. Retry status
3 only after explicit deliberate page-budget change; 4/5/6 MUST NOT
auto-retry because no actual HLE device handler exists. Reset is module-
global, NOT a per-context switch. Never pass host pointers or allocate
a flat 4 GiB address view. Scheduler must serialize module calls.

## Out of scope and blockers

MMIO/GX handlers are synthetic test doubles, not real hardware models.
DMA, deferred EFB, executable-write guards, interrupts, 64-bit/float,
paired-single, MemoryInline native flat fast paths, Wii fibers and full
native PPC context are MISSING. A callback could trigger side effects
before a later RAM write fails: multi-device transactions are NOT atomic.
Quota-induced failures are simulated, not proof of recovery from genuine
WebAssembly heap OOM. W01 hash/profile ABI verification is required
before private tests of original translated functions. No game boot claim.
