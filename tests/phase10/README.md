# Peach — Phase 10 independent W01 identity gates

**Owner:** Peach. Branch: `agent/peach/phase10-w01-identity-qa`, based solely on public `main@2c2ef26`. Two isolated Python `unittest` modules and no changes to production code, `main` or another agent's worktree.

## What these tests protect

1. `test_w01_rel_executable_overlap.py` requires the strict source-identity auditor to refuse ambiguous **executable virtual address ownership**. An identical or partially overlapping executable range in two REL modules, two sections of one REL module, or between REL and DOL must not report `strict_compatible=true` without explicit provenance/disambiguation. Two positive fixtures prove that one REL section and two adjacent (nonoverlapping) sections remain valid.
2. `test_w01_probe_rel.py` requires `--probe` to **permit only an explicit checksum mismatch with complete, unambiguous evidence**. It must reject duplicate JSON REL objects, a missing MAP, and an ambiguous REL even when the DOL checksum matches. A positive probe fixture with complete evidence remains allowed and must never set `strict_compatible=true`.

All fixtures are newly invented DOL byte arrays and fictional REL addresses. No Nintendo files, hashes, generated proprietary C++ or credentials were used.

### Run against a NEW exact clean W01 SHA

These tests intentionally fail to import when the target source is absent. Do **not** point them at production `main` (no W01 auditor there) or at Mario's staged/uncommitted files and call it a verified commit.

PowerShell on the authorized `marcos` machine:

```powershell
$env:NSMB_W01_AUDIT_ROOT='C:\NSMBcowork\worktrees\CLEAN-W01-SHA'
$env:PYTHONDONTWRITEBYTECODE='1'
python -B -m unittest discover -s tests/phase10 -p 'test_w01_*.py' -v
python -B -m unittest discover -s tests/phase7 -p 'test_audit_*.py' -v
python -B -m unittest discover -s "$env:NSMB_W01_AUDIT_ROOT\tests" -p 'test_audit_profile*.py' -v
```

Prior Phase9 Peach `tests/phase9/test_w01_rel_duplicates.py` must also run against the **same clean SHA**. Recheck the **real owner's DOL SHA** only in Mario's private workspace; never waive the upstream identity pin. Even a clean static audit does not demonstrate Wii boot, IOS/GX/VI, OSGetTime or gameplay.

### Status and provenance

As of **2026-10-16**, GitHub issue #1 reports `main=2c2ef26`, W01 published old `110697c`, and **no new clean W01 fix**. The Phase9 REL duplicate-key suite was genuinely executed on the staged draft and produced four expected RED failures; Luigi and Toad independently reviewed those tests. These **new Phase10** overlap/probe suites have been **source-reviewed and published but not executed on a clean W01 candidate**. Remote Desktop Commander confirmed `marcos` online but paused commands for monthly usage, so no new local Wasm/Chrome/REA runtime measurements are claimed.

The *old* public W01 source visibly uses `json.loads(text)` in `rel_sections`, and produces a list of executable intervals without cross-REL or REL/DOL overlap validation; `--probe` can return success on a hash mismatch even when ambiguous evidence is silently overwritten. Expected RED cases are requirements for remediation, **not passing tests**. Keep failing assertions; Mario should implement fixes in his own branch, publish an exact clean SHA, and ask Peach for fresh adversarial reruns.

Phase9 review records already independently exercised **real** .NET Translator.Cli→Emscripten Wasm with Chrome and REA on Luigi `ef65abb` and Toad `54e0936`; those were prior-turn tests, not new Phase10 executions. Full combined Chrome regression previously had intermittent CDP discovery failures; repeat sequentially (`--test-concurrency=1`) before Mario merges.

**Only Mario merges `main`; review tests before integration.**
