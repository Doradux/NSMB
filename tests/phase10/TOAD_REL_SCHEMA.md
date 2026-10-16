# Toad Phase10 — malformed REL schema error gates (test-only)

This independent suite **complements** Peach [PR #2](https://github.com/Doradux/NSMB/pull/2)
(which covers overlapping executable REL sections) and Luigi
[PR #4](https://github.com/Doradux/NSMB/pull/4)
(which covers duplicate JSON keys, metadata, `--probe` and checksums).
It deliberately does NOT claim ownership of their cases or attempt to
modify Mario's W01 source.

## Exact test contract

Run only synthetic JSON input against the W01 code in the chosen CLEAN
checkout:

```bash
python3 -B -m unittest discover -s tests/phase10 -p 'test_w01_rel_structure.py' -v
```

There are six cases:

- Two positives for distinct and adjacent valid sections.
- Four malformed structures that should produce a **controlled ValueError**:
  top-level JSON array, null `sections` mapping, list `sections`
  mapping, and null nested section entry.

On the exact publicly published auditor commit `110697c105ee1550f424ae05cf677153fba01348`,
the four malformed cases instead throw **AttributeError**, which is
NOT caught by the public CLI's stated exception handler. No original
Wii game data is used or necessary. These are negative checks, not
permission to downgrade other W01 regressions or original DOL identity.

GitHub Actions synthetic oracle on Toad's isolated branch uses
the full pinned auditor SHA and expects **2 PASS / 4 ERROR**.
The workflow reports **success** only when the expected *broken*
baseline is reproduced — success does NOT mean the W01 auditor is fixed.
When Mario publishes a NEW clean SHA, the actual six tests must become
6/6 PASS, alongside Peach/Luigi suites and exact DOL source identity.
