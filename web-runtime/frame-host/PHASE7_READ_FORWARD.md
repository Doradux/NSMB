# Phase 7 — generated PPC read-after-staged-write coherence

**Branch:** `agent/luigi/phase7-journal-read-forward` (own isolated worktree, based on Luigi's `02378c5` negative audit / source `ed6170f`). **Not a real Wii or Nintendo game function.** Entire fixture is authored from four public 32-bit PowerPC instruction words.

## Proven source-generated instruction contract

`translator-fixture/build_readwrite_fixture.mjs` produces a 272-byte synthetic DOL with instructions `90640000` (STW r3,0(r4)), `80A40000` (LWZ r5,0(r4)), `90660000` (STW r3,0(r6)), `4E800020` (BLR), SHA256 `9016d09fe94d97717b18a936898e01dc8f423ac4da3a5fe8c18c03d981548016`. The generated fake DOL, synthetic manifest and generated C++ reside in ignored `translator-fixture/out/readwrite_fixture`. There are no original game bytes, functions, copyrighted assets, or original DOL hashes in public Git.

The real precompiled upstream .NET8 `Translator.Cli.dll` translates this into exactly `extern "C" void func_80001000(CpuContext* MKW_RESTRICT ctx)` with these unedited generated operations in order:

```cpp
MemoryInline::FlatWrite32(r4, r3);
r5 = MemoryInline::FlatRead32(r4);
MemoryInline::FlatWrite32(r6, r3);
ctx->gpr[5] = r5;
```

`build_translator_readwrite_fixture.ps1` refuses code-generation changes or any other instruction order, and links the unedited C++ with W03 scheduler + W04 checked guest RAM + W07 typed interop + W08 input into its OWN **TEST-ONLY** `dist/frame_loop_translated_readwrite_fixture.mjs/.wasm`. The normal Wasm, previous 2-store fixture and source-only subword opcodes do not gain any test exports.

## Memory coherence and atomicity

- `transactional_store.h` supports ONLY aligned 32-bit ordinary MEM1/MEM2 words, at most **two distinct staged writes**. No raw guest pointers, 4-GiB host allocation, MMIO/GX/HLE, generic MemoryInline access or guest-device callbacks.
- FlatWrite32 reads an original W07 guest word and stages a new value in an in-memory two-entry journal; this does not change live guest RAM, even when a page is unallocated.
- NEW `MemoryInline::FlatRead32` first rejects unsupported/unaligned/MMIO addresses, then searches the pending journal by canonical **physical guest address** (`addr&0x3FFFFFFF`), returning the LATEST staged value (including zero, cached/uncached aliases). If no match, it performs a checked W07 read and immediately captures the typed status. A late read error marks the transaction faulted and returns only a dummy value to the generated function; its copied CpuContext is never committed.
- The *second* translated store stages another word. After successful generated C++ return, W04 `nsmbw_mem_atomic_pair_write32` validates both RAM addresses, reserves ALL newly required sparse pages together, then writes big-endian bytes in an all-or-nothing commit. Quota, allocation or typed error leaves original bytes AND page-table occupancy intact (no ghost pages), despite the earlier LWZ having observed the staged value.
- W03 invokes the generated function only on a copy of CpuContext and commits GPR/PC/DONE only after the W04 memory commit succeeds. Any failure leaves original guest r3/r5/PC untouched, fault isolated to context, retry disabled; no MMIO callback executed.
- No auto replay of partly staged side effects. The fixed C++ fixture contains no arbitrary call, hardware write, threaded/asynchronous effects, floating-point, cross-width access or native pointer operation. This is **not** a proof of transactional execution for arbitrary generated PPC.

## Evidence and tests

- `test/translator_readwrite.test.mjs`: real C++ Wasm reads staged value in r5 vs preexisting RAM, cached/uncached alias, zero-word, MMIO-denied late second store (no callbacks), quota0, late second page quota (both pages absent and one preexisting), unchanged GPR/PC, three independent contexts with bounded host scheduler, 128 resets and absence of test-only exports in normal Wasm. **9/9 pass**.
- `test/translator_readwrite_browser.test.mjs`: actual headless Chromium using real requestAnimationFrame and a strict four-path localhost allowlist; 3 contexts, 2 late faults, 128 RAF restart cycles, private file paths denied, no browser errors. **1/1 pass**.
- Historical `02378c5` negative Emscripten compiler gate for missing FlatRead32 was valid at that SHA. Current `audit_translator_readwrite.ps1` now performs strict POSITIVE source-generator/build gate for only this new exact 4-op fixture.

## Hard boundaries / next independent work

Still rejected: STB/STH widths, page-crossing halfwords, unaligned data, 64-bit memory ops, DMA/MMIO/GX/IOS, variable-count staged writes, arbitrary translated call graphs, dynamic dispatch, interrupts or native ABI side effects. The separate previously APPROVED `63f73e3` audit verified that generated `FlatWrite8` and `FlatWrite16` remain compiler-unsupported. Full power-on semantics and original game compatibility have NOT been established. W01 original DOL SHA mismatch and auditor quality gate remain blockers; no original Nintendo material enters Git or public browser paths.
