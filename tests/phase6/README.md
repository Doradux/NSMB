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
