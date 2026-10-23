# Peach — Phase 12 independent W01 QA (synthetic, RED-first)

**Owner/worktree:** Peach; \`/home/marcos/NSMBcowork/worktrees/Peach-P12-W01\`;
branch \`agent/peach/phase12-w01-qa\` from public **W01 auditor \`110697c\`**.
This branch is **tests and documentation ONLY**. No production auditor or
Luigi/Toad helper modified; main and Mario's integration untouched.

Everything is generated entirely from invented tiny 0x160 byte DOLs,
synthetic MAP entries, invented REL sections and translator summaries.
Never access, encode, copy or publish the user's Nintendo DOL/REL/ISO,
translated game functions, private hashes or local sudo credentials.

## Run against an exact clean W01 checkout

Set \`NSMB_W01_AUDIT_ROOT\` to the candidate's *immutable, clean exact SHA*
directory. For a RED baseline use this own test worktree (\`110697c\`).
Never treat another agent's dirty source tree as a SHA-specific approval.

\`\`\`bash
cd /home/marcos/NSMBcowork/worktrees/Peach-P12-W01
export NSMB_W01_AUDIT_ROOT=/home/marcos/NSMBcowork/worktrees/Peach-P12-W01
export PYTHONDONTWRITEBYTECODE=1
python3 -B -m unittest discover -s tests -p 'test_audit*.py' -v
python3 -B -m unittest discover -s tests/phase7 -p 'test_audit_*.py' -v
python3 -B -m unittest discover -s tests/phase9 -p 'test_w01_rel_duplicates.py' -v
python3 -B -m unittest discover -s tests/phase10 -p 'test_w01_*.py' -v
python3 -B -m unittest discover -s tests/phase12 -p 'test_w01_*.py' -v
\`\`\`

Peer published test modules (do **not** silently duplicate/copy or change):
Luigi \`c55dc33\`, \`tests/phase10/test_w01_evidence_boundary.py\`,
Toad \`117f1fe\`, \`tests/phase10/test_w01_rel_structure.py\`.
Execute them in a **separate temporary test dir** with
\`PYTHONPATH=$NSMB_W01_AUDIT_ROOT/scripts\`; make every comparison against
the SAME clean candidate and re-run all positives.

### Actual independent Ubuntu baseline on auditor 110697c (2026-10-23)

| Suite | Total methods | Result |
|---|---:|---|
| Original auditor author \`tests/test_audit*.py\` | 31 | **31 PASS** |
| Peach phase7 fail-closed | 18 | **19 FAIL assertions** across the methods |
| Peach phase9 REL duplicate JSON | 5 | **4 FAIL** |
| Peach phase10 ambiguous executable / probe | 10 | **7 FAIL** |
| Peach phase12 extra boundary cases | 12 | **2 PASS / 10 FAIL** |
| Luigi phase10 published tests, unchanged | 15 | **8 FAIL** |
| Toad phase10 published tests, unchanged | 6 | **4 uncontrolled ERRORs** |

No skipped cases. A phase7 count of 19 is assertion failures including
subtests, not 19 distinct test methods. Failures are **evidence of
vulnerability in OLD auditor**, not accepted final results.

### Specific new Phase12 oracles

- Positives independently validate complete synthetic numeric
  \`entryPoint\` and canonical \`0x...\` string entry points.
- Reject a fractional-but-truncatable function PC; reject strings with
  Python-only plus prefixes and numeric underscores; detect *identical*
  duplicate keys in a nested function object (same value still
  ambiguous / no JSON shadowing allowed).
- Reject extra malformed REL sections with \`exec\` as integer/string,
  even when all visible executable function coverage remains valid;
  reject Python-only permissive plus-prefix addresses and underscore
  sizes, while preserving a valid ordinary REL.
- Reject analogous permissive MAP number formatting. Test requires
  canonical evidence grammar rather than allowing Python's \`int()\`
  special syntax. These are intentionally narrow POLICY assertions,
  and reviewers should assess this policy, not alter expectations to
  make the existing auditor green.

**Static gate**: original pinned Wii DOL SHA mismatch remains a separate
HARD STOP even if all synthetic tests eventually become green. A
\`--probe\` investigation of an explicit checksum mismatch does NOT
certify source identity nor allow missing/ambiguous MAP, metadata, REL.
Source-identity certification is distinct from a running Wii function.

### Approval requirements

1. Luigi and Toad submit new helper **CLEAN published SHAs** and
   independent critical reviews on the newest QA exact SHA.
2. Mario integrates helper source in **his own branch only**, publishes
   NEW clean W01 SHA. Retest full baseline, original author tests,
   peer suites, Phase12 new cases and CLI exit codes against exact SHA.
3. Require expected **GREEN** on all synthetic positives and negatives
   with zero skipped; no \`AttributeError\`, uncontrolled exceptions or
   fake hash-profile waiver. Mario must separately verify actual owned
   DOL/profile version **privately** before any authentic PPC execution.
4. Only Mario integrates to main, and only once all gates pass.
