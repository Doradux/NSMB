# Peach Phase5 W01 independent synthetic acceptance

Copyright-free synthetic QA only. No Nintendo DOL, REL, original ROM,
translated game code, executable extracts, original pinned hashes or local
toolchain payload should enter GitHub.

Published main dabf76a, 15 Oct 2026. Independent auditor review exact
agent/mario/w01-negative-regressions SHA 110697c in clean detached
Peach-Phase5-W01-Audit (the dirty Mario-W01 worktree was NEVER edited).
Author suite: 31/31 PASS synthetic.

## RED-first peer QA

Run on authorized marcos from this QA branch:

    $env:NSMB_W01_AUDIT_ROOT='C:\NSMBcowork\worktrees\Peach-Phase5-W01-Audit'
    python -m unittest discover -s tests/phase5 -p 'test_audit_failclosed.py' -v

Against 110697c: 9 test methods, 4 PASS, 5 FAIL, 8 failing subcases.
All fabricate a minimal 0x160 byte DOL exclusively in memory; no game
contents are used.

Previously untested red gates:
1. Duplicate translation mapping redefines entry_points; auditor still
   uses first subtree and marks strict TRUE.
2. Duplicate inputs subtree with no dol.sha256 preserves stale first SHA
   while a YAML reader could use the last subtree: reject ambiguity.
3. Multiple translation.entry_points list items: the second unmapped
   guest address is silently ignored, strict TRUE.
4. JSON metadata.functions[].entryPoint floats 2147500036.0 and
   2147500036.75 are int()-truncated into valid covered address
   0x80004004, strict TRUE. Require exact integer or strict hex string.
5. CLI --probe on wrong hash and MISSING MAP and/or translation metadata
   exits 0 despite coverage_evidence_complete=false and
   strict_compatible=false. Probe may waive only original SHA mismatch
   for read-only investigation, not absent coverage evidence.

Positive controls: exact synthetic MAP+metadata+hash passes;
wrong hash and FULL coverage --probe may exit 0 but remains strict false;
negative, boolean and float quality, DOL virtual overflow, duplicate
physical file offsets, empty MAP and unmapped translated address reject.
Properly typed EXTRA translated function in executable DOL section is
allowed.

Formal independent review exact 110697c:
C:\NSMBcowork\reviews\2026-10-15T08-20-56-865Z_Peach_to_W01_98bebe30.md
Status CHANGES REQUESTED. No W01 public merge until new exact clean SHA
and both author + independent tests pass. No original DOL source
provenance and no playable Wii game proof.

Owner Peach alone edits tests/phase5 in its independent branch. Request
Luigi/Toad critical peer review of these test oracles; Mario-only main
merges. No other agents' worktrees modified.


## Secondary Phase4 public-surface audit (published main dabf76a)

Reviewer-added phase4-public-surface.test.mjs independently checks the
ACTUAL published Node server.js plus compiled normal WebAssembly, not
test-only JavaScript mock memory.

Command from this branch:
    $env:NSMB_PHASE5_PUBLIC_ROOT='C:\NSMBcowork\worktrees\Peach-Phase5-QA'
    node --test tests/phase5/phase4-public-surface.test.mjs

**2/2 PASS, zero skipped**. Normal Emscripten module has no
_nsmbw_test_policy_install / rejection / calls / last-region callback
export, but has real CPU+shared guest input exports. 128 repeat
loop_reset/input-write cycles preserve exactly one backing page while
running and zero after reset; no stale guest READY/DONE/trace slots.
Separate TEST fixture module exists on disk but must not be publicly
served.

Actual production server launched on localhost in a temporary child
process; GET/HEAD of private/test/mock/source/fixture/dol/rvz paths,
encoded traversal and case changes are denied 404, malformed percent
encoding is 400. Allowlisted real compiled normal .wasm gets correct
MIME and Wasm magic; query params cannot change its bytes. Child is
terminated and process status checked. Published site regression
tests/browser/harness + regression: 14/14 PASS, zero skips incl actual
Chrome desktop/mobile, no JavaScript console errors. Phase4 runtime
compiled host tests: 39/39 PASS, zero skips including Chrome and
typed test-only callback isolation.

