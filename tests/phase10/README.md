# Phase 10 — W01 REL structural regression suite

This is a **TEST-ONLY, deliberately RED gate**. It must never be
interpreted as W01 approval or as a request to replace an original DOL
checksum. The inputs are newly constructed JSON only; no game binary,
REL, profile, generated original-function code, assets or private hashes.

## Run

From a CLEAN candidate checkout of the auditor:

```powershell
python -B -m unittest discover -s tests/phase10 -p test_w01_rel_structure.py -v
```

The test file imports the candidate checkout's
`scripts/audit_profile.py:rel_sections` directly. It does not read
Mario's potentially dirty or staged W01 worktree.

## Review conditions

There are 2 positive non-overlap checks and 6 negative checks:

- Executable REL ranges overlap **within** one module.
- Two modules claim exactly the same static executable address.
- Two module ranges overlap by one byte in static guest address space.
- A module has `sections: null` or `sections: []`.
- A nested section mapping is `null`.

Overlaps across independently loadable modules might be valid for a
**time-separated overlay**. The current auditor does not carry the
module-lifetime or relocation proof to disambiguate ownership, so
strict compatibility must fail closed until such evidence is available;
a future module-aware audit can explicitly revise that policy.

The publicly published W01 auditor at `110697c` accepts overlapping
REL ranges and throws unhandled `AttributeError` for the malformed
mapping forms. An offline local copy of its exact `rel_sections`
function reproduced **2 PASS / 3 FAIL / 3 ERROR**, without a device
checkout. This is **NOT a fresh live run against Mario's current staged
files**. Run the exact clean candidate test on marcos when Desktop
Commander service resumes.

**Separate existing blocker:** Peach's
`tests/phase9/test_w01_rel_duplicates.py` reports 4 expected RED
duplicates in REL JSON, including Unicode-decoded duplicate keys.
Those tests must also pass on Mario's new exact clean SHA. The owner
original DOL SHA mismatch with the pinned profile remains a hard STOP.
