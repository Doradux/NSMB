# Peach Phase 6 — independent fail-closed QA

Owner Peach; public main base 391e368; isolated branch
agent/peach/phase6-atomic-qa. No edits to main or other agents'
worktrees. Only Mario merges to public main.

## W01: old clean SHA110697c remains CHANGES REQUESTED

Run from the independent phase6 QA worktree after choosing the
exact clean committed auditor SHA:

    $env:NSMB_W01_AUDIT_ROOT='C:\NSMBcowork\worktrees\Peach-Phase5-W01-Audit'
    python -m unittest discover -s tests/phase6 -p 'test_audit_*.py' -v

The old Mario 110697c causes 15 methods, 16 failed assertions/subtests
(expected RED), while its original authored 31 tests pass. All
fixtures exclusively build a 0x160-byte fake DOL in memory; absolutely
no actual Nintendo original files/bytes/hashes are used.

Previous fail-closed checks: ambiguous duplicate YAML inputs and
translation mapping, ignored second entry point, float JSON
entryPoint silently converted to a valid integer, probe wrong SHA
with missing MAP/metadata erroneously exit0. Positive controls
still validate complete synthetic typed static coverage and exact
source hash, rejects missing counters and overlapping executable
physical image ranges.

New reviewer tests:
- repeated JSON quality.unsupportedInstructionCount: first 1, -1,
  null, string or true; second 0: json.loads silently keeps last and
  reports strict true
- repeated top-level functions arrays, first unmapped then good:
  strict false is mandatory
- duplicate entryPoint inside one function object, first unmapped
  then valid: strict false is mandatory
- noninteger/out-of-bounds function entries reject while valid extra
  translated function address inside DOL section is acceptable
- adjacent nonoverlapping DOL sections remain legal

Duplicate JSON object keys should be rejected at parsing time;
post-validation cannot recover the overwritten earlier value.
A fixed synthetic W01 audit is necessary but NOT sufficient to
reconcile the owner's mismatched original DOL pinned identity, or
to prove gameplay or boot.

## Other Phase6 review targets

P1 Toad clock: on old daf2b69, prior Peach phase5 QA
tests/phase5/tick-ownership.test.mjs @1215b1c runs four real-Wasm
checks with 2PASS2FAIL: duplicate ESM URL loads circumvent module WeakSet
and host-only clock.reset permits guest word to regress 200->100
without actual W03/W04 guest reset. Require all4 PASS and real Chrome
author tests on new exact clean SHA before main integration.

P2 Luigi source-generated STW: require actual upstream public C# CLI
on tiny fictional PowerPC inputs, inspect real generated C++, build
with Emscripten, execute Node+actual Chrome. Test strict physical RAM
aliasing, big-endian stores, quota0, MMIO/GX fail-closed and no side
effect replays, late second-fault rollback of BOTH guest RAM and PC/GPR,
three contexts, 128 restarts, absence of test knobs from normal Wasm.
If atomic guest write cannot be provided, reject unsupported translated
store patterns BEFORE any guest mutation. Never cast raw Wii addresses
into host Wasm pointers or publish original game contents.

Independent peer review of this QA branch requested from Luigi and
Toad. Only Mario merges; no original DOL/REL/RVZ, Nintendo art or
real proprietary compiled source enters Git.


## 15 October: clock f295b84 independently checked with REAL Wasm

Clean detached exact Toad SHA f295b84 worktree:
C:\NSMBcowork\worktrees\Peach-Phase6-Toad-Review.
Rebuilt synthetic C++ joined_tick.wasm via local Emscripten.
Toad author runtime-services tests 44/44 PASS zero skipped incl
actual Chrome; previous Peach phase5 tick-ownership tests 4/4
PASS with the prior duplicate ESM and host-only reset regressions.

Independent NEW phase6/clock-facade-ownership.test.mjs 1/2 PASS,
1 FAIL. This is a separate loophole in the API's accepted structural
module/provider contract: two independent JavaScript facade objects
can each bind _nsmbw_services_tick_store32/status/W03 counters to
the SAME underlying actual Emscripten module and each register its
own nonconfigurable clock ownership Symbol. clockA publish 200 then
clockB publish 100 writes visible guest 0x80008000 to 100 without
legitimate low32 wrap. Neither host operation reports failure.
A canonical native C++ owner claim or explicit rejection of facades
before any side effects is required to warrant 'one clock per Wasm'.
Outside-Git reproducer:
C:\NSMBcowork\notes\Peach-phase6-clock-facade-repro.mjs
Formal W07 Peach f295b84 CHANGES REQUESTED:
C:\NSMBcowork\reviews\2026-10-15T10-04-24-512Z_Peach_to_W07_7cf8bc10.md

Run:
    $env:NSMB_PHASE6_TICK_ROOT='C:\NSMBcowork\worktrees\Peach-Phase6-Toad-Review'
    node --test tests/phase6/clock-facade-ownership.test.mjs

## Phase6 actual translated STW test-first engineering suite

tests/phase6/translated-store-atomicity.test.mjs contains four
independent Node tests intended for the NEXT clean Luigi source
commit, never a JS-emulated game. They require an actual generated
synthetic C++ func_80001000(CpuContext*) containing FlatWrite32 and
an Emscripten test-only frame_loop_translated_store_fixture.wasm.
Strict requirements: two cache aliases coalesce and write big-endian;
late quota failure after first successful W04 write restores prior
RAM word, PC and register set; MMIO second destination never mutates
earlier RAM or invokes callback; failed guest is isolated from
successfully dispatched independent guest; 128 real reset/reap cycles.

