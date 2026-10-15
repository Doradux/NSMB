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
