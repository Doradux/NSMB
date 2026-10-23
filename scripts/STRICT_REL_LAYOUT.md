# Phase 12 — strict REL JSON schema and exclusive address ownership

**Owner:** Toad, branch `agent/toad/phase12-w01-rel`, baseline **public
W01 `110697c`**. New module only: `scripts/strict_rel_layout.py`.
**No modifications to Mario's `scripts/audit_profile.py`.**

All examples/tests are invented, synthetic data; **no Nintendo DOL/REL/ISO,
translation source, private profile, secrets or privileged actions**.

## API

```python
from strict_rel_layout import parse_rel_sections

# As used in Mario's analyze(), AFTER reading the DOL:
info = dol_sections(dol_data)
dol = info["sections"]

# In strict mode DO NOT omit dol_sections: cross-DOL overlap is a hard gate.
rel = parse_rel_sections(rel_text, dol_sections=dol) if rel_text is not None else []
```

Return type is a **list of dicts**, identical to existing `rel_sections`
for the executable sections only:
```python
[{"start": 0x80500000, "end": 0x80500020, "executable": True}]
```
Both boundaries are **half-open**: `[start,end)`. An end of `2**32`
is allowed if it represents the byte at `0xFFFFFFFF`, but *addr* and
*size* must each be a uint32 (sizes strictly positive). Legal forms are
literal Python/JSON integers (NOT booleans or floats) or explicit `0xHEX`
strings. Decimal strings and other bases are rejected. `exec` must be
an actual JSON bool even when false, and all sections require `addr` and
`size`, including non-executable data sections. Unknown metadata properties
are ignored **except** their JSON duplicate-key validation.

Parse errors (including Unicode aliases, malformed shape/ranges, overlap,
NaN/Infinity) always raise **ValueError**, never silently return an empty
result or treat a bool as an address. JSON `object_pairs_hook` checks every
nested object after unescaping; NFKC collisions are disallowed to avoid
producer/consumer key-normalization ambiguity, but keys are never silently
rewritten in output.

## Ownership and overlays

- **REL–REL:** All source REL address sections (including non-executable)
  must be pairwise disjoint. Adjacent intervals are permitted.
- **REL–DOL:** When given `dol_sections`, every REL interval must not
  intersect any DOL interval, including DOL non-executable sections.
- Merely supplying `"overlay": true`, `"relocation": "verified"`,
  module labels, or a JSON lifetime assertion is **not** authenticated
  ownership proof. Such values NEVER bypass overlap detection.
- Authentic REL overlays may reuse virtual ranges at **different lifetimes**.
  Reject them for now instead of making up safety evidence. A future
  implementation could accept authenticated module loader timelines and
  relocation maps only after another independent review, but this API
  deliberately does not pretend a caller-provided flag is proof.
- A parser-only invocation (without DOL) is suitable for unit tests only:
  it cannot assert or imply **REL–DOL ownership completeness**. Mario MUST
  pass DOL sections when deciding strict compatibility.
- Parsing a well-formed REL layout alone does not prove that the layout
  belongs to the original image or that an original game leaf runs.

## Integration responsibilities belonging to Mario

1. Import and call this helper from `rel_sections` or directly within
   `analyze`, passing **the already validated actual DOL sections**;
   do not use a truthiness check on `rel_text` (present-but-empty JSON
   must error) and do not catch invalid evidence as `rel=[]`.
2. Keep full source DOL hash pin, entry verification, MAP and translation
   metadata quality/missing-address checks; errors should keep their
   established exit status 4 rather than becoming `strict_compatible=true`.
3. Independently integrate Luigi's strict translation metadata helper
   and re-run Peach PR #2, Toad PR #3 and Luigi PR #4 **negative and
   positive synthetic controls on the integrated SHA**.
4. The original user-owned DOL hash/profile mismatch is a separate
   mandatory **STOP** even when all public synthetic checks pass.
5. Do not merge to public `main` until Mario has reviewed commits,
   all author+peer tests are GREEN and the original source provenance is
   reconciled independently without publishing protected content.

## Verification

```sh
cd /home/marcos/NSMBcowork/worktrees/Toad-P12-W01
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest \
  discover -s tests/phase12 -p 'legacy_rel_red.py' -v
# Original legacy W01: deliberately expected nonzero (RED).
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest \
  discover -s tests -p 'test_strict_rel_layout.py' -v
# New isolated helper: GREEN.
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest \
  discover -s tests -p 'test_*.py' -v
# Original author tests + helper (RED witness intentionally excluded).
```

These tests use **Python only**, not a real Wii executable. No sudo needed.
