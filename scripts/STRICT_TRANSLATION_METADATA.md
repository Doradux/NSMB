# W01 Phase 12 — translation metadata strict parser (Luigi)

**Scope:** this is a *new*, standalone, copyright-free parser.
`scripts/audit_profile.py` is **owned by Mario and is not modified**.
Read-only validation never obtains original DOL/REL/ISO or private SHA.

## Integration API

When Mario incorporates the reviewed **exact Luigi commit**, this is the
minimal importer API from `scripts/audit_profile.py`:

```python
from strict_translation_metadata import (
    parse_translation_metadata, quality_clean,
)

# map_addresses are parsed separately by Mario's existing read_map().
metadata = parse_translation_metadata(
    metadata_text, map_addresses=map_addresses
)
addrs = metadata["addresses"]                 # unique int uint32
quality = metadata["quality"]                 # both counters required, >= 0
# Nonzero quality counters are valid evidence of FAILURE, not parsing failures.
invalid |= not quality_clean(metadata)
# Externally classify address ownership using Mario/Toad's strict DOL+REL.
# Externally require real DOL/profile SHA match, enough MAP evidence and
# no unresolved original guest imports; only Mario determines CLI status.
```

`parse_translation_metadata(metadata_text)` without a MAP validates only the
metadata shape and sets `map_coverage_verified=False`. It is **not** evidence
that translation coverage is complete. Passing a MAP requires **exact set
equality** between metadata entries and MAP, no extra translation-only or
MAP-only entries, and no duplicate on either side. If the actual upstream
translator has legitimate functions absent from the MAP, it needs an
independent, explicitly justified completeness policy before declaring
strict compatibility; **do not silently weaken the parser**.

The helpers `load_translation_json(text)` and
`require_complete_map_coverage(map_addresses, translated_addresses)` are
also exported for Mario if he needs to stage reporting separately.

## Contract

- JSON parser rejects any duplicate *recursively*, including JSON
  escape-decoded key aliases and NFKC Unicode compatibility aliases (`qual\\u0069ty`) even when values agree.
  Duplicate keys inside unknown nested objects also abort parsing.
- Invalid root, empty/wrong functions array, non-object function, missing
  entryPoint, repeat of the **numeric** entry address → `ValueError`.
- `entryPoint` must be an actual JSON integer `uint32` OR the
  documented **canonical `0xHEX` string** (`0x`/`0X`, 1..8 hex digits).
  Both normalize to Python int. Never accept `bool`, `float`,
  decimal string, `+0x...`, `0x80_000...`, negative, overflow,
  space/underscore separators, numeric truncation or coercion.
  This explicitly preserves Peach Phase12's positive canonical hexadecimal
  compatibility oracle. MAP caller inputs remain required numeric int.
- `quality` must be a JSON object with
  `unsupportedInstructionCount` and `invalidSsaFunctionCount`, each
  an actual integer `>=0` (never bool/float/string/null). Both are mandatory.
  `quality_clean(metadata)` independently requires them both to equal **0**.
- Invalid UTF-16 Unicode surrogate sequences and nonfinite JSON numeric
  constants, including float overflow notation `1e9999`, are rejected
  rather than silently accepted.
- No Boolean `strict_compatible`, DOL source identity, quality waiver,
  `--probe`, REL ownership or CLI status is computed here. Mario's audit
  must still fail closed whenever any of those independent gates are missing.

## Real Ubuntu results (23 Oct 2026)

Original public W01 `110697c` with a synthetic in-memory DOL/REL/MAP:
- clean metadata: old audit `strict_compatible=True`, helper accepts;
- fractional address `entryPoint=0x80004004+0.25`: old audit incorrectly
  `strict_compatible=True` via `int(float)`, helper raises ValueError;
- duplicate nested quality count, duplicate top-level quality object and
  Unicode-escaped duplicate `quality`: old audit incorrectly accepts each,
  helper raises ValueError;
- old audit catches the boolean address as unmapped (status3), helper
  additionally rejects malformed type immediately, rather than coercing.

Standalone test suite **35/35 PASS**, all pre-existing author tests in the
isolated worktree with our additional tests **66/66 PASS**. Zero skipped.
This is RED-old/GREEN-parser (not a modified Mario auditor). The existing
full audit is STILL vulnerable and *must not* be marked green merely because
the helper exists on Luigi's branch.

Time64 already approved as **synthetic only**. Nintendo original DOL
identity/profile hash mismatch remains an independent STOP; a private
read-only provenance check must confirm edition/region/revision before any
single authentic Wii leaf is translated or executed. No private source
is required by or present in this helper.
