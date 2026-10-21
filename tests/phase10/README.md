# Luigi — Phase 10 W01 strict-evidence regression suite

**Branch:** `agent/luigi/phase10-w01-strict-evidence-qa`
**Base:** public `main` at `2c2ef26`
**Status:** additional RED-first test candidate, **not a W01 fix**.

The 15 Python `unittest` cases in `test_w01_evidence_boundary.py`
construct a wholly invented 0x160-byte DOL, MAP, REL JSON, translation
metadata and SHA256-pinned YAML in memory. No Nintendo files, original
identity, proprietary translated C++, secrets, screenshots or private
machine paths are committed.

## Reproduction on an approved machine

Run **only against an explicitly chosen exact, clean W01 commit checkout**,
not a peer's dirty worktree:

```powershell
$env:NSMB_W01_AUDIT_ROOT = 'C:\path\to\clean\W01-checkout'
$env:PYTHONDONTWRITEBYTECODE = '1'
python -B -m unittest discover -s tests/phase10 -p 'test_w01_evidence_boundary.py' -v
```

**Test categories:**
- 1 legitimate positive: verified synthetic DOL, REL exec coverage,
  MAP and translation outputs yield `strict_compatible=true`.
- 5 REL JSON ambiguity negatives: Unicode-escaped top-level key,
  Unicode-escaped section name, duplicate `exec`, duplicate `size`
  concealing an overflowing section, and repeated identical `modules`.
- 6 translation metadata negatives: overwritten nonzero quality,
  Unicode-escaped `quality` alias, duplicate nested quality count,
  overwritten function entryPoint, fractional JSON entryPoint silently
  truncated to a mapped integer, boolean `false` accepted as count zero.
- 1 identity mismatch regression: fully covered MAP/REL/metadata must
  **never** waive a DOL SHA mismatch.
- 2 CLI `--probe` cases: a read-only digest mismatch may return process 0
  **but** JSON must remain `strict_compatible=false`; a probe with no
  MAP, REL or metadata must **not** report *full strict compatibility*.

Test assertions allow a malformed input to raise a validation error or to
return a non-compatible nonzero result. They do **not** accept
`strict_compatible=true` for ambiguous/missing evidence. An identical
duplicate JSON key is still ambiguous and must fail.

## Trust boundaries / known evidence

Peach's prior exact `1ba9fb8` W01 suite was run on 2026-10-15 against
Mario's then-uncommitted W01 source: a legitimate case passed, four
deliberate REL duplicate-key negatives were RED. The source's
`rel_sections()` previously used default `json.loads(text)`,
which overwrites earlier members after Unicode-escape decoding.
Those earlier findings do **not** certify the state of Mario's current
or future W01 checkout.

Phase 10 on 2026-10-16: Remote Desktop Commander reported its monthly
usage is exhausted; the tool explicitly requested **no retries**.
Therefore the **15 new tests have NOT been executed against a selected
current clean W01 SHA**, and no original-game execution, new Chromium
run or Wasm rebuild has been performed this turn. GitHub branch content
is a reviewable regression candidate, not a green report.

Mario owns the W01 parser fix and `main` merges. Before any W01
approval: select a NEW clean SHA, run Mario author tests and all old
Phase7/Phase9/this Phase10 gates with no assertion changes, verify
source-digest mismatch remains incompatible and obtain independent
Peach and Luigi critical reviews. A fixed static audit is not Wii
OS/IOS/GX/boot compatibility.

Also see `docs/phase10-private-leaf-readiness.md` for the gate to a
*single* future authentic leaf. That document contains **no** private
function names/bytes or executable identity.