This proves ONLY the checked public synthetic surface. It does not
prove authentic Wii content confidentiality in any external service,
nor true gameplay, HLE or the owner DOL hash.


## Toad Phase5 synthetic virtual clock: independent review

Toad public branch agent/toad/phase5-wii-runtime-services initial
SHA 988d380. Peach CLEAN detached checkout
C:\NSMBcowork\worktrees\Peach-Phase5-Tick-Audit, real authorized
C++ Emscripten build joined_tick.wasm, authored Node + actual Chromium
suite 9/9 PASS, zero skipped. Source gap inventory notes correctly that
this is a checked 32-bit virtual tick snapshot, NOT actual OSGetTime
64-bit PPC r3/r4, interrupts, IOS/HLE or gameplay.

Additional new QA-only tests/phase5/tick-ownership.test.mjs:
    $env:NSMB_TOAD_PHASE5_ROOT='C:\NSMBcowork\worktrees\Peach-Phase5-Tick-Audit'
    node --test tests/phase5/tick-ownership.test.mjs

Against exact 988d380: 1 PASS, 1 FAIL; no skips. PASS actual Wasm low32
wrap, cached/uncached byte identity, quota zero and retry. FAIL virtual
clock ownership across independently created host adapters sharing the
same physical W04 tick word. Clock A address 0x80008000 publishes
200n, clock B address 0xC0008000 publishes 100n; guest memory visibly
decreases 200 -> 100 and both writes report status=0. A per-adapter
monotonic guard does not guarantee a single guest-visible timebase.
A valid fix either rejects duplicate clock handles on same module and
physical aliased address, or shares monotonic arbitration across them;
do not silently regress guest tick in a nonwrapping 32-bit interval.
The normal intentional wrap across 2^32 is separately tested.

Formal independent review exact 988d380 CHANGES REQUESTED at
C:\NSMBcowork\reviews\2026-10-15T08-30-41-048Z_Peach_to_W07_26487b37.md
Toad/Mario notified. No original game bytes were examined and no
peer worktree edited. Await NEW clean author SHA for re-review.


## Second virtual clock hardening review: exact Toad daf2b69

Toad's daf2b69 introduced a module-level WeakSet to reject another
clock on the same Emscripten module within ONE JavaScript module
evaluation. Peach clean-detached this exact SHA into
Peach-Phase5-Tick-FixReview, rebuilt real C++ joined_tick.wasm.
Author Node + true Chrome tests: 10/10 PASS, zero skips. Peach
initial tick checks: 2/2 PASS after fix.

A further independent REPRO on the SAME Wasm object shows this is
not truly per-Wasm exclusive when multiple ESM copies load the
adapter: standard dynamic imports of tick_host.mjs?peachOwner=A and
tick_host.mjs?peachOwner=B create TWO module-local WeakSets. Each
accepts an independent clock handle targeting the same W04 cached/
uncached tick address pair 0x80008000 / 0xC0008000. Host first
publishes 200, second publishes 100, actual checked C++ guest word
regresses 200->100 (not a legitimate low32 wrap) and both statuses
are success.

Reviewer-owned tick-ownership.test.mjs adds this RED scenario:
2 PASS, 1 FAIL against exact clean daf2b69.
Independent reproducer outside Git:
C:\NSMBcowork\notes\Peach-phase5-tick-duplicate-esm-repro.mjs
Formal W07 Peach CHANGES REQUESTED exact daf2b69:
C:\NSMBcowork\reviews\2026-10-15T08-36-27-717Z_Peach_to_W07_7a4a7ae0.md

Fix must enforce timebase ownership bound to the underlying guest
Wasm instance or explicit host capability, independently of JS
module import identity; aliasing must remain canonical. Original
Wii 64-bit OSGetTime/interrupt semantics are STILL UNIMPLEMENTED.


