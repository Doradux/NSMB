# Peach Phase14 — audit legacy contracts verification matrix

Platform `marcos-hpr` Linux / Python 3.14, source-integrator exact published
`faa7a219fb5bde27b0d96f430cc5620f4bf2bb9b`. All edits QA-only,
in OWN independent worktree `agent/peach/phase14-w01-legacy-qa`.
No sudo, Nintendo media, confidential profile hashes, or main edits.

## Production SHA before test-only corrections

- Author+helper suite `tests/test_*.py`: 110 methods, 1 FAIL + 9
  ERROR; all related to contradicting legacy outputs.
- Phase7 18 methods, 1 FAIL + 7 ERROR. No skipped tests.
- Modern Phase13 Luigi/Peach/Toad suites, Phase9, Phase10, Phase12
  GREEN, verifying REL-DOL ownership, numeric-only producer metadata,
  JSON duplicate policy, complete MAP, CLI probe boundaries.

## THREE separate Peach commits (all source untouched)

- Commit A source-grounded positives: old author bad SHA **without**
  MAP/metadata requires status3 incomplete, not 2; *added* a complete
  valid synthetic MAP+translation+REL SHA-mismatch status2 control.
  Old Phase7 extra metadata function absent from independent MAP
  cannot be compatible: requires structural status4; *added* a paired
  MAP+metadata extra function compatible status0 positive.
  All old negative duplicate tests unchanged. See CONTRACT_POSITIVE_SHA.md.
- Commit B typed schema negatives: tests previously expected
  `(report,status=3)` for structurally untrusted duplicated functions,
  invalid/missing quality counters and repeated or incomplete MAP.
  They now demand **precise ValueError** on `analyze()` (real CLI
  catches to status4). Negative subtest values, filenames, malicious
  inputs and source fixtures all preserved; code3 remains for
  well-formed-but-incomplete/low-quality reports. See
  CONTRACT_STRUCTURAL_ERRORS.md.
- Commit C NEW real CLI tests `test_w01_cli_legacy_contract.py`:
  status0 complete clean, status2 ONLY wrong SHA with full evidence,
  status3 incomplete missing MAP/metadata and nonzero wellformed
  quality, status4 duplicates/invalid or missing quality/maps, and
  explicit `--probe`: only pure SHA mismatch can yield exit0 while
  `strict_compatible=false`, never incomplete/structural evidence.
  **12/12 PASS**, 0 skips, actual subprocess on invented tiny DOL only.

## Full distinct-suite matrix on candidate faa7a21 + Peach tests

Executed real Python 3.14 with NSMB_W01_AUDIT_ROOT set to this exact
candidate source, PYTHONDONTWRITEBYTECODE=1, all tests in current
QA-only branch and all checked-in Phase13 peer suites. Zero skipped.

| Suite / discover pattern | Methods | PASS |
|---|---:|---:|
| tests/test_*.py — all author+helpers | 111 | 111 |
| tests/phase7/test_audit*.py | 18 | 18 |
| tests/phase9/test_w01*.py | 5 | 5 |
| tests/phase10/test_w01*.py | 10 | 10 |
| tests/phase12/test_w01*.py | 14 | 14 |
| tests/phase13/test_*.py — Luigi and Peach (incl helper) | 53 | 53 |
| tests/phase13/rel_audit_integration.py — Toad | 19 | 19 |
| tests/phase13/rel_helper_contract.py — Toad | 19 | 19 |
| tests/phase14/test_*.py — Peach fresh CLI | 12 | 12 |
| **TOTAL (non-overlapping discover patterns)** | **261** | **261** |

All nine commands returned OS exit0, no FAIL, no ERROR and **0 SKIP**.
No fake JavaScript/WebAssembly proof; W01 is a static source-evidence
auditor in Python and is NOT Nintendo game emulation. Need Luigi+Toad
independent review of precise test changes and Mario's final clean SHA,
plus new adversarial Phase14 tests when they are published.

Even full synthetic GREEN NEVER permits original Wii guest calls:
the user's owned DOL SHA still fails the pinned version/profile match,
and IOS/GX/ABI/runtime dependencies remain unverified. Mario is the
sole integrator of main.
