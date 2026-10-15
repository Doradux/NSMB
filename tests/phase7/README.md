# Peach Phase7 — independent source/ABI and public privacy gates

Base main 37c916e, own isolated branch agent/peach/phase7-strict-qa.
All fixtures are NEW tiny invented synthetic PPC inputs. Never put
original Nintendo Wii DOL/REL/RVZ, original translated game code,
private executable identities, credentials or game assets in Git.
Only Mario merges to main.

## P0 W01 original source identity — BLOCKED

Mario W01 RedTests worktree DIRTY at published 110697c: do not write.
Run reviewer-owned red-first tests against CLEAN detached old 110697c:

    $env:NSMB_W01_AUDIT_ROOT='C:\NSMBcowork\worktrees\Peach-Phase5-W01-Audit'
    python -m unittest discover -s tests/phase7 -p 'test_audit_*.py' -v

Old 110697c 18 test methods, 19 failing assertions/subtests
(expected RED, NOT actual successful acceptance). The original
15 methods detect duplicate YAML profile mappings, ignored guest
entrypoint, float-into-int metadata, unsafe zero exit with wrong
hash and missing MAP/translation evidence, duplicate JSON
quality/functions/entrypoint fields. Three NEW methods additionally
reproduce JSON canonical Unicode escaped key aliases (entryPoint
encoded with U+0050 P; unsupportedInstructionCount with U+0043 C)
and duplicated entire quality object. Old json.loads silently
last-wins and reports strict_compatible true and status0 despite
invalid/missing first evidence. Positive fake 0x160byte DOL case
must pass. NEW CLEAN Mario SHA must pass all plus original authored
31+ tests. Even a fully green auditor cannot waive owner's mismatched
original pinned DOL provenance.

## P1 Toad virtual clock — BLOCKED f295b84

    $env:NSMB_PHASE6_TICK_ROOT='C:\NSMBcowork\worktrees\Peach-Phase6-Toad-Review'
    node --test tests/phase7/clock-facade-ownership.test.mjs

Old exact f295b84 actual compiled C++ Emscripten runtime:
1 PASS / 1 FAIL. Two distinct valid JS structural provider facades
delegate calls to the SAME native module; each gains a separate
nonconfigurable clock ownership symbol on facade (not underlying
Wasm); two guest writes 200 and 100 to aliased RAM both succeed
with status0. New clean Toad SHA must canonically enforce ownership
on underlying guest OR reject forwarding facades before any mutation.
Also rerun prior Peach 4 clock tests plus authored real Chrome/Node
and new wrapper case; 32-bit synthetic time is NOT actual Wii OS time.

## P2 Luigi STW -> LWZ compiler denial — negative-only APPROVED

Luigi exact clean 02378c5 in Peach-Phase7-RAW-Audit. Fresh actual
public precompiled .NET8 Translator.Cli on NEW invented 268byte PPC
DOL generated unmodified C++ func_80001000(CpuContext*) with
FlatWrite32(r4,r3), then FlatRead32(r4), then ctx->gpr[5]=r5.
Because the write is pending in narrow Phase6 journal, a naive
RAM read would observe OLD data. The checked safe FlatRead32
journal forwarding does NOT yet exist: author script and Peach
independently invoked real Emscripten -fsyntax-only. It exits 1
for exact missing FlatRead32, not an unrelated syntax error.
Formal W03 Peach review exact 02378c5:
C:\NSMBcowork\reviews\2026-10-15T12-09-42-288Z_Peach_to_W03_f0740b78.md
APPROVED source-only FAIL-CLOSED compiler denial; NO runtime Wasm
or genuine Chrome execution for this unsupported sequence.

Independent positive proof of that NEGATIVE gate regenerates actual
synthetic DOL + actual C# translated C++ + exact compile rejection:

    $env:NSMB_PHASE7_READWRITE_ROOT='C:\NSMBcowork\worktrees\Peach-Phase7-RAW-Audit'
    $env:NSMB_EMSDK='<authorized local SDK path>'
    $env:NSMB_TRANSLATOR_CLI='<public upstream Translator.Cli.dll>'
    node --test tests/phase7/readwrite-negative.test.mjs

1/1 PASS zero skips. New positive Luigi SHA must instead prove
journal read-your-write with cached/uncached alias, zero, quota
page preflight and rollback, no MMIO replay, PC/GPR, 3 contexts,
128 TRUE Chrome RAF, no test-only production Wasm symbols.

## P3 normal public preview privacy and identity

    $env:NSMB_PHASE7_PUBLIC_ROOT='C:\NSMBcowork\worktrees\Peach-Phase7-QA'
    node --test tests/phase7/public-surface.test.mjs tests/phase7/public-release-policy.test.mjs

