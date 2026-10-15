# Phase 7 — fail-closed gate for ONE authentic translated Wii function

**Status: STOP.** There is no validated original NSMB Wii guest function and
the game is not playable. This document is a public, source-grounded
integration contract, not a port or a compatibility claim. Never publish
original Wii binaries, RELs, DOLs, asset extracts, original generated C++,
private identities, credentials or traces in Git, public CI or browser routes.

## Precisely demonstrated so far

The reviewed public synthetic pipeline generates C++ from an INVENTED tiny
PowerPC fixture using actual upstream Translator.Cli, and executes the
unmodified emitted C++ inside real Emscripten Wasm. A W03 cooperative
single-threaded scheduler supplies CpuContext-style GPR/PC state, W04 uses
sparse checked MEM1/MEM2 words and a two-page atomic journal, and W07
rejects unimplemented devices. A fixed FOUR-OP synthetic program:
STW r3,0(r4); LWZ r5,0(r4); STW r3,0(r6); BLR
can read a staged 32-bit word through checked physical alias forwarding,
then commit two RAM writes atomically; quota/MMIO failures roll back the
synthetic guest GPR/PC and original RAM. This is NOT evidence that general
translated PowerPC, 64-bit/FPR instructions, native imports, arbitrary
call graphs or original-game HLE work.

## Ranked mandatory gates

| Rank | Real public upstream source contract | Browser proof still missing or explicit denial |
|---|---|---|
| P0 identity | scripts/audit_profile.py needs full DOL version/hash, static MAP, translated function coverage and quality, with ambiguous YAML/JSON rejected | W01 original DOL identity mismatch and rejected prior strict auditor: STOP even before selecting an authentic function |
| P0 CPU | upstream-nsmbw/translator/src/Translator.Core/CodeGen/CxxLinearCodeGenerator.cs emits extern C void func(CpuContext*); runtime/include/isa/ppc_isa_context.h defines GPR/FPR/CR/LR/CTR/XER/PC; runtime/include/abi_bridge.h handles direct/indirect native dispatch and trampolines | Synthetic sequential fixed function only; unknown ABI branch/override/FPR or state-free symbol is hard failure |
| P0 RAM | Translator EmitInstruction, FlatGuestMemory and GuestThunkInlines emit MemoryInline, resolved guest pointers, 64-bit and FP accesses; upstream runtime/src/guest_flat_memory.cpp reserves a flat 4GiB address mapping | Browser W04 only checked sparse scalar 8/16/32 and specific aligned 32-bit 2-entry pure RAM journal. No raw guest-to-Wasm pointer casts, executable-write, unknown widths, DMA or resolved spans. Reject unsupported patterns before side effects |
| P0 call-specific OS time | upstream runtime/src/hle/os/os_time.cpp implements OS__GetTime_HLE(CpuContext*) returning full 64 bits in r3 and r4; det_clock.cpp and timebase_contract.h give 60,750,000 ticks/sec | Toad synthetic low32 checked RAM clock at 0x80008000 is NOT 64-bit OSGetTime, mftb, guest r3/r4, OS epoch, interrupts or callbacks |
| P1 graphics | Translator EmitInstruction and GpuFifoBurst generate GX_HLE_FIFO_Write* and burst calls; runtime/src/hle/gx/gx_fifo.cpp and gx_stubs.cpp track device commands | No GX parser, EFB, DMA, GPU ordering, actual WebGPU or irreversible device callback; typed W07 mocks/denials are NOT hardware emulation |
| P1 IOS/storage | runtime/src/hle/ios.cpp, storage/dvd.cpp and nand_isfs.cpp expose IOS async reads/open/ioctl, DVD callbacks and NAND file permissions | No IOS device file descriptors, title-isolated saves, async guest callbacks, complete local FST/DVD or DMA. W05 indexes only private LOCAL metadata |
| P1 timing/threads | runtime/src/hle/os/os_alarm.cpp, os_thread.cpp, os_interrupt.cpp and hle/vi.cpp implement alarms, fibers and VI retraces | No actual guest fiber/IRQ/VI schedules; W03 is synthetic bounded cooperative scheduling |
| P2 controllers/audio/net | runtime/src/hle/input/kpad.cpp, wpad.cpp, hle/audio/ax_mix.cpp and hle/net/network_deferred.cpp | W08 only synthetic input/offline PCM, no Wii Remote/AX DSP/IOS sockets or real device completion |

**These are possible dependencies, not known dependencies of any private
original function.** Select and inspect a specific original leaf ONLY once
W01 identity is proven, then privately enumerate that leaf's exact imports,
memory widths, CPU registers, native overrides and irreversible operations.
No original leaf has been selected or vetted in this document.

## Accept/reject workflow for a future SINGLE original leaf (owner private)

1. Mario verifies the original executable version/hash and complete
   unambiguous static translation evidence. Any mismatch/duplicate mapping
   or incomplete coverage is an immediate STOP, never a bypass.
2. Privately derive the selected leaf's full generated call graph, native
   imports, instructions, aliases, side effects, required registers and
   exact stack/entry/return ABI. Keep symbols, original function names and
   source fragments OUT of public messages/files.
3. Classify each dependency as VERIFIED supported, DENIED pre-mutation,
   or UNKNOWN. UNKNOWN or a required DENIED service forbids execution.
   A fake successful HLE stub must never be counted as VERIFIED.
4. Before private source integration, reproduce the relevant ABI shape
   with newly authored synthetic C++/PowerPC code. Negative coverage:
   first-store/second-store quota rollback, page count unchanged, alias
   forwarding, zero data, strict MMIO/GX/IOS rejection, guest PC/FPR/GPR
   unchanged on failure, multi-context isolation and 128 genuine Chrome RAFs.
5. Only privately, execute ONE vetted translated leaf with finite step,
   RAM and time budgets. Compare native reference behavior and W03/W07
   status. Do not output proprietary addresses/hashes/bytes into logs.
   A single working leaf does NOT imply boot or playable levels.
6. Treat a callback-invoking device error as nonretryable. Only a
   proven pure-RAM quota failure with per-context retrySafe can be
   considered for manual retry; never replay FIFO or IOS side effects.
7. Require fresh independent reviews of public engine infrastructure.
   Mario alone may integrate it into main. Original data stays private.

## The next source-driven implementation decision

A first authentic function cannot be chosen using the information in
public main while W01 still mismatches. A reasonable next PUBLIC proof
would be a fully explicit synthetic 64-bit OSGetTime r3/r4 return
with bounds/epoch testing IF the privately verified future leaf needs
that override; otherwise implement only the specific supported
MemoryInline operation established by that leaf's evidence. Avoid
guesswork and no-op implementations of graphics/storage/interrupts.
