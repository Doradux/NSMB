# Peach — Phase 12 independent W01 QA (synthetic, RED-first)

**Owner/worktree:** Peach; `/home/marcos/NSMBcowork/worktrees/Peach-P12-W01`;
branch `agent/peach/phase12-w01-qa` from public **W01 auditor `110697c`**.
This branch is **tests and documentation ONLY**. No production auditor or
Luigi/Toad helper modified; main and Mario's integration untouched.

Everything is generated entirely from invented tiny 0x160 byte DOLs,
synthetic MAP entries, invented REL sections and translator summaries.
Never access, encode, copy or publish the user's Nintendo DOL/REL/ISO,
translated game functions, private hashes or local sudo credentials.

## Run against an exact clean W01 checkout

Set `NSMB_W01_AUDIT_ROOT` to the candidate's *immutable, clean exact SHA*
directory. For a RED baseline use this own test worktree (`110697c`).
Never treat another agent's dirty source tree as a SHA-specific approval.

```bash
cd /home/marcos/NSMBcowork/worktrees/Peach-P12-W01
export NSMB_W01_AUDIT_ROOT=/home/marcos/NSMBcowork/worktrees/Peach-P12-W01
export PYTHONDONTWRITEBYTECODE=1
python3 -B -m unittest discover -s tests -p 'test_audit*.py' -v
python3 -B -m unittest discover -s tests/phase7 -p 'test_audit_*.py' -v
python3 -B -m unittest discover -s tests/phase9 -p 'test_w01_rel_duplicates.py' -v
python3 -B -m unittest discover -s tests/phase10 -p 'test_w01_*.py' -v
python3 -B -m unittest discover -s tests/phase12 -p 'test_w01_*.py' -v
```

Peer published test modules (do **not** silently duplicate/copy or change):
Luigi `c55dc33`, `tests/phase10/test_w01_evidence_boundary.py`,
Toad `117f1fe`, `tests/phase10/test_w01_rel_structure.py`.
Execute them in a **separate temporary test dir** with
`PYTHONPATH=$NSMB_W01_AUDIT_ROOT/scripts`; make every comparison against
the SAME clean candidate and re-run all positives.

### Actual independent Ubuntu baseline on auditor 110697c (2026-10-23)

| Suite | Total methods | Result |
|---|---:|---|
| Original auditor author `tests/test_audit*.py` | 31 | **31 PASS** |
| Peach phase7 fail-closed | 18 | **19 FAIL assertions** across the methods |
| Peach phase9 REL duplicate JSON | 5 | **4 FAIL** |
| Peach phase10 ambiguous executable / probe | 10 | **7 FAIL** |
| Peach phase12 extra boundary cases | 14 | **2 PASS / 12 FAIL** |
| Luigi phase10 published tests, unchanged | 15 | **8 FAIL** |
| Toad phase10 published tests, unchanged | 6 | **4 uncontrolled ERRORs** |

No skipped cases. A phase7 count of 19 is assertion failures including
subtests, not 19 distinct test methods. Failures are **evidence of
vulnerability in OLD auditor**, not accepted final results.

### Specific new Phase12 oracles

- Positives independently validate complete synthetic numeric
  `entryPoint` and harmless extra upstream metadata fields.
- Reject a fractional-but-truncatable function PC; reject ambiguous string
  `entryPoint` values (including `0xHEX`, decimal, plus prefixes and numeric underscores); detect *identical*
  duplicate keys in a nested function object (same value still
  ambiguous / no JSON shadowing allowed).
- Reject extra malformed REL sections with `exec` as integer/string,
  even when all visible executable function coverage remains valid;
  reject Python-only permissive plus-prefix addresses and underscore
  sizes, while preserving a valid ordinary REL.
- Reject analogous permissive MAP number formatting. Test requires
  canonical evidence grammar rather than allowing Python's `int()`
  special syntax. These are intentionally narrow POLICY assertions,
  and reviewers should assess this policy, not alter expectations to
  make the existing auditor green.

**Static gate**: original pinned Wii DOL SHA mismatch remains a separate
HARD STOP even if all synthetic tests eventually become green. A
`--probe` investigation of an explicit checksum mismatch does NOT
certify source identity nor allow missing/ambiguous MAP, metadata, REL.
Source-identity certification is distinct from a running Wii function.

### Approval requirements

1. Luigi and Toad submit new helper **CLEAN published SHAs** and
   independent critical reviews on the newest QA exact SHA.
