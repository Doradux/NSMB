# Phase 13 — REL/DOL ownership integration gates (Toad)

**Invented synthetic fixtures only; no Nintendo file, code or private evidence.**
Original DOL profile SHA mismatch remains an independent STOP.

## Two separate test contracts

* `rel_helper_contract.py`: 19 GREEN tests on the approved isolated
  `scripts/strict_rel_layout.py`; uses exact section dictionaries from
  `dol_sections(fake_dol())` and tests positive adjacency, finite
  Unicode extensions, exclusive uint32 EOF, and negative ALL REL (incl.
  data) vs ALL DOL (incl. data) overlaps, duplicates, malformed JSON
  Unicode/NFKC/nonfinite/depth, boolean/types and unproved overlay hints.
* `rel_audit_integration.py`: 19 tests on REAL selected
  `scripts/audit_profile.py:analyze` with NO monkeypatch or shim.
  Includes REAL --probe CLI subprocess with fake DOL/MAP/REL/metadata.
  The untouched old audit at dd30025 is EXPECTED RED: 5 PASS,
  12 FAIL and 2 unhandled TypeError, including all 3 positives PASS.

## Runners

```sh
env -u LD_LIBRARY_PATH -u LD_PRELOAD PYTHONDONTWRITEBYTECODE=1 \
  python3 -B -m unittest discover -s tests/phase13 \
  -p rel_helper_contract.py -v

env -u LD_LIBRARY_PATH -u LD_PRELOAD PYTHONDONTWRITEBYTECODE=1 \
  NSMB_W01_AUDIT_ROOT=/home/marcos/NSMBcowork/worktrees/Mario-P13-W01 \
  python3 -B -m unittest discover -s tests/phase13 \
  -p rel_audit_integration.py -v
```

## Mario integration requirement

Only Mario edits `scripts/audit_profile.py`. After
`info = dol_sections(dol_data)`, the REL path MUST be equivalent to:

```python
from strict_rel_layout import parse_rel_sections
rel = (parse_rel_sections(rel_text, dol_sections=info['sections'])
       if rel_text is not None else [])
```

Do not preserve a permissive old rel_sections path or an `if rel_text`
guard that skips present-but-empty malformed REL source evidence.
The helper by itself is NOT proof of DOL ownership until Mario supplies
the real DOL section list. Validate before report/classify. `--probe`
cannot waive structurally bad REL or turn mismatch into strict_compatible.

All REL-REL and REL-DOL overlaps are rejected. Genuine Wii REL lifetime
overlays require independently authenticated relocations and timing
evidence and a separately reviewed design; a JSON `allowOverlay` hint
does not justify permissive acceptance.

The baseline 110 helper/author green tests do not demonstrate integration.
Mario must run original author AND Peach/Luigi/Toad negative+positive
suites on one clean exact SHA. Error wording differences must be reviewed
semantically, not used as an excuse to relax strict source checks.
