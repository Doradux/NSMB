# Peach Phase13 W01 final QA

QA-only branch agent/peach/phase13-w01-qa, prepared from local Mario dd30025.
Only tests and documentation. All fixtures are invented, no Nintendo assets.

## Producer-grounded Phase7 positive correction

See tests/phase13/POSITIVE_CONTRACT.md. Prior Phase7 control accepted
metadata functions not represented in the independently witnessed MAP.
A strict full-coverage audit has no evidence for these extra functions
unless a separately reviewed upstream exception policy is established.
The first change is a separate commit altering ONLY this false positive.
New real positive includes the same functions in MAP and metadata.
Both pre-existing MAP negative assertions are preserved verbatim.

## Execution against an exact new Mario SHA

Run from Peach-P13-W01 and point the audit environment variable at a
clean independent checkout pinned to Mario's future source SHA:

    export NSMB_W01_AUDIT_ROOT=/path/to/clean/exact/Mario-SHA
    export PYTHONDONTWRITEBYTECODE=1
    python3 -B -m unittest discover -s tests/phase7 -p 'test_audit_*.py'
    python3 -B -m unittest discover -s tests/phase9 -p 'test_w01_rel_duplicates.py'
    python3 -B -m unittest discover -s tests/phase10 -p 'test_w01_*.py'
    python3 -B -m unittest discover -s tests/phase12 -p 'test_w01_*.py'
    python3 -B -m unittest discover -s tests/phase13 -p 'test_w01_*.py'

Run author+helper tests from the candidate's own checkout with
python3 -B -m unittest discover -s tests -p 'test_*.py'.
Also test historic PR #2/#3/#4 untouched, zero skipped.

## Baseline on old unintegrated W01 dd30025 Ubuntu

- Author/helper: 110 of 110 PASS, 0 skip.
- Phase7 original 18 methods, 19 failing subtest/assertions before correction.
- Phase9 5 methods, 4 FAIL.
- Phase10 10 methods, 7 FAIL.
- Phase12 14 methods, 12 FAIL.
- Phase13 20 new methods, 13 failing assertions (including nested
  subtests MAP two forms and CLI probe both flags), 0 skip, 7 pass.
All 13 RED are old-auditor vulnerabilities and must become GREEN on the
new integrator, without changing independent negative assertions.

## CLI and reporter contracts

0: complete compatible input with matching hash; or explicit --probe of
otherwise valid data with wrong hash BUT strict_compatible=false.
2: wrong SHA without --probe, other evidence valid.
3: structurally sound but incomplete/unsupported evidence, e.g. bad quality.
4: malformed/untrusted input such as duplicate JSON keys.
--probe must NEVER waive malformed REL/MAP/metadata or DOL executable mismatch.

A historic author test expects duplicate metadata to report status3
plus translation.unique, while strict helper throws controlled ValueError.
This is an observable-output contract conflict: Mario must decide
report-vs-controlled-structural-error semantics with independent review.
Peach new audit rejection oracle allows either a typed ValueError or a
strict incompatible nonzero report, without silently certifying a duplicate.
Preserve the author tests unless a source-grounded documented change wins
peer review; do not alter to manufacture green.

Passing every synthetic W01 gate would NOT resolve user original DOL
SHA/profile mismatch (separate hard STOP), identify the authentic Wii
function, prove REL lifetimes/relocations, OS/IOS/GX compatibility or
gameplay. No Nintendo original data or code translated here.
