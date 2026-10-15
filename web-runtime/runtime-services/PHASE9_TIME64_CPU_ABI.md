# Phase 9 — synthetic 64-bit time ABI probe using real CpuContext

Scope: copyright-free deterministic host runtime only. NOT Nintendo
OSGetTime, a genuine Wii oscillator, OSGetSystemTime or game boot.

## Public upstream source evidence

The reference runtime/src/hle/os/os_time.cpp implements
extern "C" void OS__GetTime_HLE(CpuContext* ctx) and returns the 64-bit
time-base high word in ctx->gpr[3] and low in ctx->gpr[4].
Its ReadTimeBaseRegisters reads PPC_Mftbu, PPC_Mftb, PPC_Mftbu and retries
if the two upper words differ, preventing a torn low-word rollover.

OSGetSystemTime is a DIFFERENT path adding guest base time at
0x800030D8/DC and interrupt management; neither that epoch nor IOS,
alarms, threading, VI retrace or guest callback schedules are present.
The public runtime/include/timebase_contract.h specifies Broadway bus
243,000,000 Hz divided by 4 = 60,750,000 ticks/s. Nanoseconds conversion
is floor(nanoseconds * 243 / 4000). Host BigInt samples are deterministic
TEST INPUTS, not observations of a physical oscillator.

The project frame-host/guest_cpu.hpp matches upstream canonical
CpuContext ABI shape: sizeof 464, align 8, 32 integer GPRs, FPR/GQR
and control regs; synthetic time uses actual C++ CpuContext* and
modifies ONLY gpr[3] and gpr[4].

## Exact implementation boundary

New public C++ runtime-services/time64_cpu.cpp defines
extern "C" void nsmbw_synthetic_time64_guest(CpuContext* ctx).
It operates on three native CpuContext diagnostic slots and splits a
prevalidated 64-bit snapshot to r3 high/r4 low; NO JavaScript-only
register simulation. These owned test slots are distinct from W03's
separate scheduled CpuContext tasks; the same compiled Wasm runs both,
and W03 can see the shared lowword in checked W04 RAM.

nsmbw_services_time64_publish(slot,guestAddress,high,low) verifies
slot 0..2, native clock owner claim, and nondecreasing native u64
time. It commits one checked lowword W04 RAM store via existing W07
MMIO/quota policy BEFORE updating native sampled time or CpuContext.
On failure no CpuContext registers or native time change, and no
unsupported MMIO/GX callback. It is NOT an atomic 64-bit RAM store,
no untrusted multithreaded host or global Wii hardware emulation.

The existing host createSyntheticTickClock retains one owner across
structural facades and ESM aliases. New additive publishCpu(slot,u64)
and advanceCpu(slot,delta) accept BigInt only, split to two native i32
arguments, enforce monotonic time, cap each advance at 60,750,000 ticks
and commit host time only on successful C++ callback. Existing low32
publish()/advance() paths are unchanged.

Native time64 reset clears diagnostic CpuContext slots ONLY after
W03/W04 global reset has left zero RAM pages, active/paused/done/
faulted/cancelled contexts and scheduler trace. It does not perform
W03 reset itself and NEVER releases native lifetime clock ownership.
Status codes: 3 page quota, 7 invalid RAM/slot, 9 missing owner,
10 native tick regression, 11 reset refused; other W07 errors retained.

## Actual evidence / limitations

Node time64_cpu.test.mjs: high/low zero, full 64-bit, lowword carry
0xFFFFFFFF->0 with high increment, 2^64-1 maximum, negative/overflow,
two independent Wasm instances, distinct facade duplicate denial,
native direct tick regression refusal, quota0 RAM+reg rollback,
MMIO/GX rejection with zero device callbacks, three CpuContext slots,
actual W03 guest tasks reading lowword and safe reset/owner persistence.

Chromium tick_browser.test.mjs runs actual compiled Emscripten C++,
validates r3/r4 from three CpuContext* slots, 128 reset/frame
iterations with checked guest RAM and same Wasm W03 CPU guest read,
zero-page quota and memory cap. REA 6.5.0 static evidence reports
full WASM export/import signatures but does not execute behavior.

W01 original executable SHA mismatch still blocks authentic code;
the native override address, original generated translated function,
64-bit machine timebase, scheduling, memory mapped OS system epoch,
IOS/GX/VI/audio, and true Nintendo game functionality are ABSENT.
No game executable, translated proprietary source or private assets
are committed or served.


## Phase 9 evidence from authorized marcos (2026-10-15)

Compiled public Emscripten single-Wasm artifact: 23,145 bytes,
SHA256 1fcde84736171ed696b5164f7a5f09fc6e8f620ba6b85801419a97713509e0f1.
REA 6.5.0 WABT static evidence
ev_aa6f35a74e837c40c8b301a7293bcb6ea311786289aa429d4fe24aad443b703a
in C:\NSMBcowork\notes\Toad-P9-REA-time64-cpu.json (outside Git).
REA validates 77 exports and one import env.emscripten_resize_heap,
including time64_publish(i32,i32,i32,i32)->i32, time64_gpr(i32,i32)->i32,
time64_status/reset/context byte length/alignment, original 4 CPU ABI
exports and existing tick owner services. No test-only mock callback
symbol matched the normal build's export list.

Real Node/browser suite: runtime-services 60/60 PASS (includes actual
Chrome), interop 27/27 PASS, Peach independent old clock/facade 8/8 PASS.
W03 frame-host 91/92 on one concurrent run: translator_stb_browser
DevTools page discovery occasionally has an empty page list before
CDP can connect; its exact standalone retest PASSED 1/1. On earlier
full combined run a DIFFERENT preexisting DevTools fixture failed in
the same manner; target fixture browser tests individually passed.
NO frame-host browser harness source was altered in this branch.
The combined run cannot be reported as all green: it requires its
own independent stable-browser rerun/review. Current Phase9 clock Chrome
diagnostic with 128 cycles and all 11 new time64 Node cases PASSED.