2. Mario integrates helper source in **his own branch only**, publishes
   NEW clean W01 SHA. Retest full baseline, original author tests,
   peer suites, Phase12 new cases and CLI exit codes against exact SHA.
3. Require expected **GREEN** on all synthetic positives and negatives
   with zero skipped; no `AttributeError`, uncontrolled exceptions or
   fake hash-profile waiver. Mario must separately verify actual owned
   DOL/profile version **privately** before any authentic PPC execution.
4. Only Mario integrates to main, and only once all gates pass.

**Definitive upstream ABI contract:** independent source inspection of
`upstream-nsmbw/translator/src/Translator.Core/Mods/BaseTranslationOutputMetadata.cs`
identifies `BaseTranslationFunctionMetadata.EntryPoint` as a C# `uint`.
The upstream metadata serializer therefore emits JSON numeric uint32,
NOT string `0xHEX`; REL layout address strings belong to a separate
schema. Luigi final helper `a4f4565` enforces this contract. Earlier
helper `121279a` had briefly allowed canonical hex for compatibility,
but public upstream type evidence superseded that assumption. Peach's
newly written Phase12 test now correctly requires even hex strings to
be rejected, while all original negatives remain unchanged.
Old audit baseline: 14 methods, 2 positive PASS and 12 negative FAIL.

## Independent HELPER reviews (not integrated W01)

- Luigi strict metadata clean `a4f4565`: **35/35 author PASS**, plus
  Peach's explicit `review_metadata_helper.py` **7/7 PASS** on an
  isolated detached checkout, zero skips. The parser now accepts true
  JSON uint32 numbers and rejects all entryPoint strings, including canonical `0xHEX`; disallows fractional,
  duplicate/NFKC Unicode, ambiguous plus/underscore string and MAP
  incompleteness. No Mario W01 auditor was modified.
- Toad strict REL initial `faae59a`: **39/39 author PASS** but Peach's
  independent `review_rel_helper.py` **2 PASS / 2 FAIL**. JSON exponent
  `1e9999` silently became infinity in unknown nested fields, contrary
  to the stated fail-closed schema. Formal CHANGES_REQUESTED recorded.
- Toad fixed CLEAN `ed1ddb5`: source independently reviewed and built-in
  REL tests **44/44 PASS**, full combined author suite **75/75 PASS**,
  Peach `review_rel_helper.py` **4/4 PASS**, zero skips, clean detached
  checkout. Both old exponent-negative RED cases now correctly reject.

These are parser/helper-only approvals. They do not validate Mario's
final `analyze`/CLI wiring, original DOL hash, runtime compatibility or
Nintendo executable behavior. Keep whole W01 gate STOP until a new clean
Mario SHA is independently re-tested with the old RED suite and the new
positive controls.

Explicit peer review commands (CLEAN SHA-only checkout, no skips):

```bash
NSMB_P12_REL_HELPER_ROOT=/home/marcos/NSMBcowork/worktrees/Peach-P12-Toad-RelFixed \
 python3 -B tests/phase12/review_rel_helper.py
NSMB_P12_METADATA_HELPER_ROOT=/home/marcos/NSMBcowork/worktrees/Peach-P12-Luigi-NumericFinal \
 python3 -B tests/phase12/review_metadata_helper.py
```

## Later clean metadata helper SHA — upstream schema review

Luigi published a subsequent clean `cd08d94742695801ccd62a7d121ba785e1be5d3b`
that again accepts `entryPoint: "0x80500004"`. Independent Peach detached
review: author **35/35 PASS**; the new explicit
`review_metadata_helper.py` now gets **6 PASS / 1 FAIL** because the
helper accepts this unsupported string type. Exact upstream C# source
`upstream-nsmbw/translator/src/Translator.Core/Mods/BaseTranslationOutputMetadata.cs`
defines `BaseTranslationFunctionMetadata.EntryPoint` as **uint**;
`Translator.Core/IO/JsonOutput.cs` uses default
`JsonSerializerOptions` number serialization without `WriteAsString`.
No publicly verified translator emits string `entryPoint` evidence.
Peach recorded **CHANGES_REQUESTED** against exact `cd08d94` and
requested numeric-only (previous `a4f4565` 7/7 independent PASS) or
explicit independent producer evidence that justifies expanded schema.
This is a SOURCE-ID contract, not a request to make tests green by
weakening assertions; keeping strict numeric JSON avoids laundering
invented translation manifests. Toad's **REL** `addr`/`size` hex strings
are a different, documented input format and remain accepted.

Keep Mario W01 status STOP and the private original DOL/profile SHA
mismatch untouched. No testing of real Wii code has occurred.
