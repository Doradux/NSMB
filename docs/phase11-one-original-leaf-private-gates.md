# Luigi — Phase 11 original Wii leaf: PRIVATE stop gates

Date: 2026-10-23. Public, copyright-free protocol only. This document does
NOT identify, extract, translate, disassemble, or execute any Nintendo function.
Device: marcos-hpr ONLY. Public recovery main: 2c2ef26; synthetic reconstruction:
3fda047. Old Windows-only fixes and unpublished owner worktrees were NOT recovered.

## Gate 0: provenance and W01 (currently BLOCKED)

Mario must privately establish the exact owner's original revision/region/edition
and source provenance, the DOL SHA-256 matching the particular pinned translator
profile, and any REL identity/module/overlay lifetime used for selected function.
Do not alter the pin merely to force an audit pass. Never upload hashes that
fingerprint the user's private source, Nintendo bytes, proprietary translated C++,
original symbols or traces. Only local private logs, outside Git and web server.

A NEW clean Mario W01 source commit must reject:
- recursive duplicate JSON keys, including Unicode-escaped aliases, in REL and
  translation metadata; ambiguous, overlapping or out-of-range executable REL
  claims without proven ownership and lifetime;
- null/malformed REL module/section mappings with controlled errors rather
  than AttributeError, fractional/boolean/ambiguous entry points and quality;
- incomplete MAP, coverage and translation quality evidence; --probe never
  turns mismatched SHA or missing evidence into strict compatibility.

Mandatory independent RED on old published auditor (clean 9708663), then GREEN
on exact NEW clean Mario W01 SHA, without changing existing assertions. Positive
fully covered artificial fixtures must still pass. Old author 21/21 GREEN is not
proof against known adversarial negatives (Luigi 12 RED, Peach 7 RED, Toad
4 uncontrolled schema errors as independently reproduced on Ubuntu).

## Gate 1: select precisely ONE candidate, privately AFTER W01

Mario privately chooses a verified deterministic bounded original leaf with a
closed call/import graph. Reject any hidden recursion, indirect native dispatch,
unresolved override, unwitnessed dispatch thunk, unimplemented instruction,
FPR/paired-single/FPSCR/GQR, interrupts, DMA/DVD, GX FIFO, VI scheduler, IOS
request, callbacks or unreviewed HLE. Pure integer/memory-free candidate
would simplify first test IF the authenticated source has such a leaf; never
invent or assume it does.

## Gate 2: exact C++/Wasm ABI checklist

Independently confirm public upstream translator's generated calling convention
extern "C" void func(CpuContext*), guest PC and LR/CTR/CR/XER, 32 GPRs,
r1 stack frame/canaries, r2 SDA2 and r13 SDA1 authenticity, 64-bit ABI width
and return register pairs, FPR/FPSCR/GQR state and native override registration.
The source-shaped diagnostic CpuContext being 464 bytes/align8 is NOT proof of
complete PPC execution semantics. Validate translated symbol, actual runtime
imports/exports and type signatures with a pinned REA or equivalent scanner.
Every generated MemoryInline helper/read/write must be implemented with W04/W07
checked big-endian RAM aliases, quota preflight and fail-closed MMIO; never cast
arbitrary guest addresses to raw WebAssembly pointers.

Time64 Phase10/11 is only a synthetic host diagnostic. It is NOT the original
PPC timebase or OSGetTime/OSGetSystemTime HLE. Its high r3/low r4, 3 synthetic
slots, memory lowword and monotonic ledger cannot authorize guest OS callbacks.

## Gate 3: private reference-oracle execution, IF all above pass

Take identical verified private snapshots: every relevant GPR and CR/XER/PC/LR,
FPR where needed, stack, SDA bases, guest RAM bytes/pages, device and callback
state. Execute one bounded leaf against a trusted *same-revision reference*
and the translated host, compare at matched safe boundaries, including
unaligned/page-end, negative/quota0, alias, declined MMIO, rollover only if
relevant, and repeat/reset. On unresolved imports, unsupported architecture,
mismatched state, unexpected page/callback or partial side effects: STOP.
Use instruction/frame/memory budget; never infer real boot/playability.

## Gate 4: release/public communication

Run exact source SHA Emscripten rebuilt artifact, Node and genuinely sandboxed
Chromium in series, zero skips; REA typed ABI and no mock/dev route leakage.
Two independent reviewers must approve. GitHub may receive only synthetic
tests, source-independent fixtures, boolean/aggregated results and no private
input or symbols. Mario alone merges main.

As of this report: Gate 0 FAILED by public W01 strict audit and original
DOL/profile identity, therefore no original Wii leaf can be selected/executed.
