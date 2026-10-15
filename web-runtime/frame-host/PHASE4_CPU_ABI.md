# Phase 4 — Synthetic PowerPC guest CPU calling ABI

**Scope**: independent public synthetic C++ demonstration. No original Nintendo
game function, PowerPC opcode decoder, DOL/REL bytes, console executable,
translated game code, gameplay, Wii OS thread/fiber or privileged HLE.

## Compilation boundary

The existing W03 round-robin bounded scheduler has an additive CPU-context
mode, sharing **one actual Emscripten Wasm instance** with current W04
sparse checked guest memory, W07 typed device policy, and Toad's unchanged
`web-runtime/runtime-services/input_snapshot.cpp`. This is ONE C++ link:
there is no second input-Wasm instance, copied JS memory or 4 GiB allocation.
Input is written with `nsmbw_services_input_store(0x80004000,buttons,x,y,seq)`
and read by `nsmbw_interop_read32(0x80004000)` during a scheduled guest step.
Guest alias `0xC0004000` addresses the same checked RAM. All addresses are
32-bit **guest values**, never dereferenced as native C++/JS pointers.

Input packet big-endian 32-bit word: `[sequence:u8, axisY:i8, axisX:i8, buttons:u8]`.
Primary bit0, secondary bit1, pause bit2. Sequence wraps at the host's choice,
not a VI timebase. Disconnection sends a checked neutral packet (zero buttons/axes,
independent sequence), and checked quota failure is observable. The test uses a
*synthetic* standard Gamepad provider (no physical pad permission).

## Entrypoints and explicit state (C++ exports)

```
nsmbw_loop_cpu_spawn(id:u32,entryPc:u32,stackTop:u32,
                     inputGuest:u32,outputGuest:u32,salt:u32)->0/1
nsmbw_loop_cpu_gpr(id:u32,registerIndex:u32)->u32
nsmbw_loop_cpu_steps(id:u32)->u32
nsmbw_loop_cpu_lr/ctr/cr/xer(id:u32)->u32
nsmbw_loop_pc(id:u32)->u32   // guest-PC for CPU kind; legacy count otherwise
```

Existing W03 `nsmbw_loop_{frame,tick,suspend,resume,cancel,reap,retry_quota,
state,guest_error,ready,paused,done,faulted,cancelled,reset,...}` is unchanged
for existing legacy synthetic contexts. Up to eight **total** CPU/legacy
contexts interleave, max frame budget 64, 32 CPU operations per context.
CPU uses exactly 32 GPRs, PC/LR/CTR/CR/XER per context (separate C++ state
within scheduler Context). `r1` checked guest stack, `r2/r13` initialized
to 0 as SDA placeholders; `r3` packet and resulting callee return value,
`r4` input guest address, `r5` test salt, `r6` output guest address,
`r0` temporary to restore caller LR. GPRs r7..r31 remain zero, not an
implemented full PPC ABI. Stack top must be 16-byte aligned, and
`[top-16,top)` must be one permitted guest RAM page; actual writes still
pass W07 allocation/quota checks. An invalid spawn leaves scheduler intact.

### Fixed, declared synthetic guest program

No executable guest opcodes are fetched/decoded. Each dispatch runs one of
these fixed C++ operations selected by literal synthetic guest PC:

| Guest PC | Declared operation | Committed result |
|---|---|---|
| `80010000` | `stwu r1,-16(r1)` | old SP at new SP; new r1 |
| `80010004` | `stw lr,4(r1)` | caller LR saved to guest RAM |
| `80010008` | `lwz r3,0(r4)` | read input packet (not a native pointer) |
| `8001000C` | `bl 80010100` | LR=80010010, PC=callee |
| `80010100` | synthetic callee | r3=(buttons+sequence+salt) mod 2^32 |
| `80010104` | `blr` | PC=LR=80010010 |
| `80010010` | `stw r3,0(r6)` | output to checked guest RAM |
| `80010014` | `lwz r0,4(r1)` | restore saved LR into r0 |
| `80010018` | `lwz r1,0(r1)` | restore original caller stack pointer |
| `8001001C` | `mtlr r0` | LR=8001FFF0 host return sentinel |
| `80010020` | `blr` | PC=8001FFF0; context DONE |

**11 bounded instructions** per guest. An MMIO denial (4), typed callback
rejection (5), malformed reply (6), or RAM sparse-quota error (3) faults
ONLY the affected guest. The failed instruction leaves PC/GPR/r1/LR unchanged;
previous successfully committed instructions retain their guest RAM writes
(as on a real instruction stream). Quota3 can be retried only with guest-local
retrySafe=1 and deliberate host quota change. W07 device callback invocation
forces retrySafe=0 to avoid double external side effects. CPU validation
errors use guest status **7**; these are synthetic ABI errors, NOT PPC exceptions.

## Per-context isolation example

Before dispatch, an input store at `0x80004000` uses sequence7/buttons5.
Three contexts read the SAME word but have guest stack tops `0x80005010`,
`0x80006010`, `0x80007010`; output destinations are `0x80009000`,
`0x8000A000`, `0x8000B000`, with salts0/1/2. Their returned values
are 12,13,14, respectively; LR and SP return to sentinel and original
stack top. On controller disconnect (sequence8/buttons0), a subsequent
guest produces 8. Node and actual headless Chrome independently assert
the C++ outputs via real Wasm exports and RAM reads; JS does NOT calculate
a substitute execution result.

## Reproduce on an authorized PC

```powershell
cd C:\path\to\isolated\worktree
.\web-runtime\frame-host\build.ps1 -Emsdk 'C:\path\to\emsdk' -WithTestFixture
.\web-runtime\frame-host\build_asyncify.ps1 -Emsdk 'C:\path\to\emsdk'
$env:NSMB_W03_HOST_ROOT=(Get-Location).Path
node --test web-runtime/frame-host/test/*.test.mjs tests/phase3/*.test.mjs
```

Browser test `test/cpu_browser.test.mjs` serves only six named synthetic
resources through localhost and uses real Chrome/Brave DevTools, with private
paths blocked and no original files requested. It verifies 17+11 genuine
browser requestAnimationFrame callbacks and 128 further frames, shared input,
post-onFrame wake, stack, LR, disconnect neutralization, and reset quota.
The stress test does not prove physical Wii input hardware or real-game FPS.

## Current omissions and private-only validation gate

This is not a full System V/EABI/CodeWarrior PPC ABI implementation:
no actual bit-coded opcodes, PPC instruction fetch, CR field operations,
conditional branches, timebase, real CTR branch, XER carry/overflow,
floating-point/FPR/paired-single, AltiVec, stack unwind/exception paths,
real r2/r13 SDA relocation, TOC, dynamic linkage, interrupts, IOS/HLE,
cache/MMIO/DMA scheduling, memory execute permissions, stackful SwitchToFiber
semantics, arbitrary guest calls, deterministic VI clocks, or PPC JIT.
The synthetic PC constants are intentionally unrelated to Nintendo code.

**Private-only experiment after Mario W01 gates:** first verify exact
DOL/REL profile SHA256 and provenance, mapping, permitted original function
entry/address and calling convention. In an authorized private checkout only,
for ONE selected translated function, record independent native-vs-Wasm
argument GPRs, LR/CTR/CR/XER, SP/stack redzones, memory reads/writes,
return GPR3, error/MMIO flags and instruction-budget/observable side effects.
Compare a golden trace for multiple benign inputs, zero input and a bounded
quota/MMIO fault. Never publish function bytes, generated translated C++,
original ROM/DOL/REL/assets, private manifests or derived secrets to GitHub.
Do not call the game playable from this synthetic checkpoint.