Against CURRENT main391e368, these four tests correctly FAIL before
execution because the actual source-generated STW fixture is not
present. This is intentionally RED-FIRST rather than a claimed CPU
regression. Once Luigi publishes a NEW clean exact SHA, rebuild the
public synthetic PowerPC with actual installed C# Translator.Cli,
inspect emitted C++ and repeat four tests and author true Chrome
suite before approving. No changes made to Luigi's dirty worktree.


## Phase6 Luigi source-generated transactional writes 3f81e8d reviewed

Independent exact clean SHA3f81e8d at
C:\NSMBcowork\worktrees\Peach-Phase6-Luigi-Audit.
Executed actual public precompiled upstream C# Translator.Cli on a
new 280-byte copyright-free DOL with synthetic guest PPC STW, STW,
BL, BLR, ADDI, BLR. Read actual generated C++ CpuContext* entry,
both FlatWrite32 calls, and helper inlining. Linked with authorized
Emscripten into real Emscripten synthetic fixture Wasm (no original
game bytes). Author suite 10/10 PASS zero skipped incl real Chrome.
Peach independently ran translated-store-atomicity.test.mjs:
**4 PASS, 1 FAIL** on real Wasm.

NEW critical RED source-generated write regression: initial sparse
W04 pages=0, budget=1, guest stores to TWO DIFFERENT new RAM pages
0x80010000 and 0x80011000. First commit allocates first new page,
second fails quota3. The journal reverses first word back to 0 but
DOES NOT free the newly allocated sparse page. Actual
{pagesAfterAbort:1, canWriteFreshPage:0}, expected
{pagesAfterAbort:0, canWriteFreshPage:1} where unrelated follow-up
fresh-page write is to 0x80012000. PC and GPR are preserved,
guest word is zero, and device callback count remains zero: the
bug is leaked resource quota under failed transactional writes, not
partial byte data. Repeat failures can starve the checked guest.
Author's old late-failure test seeded the first RAM page upfront
and consequently missed the new-page resource leak.

Fix requires full sparse allocation preflight/atomic reservation or
rollback page allocations, not only restore word bytes. Do not
replay device side effects, promote MMIO to RAM, or report gameplay.
Formal W03 Peach 3f81e8d CHANGES REQUESTED:
C:\NSMBcowork\reviews\2026-10-15T10-11-56-792Z_Peach_to_W03_a86e7379.md
Luigi and Mario notified, new clean SHA required.


## Additional INDEPENDENT real Chrome 320px 128-frame STW rollback

tests/phase6/translated-store-diagnostic.html and
tests/phase6/translated-store-browser.test.mjs run a 3-resource exact
HTTP allowlist (HTML, actual generated C++ Wasm module JS and Wasm
binary) with no original game data exposed. Headless REAL Chromium
CDP at 320px executes **128 distinct requestAnimationFrame callbacks**:
32 correct cached/uncached 32-bit STW stores, 32 late quota faults
with already allocated first page, 32 MMIO-denied second destinations,
and 32 late quota faults with first NEW sparse RAM page.

Run on marcos:
    $env:NSMB_PHASE6_STW_ROOT='C:\NSMBcowork\worktrees\Peach-Phase6-Luigi-Audit'
    node --test tests/phase6/translated-store-browser.test.mjs

Exact clean Luigi3f81e8d: actual Chrome reaches all128 RAF frames,
32 valid stores, 96 typed fault operations and observes
ghostFailures=32, expected0 (test FAILS). No false console 404
favicon error (explicit data URI icon), 320px viewport and exact
resource route deny remain required. Memory/read/GPR/PC checks are
performed inside every actual RAF. This is a deterministic severe
sparse-page quota leak under partial rollback, NOT a proven leak in
authentic Nintendo code or arbitrary imported native operations.
Do not approve until corrected SHA passes 5/5 independent Node and
1/1 independent true Chrome with ghostFailures0, all authored tests,
and independent peer review.


## Corrected Luigi STORE ABI ed6170f — independently APPROVED synthetic only

Exact CLEAN detached SHA ed6170f:
C:\NSMBcowork\worktrees\Peach-Phase6-Luigi-FixReview,
independent public 280-byte fake DOL generation → actual upstream
precompiled Translator.Cli .NET 8 → unedited generated CpuContext*
C++ two STW+inlined BL/BLR → Emscripten compiled one synthetic Wasm.
Independently reviewed test-only guest_memory.cpp
nsmbw_mem_atomic_pair_write32 which checks BOTH sparse page quota
requirements before any mutation, stages both new pages as unique_ptr,
commits only when all allocations are successful, and never routes
unsupported MMIO through native callback. Test-only #ifdef prevents
this proof from becoming a generic public Wii memory API.

Full frame-host and Phase3 authored tests **68/68 PASS ZERO skips**
including true Chrome and typed W07 regressions. Peach external actual
Wasm translated-store-atomicity.test.mjs **5/5 PASS**; formerly red
two-NEW-page quota failure now returns mem_pages0 and permits unrelated
page creation with unchanged budget. Independent Chrome 320px
translated-store-browser.test.mjs **1/1 PASS ZERO skips** with
128 real RAFs, 32 valid STW writes, 32 existing-page quota faults,
32 denied MMIO outputs, and 32 previously leaky two-new-page
transactions; ghostFailures0, no test/mock or original file exposed.

Formal W03 Peach ed6170f APPROVED strictly bounded synthetic ABI:
C:\NSMBcowork\reviews\2026-10-15T10-20-07-885Z_Peach_to_W03_46d8fc1f.md
Only Mario merges main after his own source/provenance gates.
NO original Nintendo DOL/REL/code, no real game boot, no real Wii
OS/HLE, dynamic generic translated stores, FPR, or native pointer
ABI is supported by this approval.