## Verified actual public C# Translator → synthetic PowerPC → WebAssembly ABI

Luigi exact new public synthetic ABI branch SHA 702eb3b; Peach
created a NEW independent clean detached reviewer worktree at
C:\NSMBcowork\worktrees\Peach-Phase5-Luigi-Audit. Rebuilt Emscripten
normal, TEST-only typed callback and Asyncify Wasm; executed actual
precompiled public upstream Translator.Cli .NET8 .dll through
build_translator_fixture.ps1 using a newly generated **264-byte
copyright-free** DOL with exactly two public-invented big-endian PPC
instruction words addi r3,r3,1 + blr.

Genuine C# translator emitted a real generated_functions/
func_80001000.cpp (ignored in Git), signature
extern "C" void func_80001000(CpuContext* MKW_RESTRICT ctx),
r3=(r3+1), ctx->gpr[3]=r3, explicit gpr_read/write mask 0x8.
Peach read that exact generated C++ and verified source-only
upstream runtime/include/isa/ppc_isa_context.h alignment/fields.
Compiled that unmodified generated C++ with checked W04/W07/W03
host into one separate TEST-only frame_loop_translated_fixture.wasm;
normal browser frame_loop.wasm neither exports fake test MMIO knobs
nor test-generated translated spawn.

Author frame-host and Phase3 tests **52/52 PASS, 0 skipped** incl
real headless Chrome running generated guest C++, and Peach Phase4
independent QA suite **16/16 PASS** incl real Chrome320 / 128+128
RAF on normal synthetic Wasm. Peach new code
tests/phase5/translator-abi.test.mjs **2/2 PASS**, actual translated
fixture (3 CpuContexts, PC/LR/r1/r2/r13/r3, unsigned 32-bit wrap,
physical cached/uncached stack overlap rejection, eight-slot
saturation, guest ID reuse/reap, no unexpected RAM pages). Run:

    $env:NSMB_LUIGI_PHASE5_ROOT='C:\NSMBcowork\worktrees\Peach-Phase5-Luigi-Audit'
    node --test tests/phase5/translator-abi.test.mjs

Formal W03 Peach 702eb3b APPROVED SYNTHETIC ONLY:
C:\NSMBcowork\reviews\2026-10-15T08-42-19-386Z_Peach_to_W03_f794e3d3.md.

Important boundary: actual public precompiled Translator.Cli ran on
a fake DOL, but the .NET SDK is not installed, so no fresh C# build.
This is NOT translated original NSMBW, no 4GiB MemoryInline,
state-free function calls, FPR/paired-single, device HLE, native
dispatch registry, Wii guest fibers or boot. No owner private file,
original hash or extracted game data was read, generated or published.
W01 original DOL identity still mismatched and is BLOCKED.

## Additional guest-time regression: host-only reset

Luigi independently found a separate regression on Toad exact
daf2b69: publishing 200 ticks to the real Wasm guest RAM then calling
clock.reset(0n) (which resets only JS bookkeeping, not guest contexts/
memory) permits publish(100n) and silently regresses the same visible
time word to 100. Peach confirmed with its own independent real-Wasm
regression test added to tick-ownership.test.mjs.

Exact clean daf2b69: 4 reviewer-owned tick tests now 2 PASS, 2 FAIL:
ESM-duplicate-module WeakSet bypass and host reset-without-guest-reset
rewind. The global current-authority test and low32 legitimate wrap
still pass. Luigi formal W07 review for this second failure:
C:\NSMBcowork\reviews\2026-10-15T08-44-35-629Z_Luigi_to_W07_5651a9ad.md

This is **not** a high-fidelity Wii OS clock assertion, just
guest-visible monotonicity in one synthetic checked W04 RAM clock
epoch with no 2^32 low-word rollover. Host reset must be either
fail-closed until verified guest module epoch reset, or part of an
explicit atomic guest reset. Toad and Mario informed.
