# Peach Phase8 — independent REA + real WebAssembly ABI certification

Owner Peach; test-only branch agent/peach/phase8-abi-qa, public base
main 9f000e0. Real binaries on authorized Windows machine marcos.
No original Nintendo game binaries or copied translated Nintendo code.

## REA v6.5.0 exact evidence

PowerShell in own checkout:

    $env:NSMB_PHASE8_BASE_ROOT='C:\NSMBcowork\worktrees\Peach-Phase8-QA'
    $env:NSMB_PHASE8_CLOCK_ROOT='C:\NSMBcowork\worktrees\Peach-Phase8-ClockReview'
    node --test tests/phase8/rea-clock-abi.test.mjs

Latest Toad clock 5271f05 independently detached and rebuilt with
authorized Emscripten. Binary SHA unchanged:
b90618a8fe28211ba186cd51a8d2b45321d02de2bde1a68d1b592c68eb7cf1b8.
Normal main 9f000e0 frame_loop.wasm SHA:
32d4313e0ab8c27a6146d132492bd2f773fdb7c817534d2d4fb54e5fc6d185a1.

This test calls external C:\NSMBtools\rea.cmd (6.5.0) using
the WABT static provider and independently compares typed imported and
exported entries to WebAssembly.Module.imports/exports (including exact REA function parameter/result type signatures for every retained main export and the import), REA subject
SHA and normalized artifact SHA versus actual file hash.
Normal: 66 exports, one env.emscripten_resize_heap import.
Clock: 70 exports, same import. Added ONLY four tick exports:
nsmbw_services_tick_claim, nsmbw_services_tick_store32,
nsmbw_services_tick_status, nsmbw_services_tick_status_reset.
Both contain the four ACTUAL main CPU ABI symbols:
nsmbw_loop_cpu_spawn_abi, nsmbw_loop_cpu_fpscr,
nsmbw_loop_cpu_gqr, nsmbw_loop_cpu_abi_layout.
The checkpoint abbreviates three differently; tests use real names.
No mock-policy or translated-store test symbol in normal module.
2/2 PASS, zero skips.
Evidence IDs:
main ev_63b55b75912382ab369ef3bb8635f33c5f6cb9c65da8bb5e8133ec210f0cbe51
clock ev_4f45b606b22251fcc02ea30afbd21b3cdafa9bbd8b41da6572c8059e3067be35

Negative control: old 2af7bd9 clock in Peach-Phase7-Toad-Review
fails (1 PASS/1 FAIL), lacking required current CPU ABI symbols.

## Runtime independent verification
Toad 5271f05 clean detached Peach-Phase8-ClockReview compiled via
build_tick.ps1 and resulting SHA byte-identical. Entire Toad
runtime-services author Node+actual Chrome, historical Peach
phase5 clock and phase7 facade/native owner tests combined:
58/58 PASS, zero skips, including 128 Chromium frames, shared physical
clock aliases, cross-ESM and structural facade owner denial,
host-only reset restrictions, independent native Wasm instances,
MMIO/GX quota fail closed and multi-context input.
Main9f000e0 full host+Phase3 78/78 PASS Node/Chrome zero skips;
public/private web allowlist 5/5 PASS zero skips.
W01 original 110697c still fails 19 expected assertions in 18
synthetic Phase7 test methods; Mario dirty worktree untouched.
Original Wii DOL pinned source identity SHA remains mismatched.
Only Mario merges main after independent source review.

REA Wasm validity is STATIC ONLY: not semantically functional
PowerPC, not authentic Nintendo Wii 64bit OSGetTime or hardware,
not game boot, not a working/playable original Wii game.
Any future clock SHA requires fresh REA and Node/Chromium replay.


## New Luigi public source-generated STB milestone — exact SHA 768cb46

Independent clean detached worktree:
C:\NSMBcowork\worktrees\Peach-Phase8-Luigi-STB-Review.
Actual public Translator.Cli.dll on newly invented 268-byte 3-op PPC
DOL, STB r3,0(r4); STW r3,0(r6); BLR. Inspected GENERATED C++
CpuContext* and MemoryInline::FlatWrite8/FlatWrite32 in order.
Compiled unmodified generated C++ with authorized local Emscripten.
Exact synthetic fixture SHA256
28f1d1669f13c14486feca1401a55836c2bb9cc4e0c3bcdbc6d36ae3ddba047a
matched original checked-in binary before AND after independent build.
Checkout remains clean. No source-derived Nintendo game data used.

Author 16/16 Node + REAL Chromium PASS zero skips. Full host
and Phase3 94/94 PASS zero skips including genuine Chrome.
Reviewer-owned tests/phase8/stb-adversarial.test.mjs 3/3 PASS on real
compiled generated C++ Wasm: last MEM1 byte at 0x817FFFFF updates
only final BE lane with second STW on independent MEM2; first
unallocated STB then later same-physical-word STW coalesces at quota1
without ghost page; staged last-page byte and PC/GPR untouched when
later STW targets MMIO/GX and callbacks never execute.

Independent REA6.5.0 typed ABI test
tests/phase8/rea-stb-abi.test.mjs 1/1 PASS zero skips.
REA static fixture exactly preserves ALL normal main9f000e0
imports/exports and their kind/function typed parameter/result
signatures. Adds only test-only
nsmbw_mem_atomic_pair_write32 and nsmbw_loop_translated_store_spawn
(68 fixture vs 66 normal exports), no mock policy handlers, same
one env.emscripten_resize_heap import. REA WABT artifact SHA matches
Node crypto and actual committed bytes; candidate evidence ID
ev_570f8709dc2ef5a8adc4b80df0f0240ac02df667d8d17626164d254cfc45c571.
Run exact candidate:
    $env:NSMB_PHASE8_STB_ROOT='C:\NSMBcowork\worktrees\Peach-Phase8-Luigi-STB-Review'
    $env:NSMB_PHASE8_BASE_ROOT='C:\NSMBcowork\worktrees\Peach-Phase8-QA'
    node --test tests/phase8/stb-adversarial.test.mjs tests/phase8/rea-stb-abi.test.mjs

Scope is ONE checked 8-bit STB and later 32-bit STW on two
ordinary aligned MEM1/MEM2 RAM words under a synthetic C++ CPU
context. No generic STB/STH/lwz helper or 16-bit/64-bit cross-page
halfword, native Wii OS/IOS/GX/VI, real PowerPC game instructions,
original commercial DOL identity or boot proved. Mario-only main
merge after exact SHA critical peer review.