5/5 PASS zero skips. Tested real localhost production server and
actual C++ normal Emscripten Wasm, 128 reset/input-store cycles,
MIME/magic, fixed exact-route allowlist, no serving of private,
source C++, Python, generated store/lwz fixture or test-policy
Wasm, malformed percent encoding rejected, HEAD private denied,
query cannot replace normal .wasm, no leaked test callbacks.
Git tracked filenames include zero .dol/.iso/.rvz/.wad/other
game executable containers or private dump folders. Only checked
Git metadata; no proof of unseen external service contents.
Landing clearly says NO playable original and demo reference
is conceptual. Separately main37c916e full 14/14 web real Chrome
and 68/68 host/Phase3 Node+Chrome PASS zero skipped when
NSMB_W03_HOST_ROOT resolves real reviewed worktree.

Request Luigi and Toad critical independent review of exact Peach
QA commit; only Mario integrates. Report synthetic diagnostic, NOT
playable authentic NSMB Wii.


## Phase7 NEW clean Toad 2af7bd9 — independent synthetic APPROVAL

Clean detached exact 2af7bd9 at Peach-Phase7-Toad-Review;
recompiled actual public C++ Emscripten joined_tick.wasm.
Native tick_snapshot.cpp shares one irreversible owner claim across
normal JS adapters, ESM query URL duplicates, and multiple structural
JS facades of the SAME native Wasm module. Exact host control
request is NOT a Wii guest address; it cannot allocate checked RAM
or invoke MMIO/device callback. Native owner persists despite W03
reset; independent WebAssembly module instances remain independent.
Recomputed tests:
- Author runtime-services real Node+Chromium 48/48 PASS, zero skips.
- Prior Peach old clock4/4 + external facade2/2 PASS actual Wasm.
- NEW independent clock-native-claim.test.mjs 3/3 PASS: fake magic,
  direct duplicate native claim, raw adapter claim after reset,
  two real independent Wasm instances and alias isolation.
- Host+interop regression 64/64 PASS zero skips incl real Chrome.

Formal W07 Peach APPROVED strict source-only synthetic clock:
C:\NSMBcowork\reviews\2026-10-15T12-21-15-659Z_Peach_to_W07_de8250b5.md
Still NO authentic Nintendo OSGetTime/IRQ/device hardware ABI,
untrusted JavaScript sandbox, or original-game boot.

Run additional reviewer tests on NEW Toad SHA:
    $env:NSMB_PHASE7_TICK_ROOT='C:\NSMBcowork\worktrees\Peach-Phase7-Toad-Review'
    node --test tests/phase7/clock-native-claim.test.mjs

## Phase7 NEW clean Luigi 4f22510 — independent synthetic APPROVAL

Clean detached exact 4f22510 at Peach-Phase7-Luigi-Review;
regenerated NEW 272-byte four-op invented PowerPC DOL via
actual PUBLIC precompiled upstream .NET8 Translator.Cli and built
unedited generated C++ with authorized Emscripten Wasm.
Generated order STW r3,0(r4); LWZ r5,0(r4); STW r3,0(r6); BLR.
FlatRead32 forwards latest already staged *physical* guest word
from narrow two-entry journal even when cached/uncached addresses
alias. Errors deny memory/device side effects and do not commit
CpuContext PC/GPR5, W04 atomic pair preflights both new pages.
Tests:
- Author real Node+Chromium 10/10 PASS zero skips incl 128 RAF.
- Independent NEW readwrite-adversarial.test.mjs 3/3 PASS on actual
  compiled Wasm: MEM2→MEM1 staging and endian, zero-safe GPR
  rollback for 4 hostile MMIO/unmapped/unaligned/overflow second
  addresses, and exact last aligned MEM1 word 0x817FFFFC alias
  with two new pages.
- Entire frame-host+Phase3 78/78 PASS zero skips incl REAL Chrome.

Formal W03 Peach APPROVED for the EXACT FOUR SYNTHETIC 32-bit
instruction pattern, not generic Wii translation:
C:\NSMBcowork\reviews\2026-10-15T12-21-20-112Z_Peach_to_W03_2b25f34c.md
No original commercial code, Wii HLE/GX/IOS or gameplay.

Run additional independent peer tests:
    $env:NSMB_PHASE7_READWRITE_ROOT='C:\NSMBcowork\worktrees\Peach-Phase7-Luigi-Review'
    node --test tests/phase7/readwrite-adversarial.test.mjs

The earlier readwrite-negative.test.mjs remains a HISTORICAL
fail-closed compiler oracle for OLD 02378c5 only; it is expected to
stop passing if run against 4f22510 because the new audited narrow
FlatRead32 is now intentionally implemented. Always bind each suite
to the intended exact clean review candidate SHA; never silently
relax or delete old regression evidence. Peer-review these two new
test files separately from owner implementation before Mario merge.
