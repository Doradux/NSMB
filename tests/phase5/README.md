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
