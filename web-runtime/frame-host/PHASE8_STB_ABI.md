# Phase 8 — one translated PPC subword: checked STB + late STW

**Scope:** strictly public invented PPC test input. New own branch `agent/luigi/phase8-checked-stb` from published `origin/main 9f000e0`. Parallel dirty `Luigi-P6-Subword-Wasm` worktree untouched. **Not Nintendo's translated game code, not a playable Wii emulator.**

## Actual public translator evidence
`translator-fixture/build_stb_fixture.mjs` generates an entirely invented 268-byte DOL at guest 0x80001000: `0x98640000` (STB r3,0(r4)), `0x90660000` (STW r3,0(r6)), `0x4E800020` (BLR). Synthetic fixture SHA256 `0de0796febeae0e8e0c2f9190839428596b6b73c5fbf2726431e3e5d135f3622`. Fake DOL/manifest/generated C++ live in Git-ignored `translator-fixture/out/stb_fixture` and are NEVER served by browser.

The actual precompiled public C# `Translator.Cli.dll`, not handwritten C++/JS, produces `extern "C" void func_80001000(CpuContext*)` and:
```cpp
MemoryInline::FlatWrite8(r4, static_cast<uint8_t>(r3));
MemoryInline::FlatWrite32(r6, r3);
```
`build_translator_stb_fixture.ps1` regenerates and checks exact instruction order, requires exactly two emitted `MemoryInline::` operations, then compiles the UNMODIFIED generated C++ into separate `dist/frame_loop_translated_stb_fixture.mjs/.wasm` with Emscripten and W03/W04/W07/W08; this test-only output is NOT in the normal `web-runtime/frame-host/server.js` HTTP allowlist.

## Checked byte semantics and atomic rollback
The existing Phase7 `MemoryInline::PendingStore[2]` journal is used only under strict `NSMB_PHASE6_TRANSLATED_STORE_FIXTURE` and `NSMB_PHASE8_SUBWORD_FIXTURE` build defines. New `FlatWrite8(guest,u8)` rejects device/MMIO, sparse out-of-range or unsupported addresses before effects; canonicalizes W04 cached/uncached physical aliases; converts a byte address to its aligned containing **32-bit** word and reads its original big-endian value through W07 checked interop. It then stages a masked update of ONLY the appropriate big-endian byte lane at `shift=(3 - (guest&3))*8`. It never modifies real guest RAM, page table or device callbacks before commit.

A subsequent *source-generated* STW stages the second guest word. Existing W04 `nsmbw_mem_atomic_pair_write32` performs all-or-nothing page preflight/commit for both affected aligned words, including quota0/1 and absent sparse pages. Overlapping STB and STW to the same physical word are coalesced: later STW wins. The per-context W03 `CpuContext` copy is installed only after W04 success; late quota/MMIO errors preserve guest PC/r3 and all original bytes, and do not allocate ghost pages. Retry is conservatively disabled, no MMIO callbacks are triggered.

Because only **one** byte store is introduced, no general STB/STH/SHARED WRITE, arbitrary translated function or 8/16-bit read-helper contract is implied. The later STW exists solely as an adversarial commit-failure demonstration. A physical byte at the last position of a 4KiB guest page stays within its aligned 32-bit word; an actual STH cross-page test still requires independent design and review. Concurrent multi-threaded guest execution or reentrant callbacks would require separate per-context journal storage; current single-threaded bounded scheduler does not provide a general transaction isolation API.

## REA 6.5.0 static evidence on authorized marcos (supplementary, NOT runtime proof)

REA launcher (installed OUTSIDE NSMB): `C:\NSMBtools\rea.cmd`. The three inspections (captured outside Git into `C:\NSMBcowork\notes\Luigi-P8-REA-*.json`) are:
- `rea.cmd inspect-wasm-artifact <worktree>\web-runtime\frame-host\dist\frame_loop.wasm --format json`: normal SHA256 `32d4313e0ab8c27a6146d132492bd2f773fdb7c817534d2d4fb54e5fc6d185a1`, provider `wabt-artifact`/WABT 1.0.42, evidence `ev_c04c20365c578b7eaa2371a7e3f2c16ce336d27661313b0af0bd165c7fa8f65a`, 66 exports, exactly one import `env.emscripten_resize_heap`.
- `rea.cmd inspect-wasm-artifact <worktree>\web-runtime\frame-host\dist\frame_loop_translated_stb_fixture.wasm --format json`: SHA256 `28f1d1669f13c14486feca1401a55836c2bb9cc4e0c3bcdbc6d36ae3ddba047a`, provider `wabt-artifact`, evidence `ev_1c48be46cd64f2fb099c6d213f93b0733068998e8e30cad80d5672c014c8dca7`, 68 exports, exactly one import.
- Exactly TWO fixture-only exports (no other differences): `nsmbw_mem_atomic_pair_write32` (linked only because staged pair commit uses it) and `nsmbw_loop_translated_store_spawn`. The normal public Wasm does NOT contain either, and neither Wasm exports `nsmbw_test_policy_install` or `nsmbw_test_policy_rejection`. All four normal translated CPU ABI exports (spawn_abi/FPSCR/GQR/layout) remain present.
- `rea.cmd inspect-managed-artifact ...\Translator.Cli.dll --format json`: SHA256 `73f4c3cf942c013680271ef86bfc6d76a666e22cfb7f67f28ca42892f608595f`, provider `rea-dotnet-static`, evidence `ev_22d14d927e2bb1363e2c2f2666b791ebbc8232d49448fb6fb036393b4093d075`. This is static PE/.NET CIL metadata only; separately the installed CLI executed for the source-generated C++ evidence.
- REA `validation=valid` certifies syntax/format, NOT PPC instruction semantics, memory/page rollback, browser correctness, Wii MMIO, OS, original code identity or boot.

`test/stb_export_boundary.test.mjs` independently checks actual module import/export shapes via `WebAssembly.Module.imports/exports` without requiring REA at test time. `test/translator_stb.test.mjs` exercises actual binary guest results for all four offsets (PPC big-endian), cached/uncached word, byte truncation and zero, end-of-page byte, unmapped/MMIO denial, quota0/1, later second-write rollback/no ghost pages, overlapping writes, three independent contexts and 128 guest resets. `test/translator_stb_browser.test.mjs` serves a *strict four-resource local allowlist* in actual Chrome/Brave, checks three contexts, second-step MMIO and quota rejection, 128 real requestAnimationFrame cycles, privacy deny and no console/HTTP errors.

## Next authentic Wii/runtime gates
Unimplemented: genuine OSGetTime/OSGetTick r3/r4 64-bit, general guest instruction dispatch, paired-single/FPR/GQR semantics, byte/halfword cross-page transaction, full HLE/device DMA/GX/IOS, native host fibers, original game source revision equality. Mario W01 original DOL mismatch and duplicate Unicode JSON auditor tests remain HARD STOP. Private Wii function experiments require Mario's verified file-provenance and independent reference comparisons; DO NOT upload Nintendo binaries or translated original code.
