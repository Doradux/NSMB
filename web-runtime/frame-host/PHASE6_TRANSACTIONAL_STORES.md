# Phase 6 — Public source-translated PPC two-store safety

Owner: Luigi. Base: origin/main 391e368. Branch: agent/luigi/phase6-translated-store.
Scope: COPYRIGHT-FREE TEST FIXTURE ONLY. No Nintendo code/data/files, no original generated game functions, no real Wii game boot.

## Reproducible public translator input

- translator-fixture/build_store_fixture.mjs creates a 280-byte synthetic DOL SHA256 34c6aee685be13ae366315e2155dc36312d3b3139b5289deee5d69bca85ecb15.
- Six authored big-endian PPC opcodes: 90640000 (stw r3,0(r4)), 90660000 (stw r3,0(r6)), 48000009 (bl helper), 4E800020 (blr), 38630001 (addi r3,r3,1), 4E800020 (blr helper).
- Dummy SDA2/SDA1, synthetic entry 0x80001000, helper 0x80001010, SHA-pinned manifest. Generated DOL/C++ are inside git-ignored translator-fixture/out/store_fixture.
- Actual installed public precompiled upstream .NET8 Translator.Cli translate-recursive emits two C++ source files. Main generated function has extern C void func_80001000(CpuContext*), MemoryInline::FlatWrite32(r4,r3), MemoryInline::FlatWrite32(r6,r3) and an INLINED public helper incrementing r3.
- build_translator_store_fixture.ps1 STRICTLY validates expected emitted C++ signatures/call sites/inline annotation before compiling the UNMODIFIED generated source into a test-only Emscripten module (dist/frame_loop_translated_store_fixture.mjs/.wasm).

## Constrained transaction contract

- The only new memory helper is test-only MemoryInline::FlatWrite32(uint32 guest,uint32 value). This is NOT full upstream native 4-GiB MemoryInline ABI. Unrecognized compiled generator outputs must fail at strict matcher/build.
- The journal can record no more than TWO distinct physical aligned MEM1/MEM2 32-bit guest words. Cached/uncached aliases coalesce by physical address. All MMIO/GX/unsupported, unaligned, unmapped guest addresses rejected before any store.
- Staging uses W07 checked nsmbw_interop_read32 to get the original word, captures status directly, and performs ZERO writes. The translator's generated C++ operates on an independent 464-byte CpuContext copy.
- Commit uses TEST-ONLY W04 nsmbw_mem_atomic_pair_write32, which revalidates both aligned guest RAM words, computes the distinct missing sparse pages, checks budget, allocates BOTH missing page buffers in temporary staging and only THEN installs page pointers and writes big-endian guest bytes with no further failure point. If quota or malloc fails, no guest byte OR page allocation changes (including when both pages were previously absent). The previous sequential W07-commit-with-rollback strategy was rejected by a RED test because it could leave a newly allocated blank page; normal W04 remains unchanged outside the phase6 test macro. No MMIO/device callback ever touches the commit path.
- Only after full RAM commit does the scheduler copy registers, set terminal PC, DONE and translated r3+1. On error it preserves previous GPR3, PC, LR, stack, guest RAM, denies automatic replay, and records typed error.
- The test-only nsmbw_loop_translated_store_spawn validates its own stack/output reservations and other live guest CPU output address overlaps; other synthetic legacy contexts still have their own separate contract.
- Normal/previous arithmetic/previous lwz Wasm never export the phase6 store fixture symbol. Test-only HTTP server uses a strict four-resource localhost allowlist.

## Tested execution

- Ten new Node real Emscripten tests: successful big-endian two stores and genuine inlined call; alias coalescing; late MMIO failure before writes; zero-budget rejection and zero ghost pages; first staged guest store is valid but the second page fails a single atomic quota preflight, original first value and allocated page count exactly preserved, no PC/GPR mutation/retry; two previously unallocated pages and budget1 leave zero allocated pages after failure; 3 contexts and bounded host dispatch; other guest write reservations; 128 resets; normal Wasm isolation.
- One new real Chrome test: actual generated C++ runs in actual Wasm over 132 requestAnimationFrame turns (including three contexts, quota rollback, MMIO rejection and 128 repeated resets), no browser console errors, no private paths served.
- Rebuilt normal W03/W07 typed fixture and Asyncify Wasm from source; combined tests under node --test --test-concurrency=1: 68/68 PASS including new previously-unallocated-page regression, zero skipped. Parallel browser tests once had an unrelated Chrome CDP page-discovery failure; isolated Chrome re-test PASS and entire serial suite 68/68 PASS including new previously-unallocated-page regression.
- Important: original W01 source identity/profile guard remains blocked; no original Wii function has been translated, emulated or played.

## Remaining safety boundaries and next opcode

This is NOT general arbitrary generated PowerPC safe replay. The CpuContext copy alone does not rollback real device/interrupt/MMIO/DMA side effects; this exact fixture has none. Unsupported byte/half-word and 64-bit stores, cross-page spans, read-after-staged-write, float/FPR/GQR, native overrides, arbitrary indirect call graph, LR continuations, host fibers and full Wii OS services remain unimplemented. Do not claim complete runtime.

Next public source-generated opcode candidate: stb/sth, or a read after pending stw using read-your-own-write journal semantics. First require exact upstream emitted C++ shape, W07 typed checked subword operations, staged overlay reads, quota/alias and rollback tests, real Chrome and independent peer review. No original game files.
