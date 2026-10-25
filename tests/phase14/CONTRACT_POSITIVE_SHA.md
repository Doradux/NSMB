# Peach Phase14 contract reconciliation — commit A (positives and SHA priority)

Independent QA-only source worktree `agent/peach/phase14-w01-legacy-qa`, based on published Mario integrated auditor `faa7a219fb5bde27b0d96f430cc5620f4bf2bb9b`.

## A1. SHA status priority, author test

Prior `tests/test_audit_profile.py::test_hash_mismatch_is_never_strict` required code2 **without** MAP or translation metadata. That is a fabricated input with BOTH a source-identity mismatch and missing evidence. Current `analyze` code classifies evidence completeness before SHA: incomplete evidence gives **status3**, `strict_compatible=false`, `hash_match=false`, `coverage_evidence_complete=false`. This is not a SHA bypass: `--probe` may give exit0 only on **otherwise complete, wellformed** input where sole remaining problem is SHA mismatch (otherwise it remains exit3 or CLI structural4). Corrected the old contradictory assertion and added a second **complete synthetic** MAP+REL+metadata bundle where SHA mismatch MUST return status2 (still strict false). The complete evidence testcase uses the old author's own invented DOL bytes, exact metadata functions 0x80004004 and 0x80768004, zero quality counters and matching independent map.

## A2. Unsupported Phase7 extra function positive

Prior `tests/phase7/test_audit_json_duplicates.py::test_synthetic_positive_and_safe_extra_function` returned `(True,0)` for an extra metadata entry at 0x80004008 not present in MAP. Merely being inside DOL executable bounds does NOT independently evidence MAP/metadata equality. Luigi's approved strict helper `require_complete_map_coverage` demands nonempty **one-to-one** matching MAP/translation address sets; no upstream exception has been proven. Retained the original exact positive single function, replaced only the misleading extra-positive with `(False,4)` for malformed completeness evidence, and **added** an extra positive where independent MAP also includes the additional function. The negative duplicate JSON, Unicode, malformed addresses and YAML tests in that module are completely unchanged.

This is an explicit conservative *coverage-evidence policy*, not an unsupported claim that the translator generates equal-cardinality MAP files for every possible use. A demonstrated upstream exception would need a separate reviewed policy, never a silent false-positive.

No original Nintendo bytes or private SHA are used. Future compatibility certification remains stopped on original DOL SHA/profile mismatch and Wii platform hooks even when all synthetic tests pass.
