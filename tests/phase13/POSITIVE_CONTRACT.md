# Peach Phase13 — correction to a legacy positive, not a negative waiver

Source: `tests/phase7/test_audit_failclosed.py::test_valid_extra_translated_func_and_empty_map_rules`.
The historical test required success when metadata supplied the extra
function `0x80004008` but the independent MAP listed only `0x80004004`.
That test established only that both addresses happen to lie inside an
executable DOL section, not that the extra translated function belongs to
the independently checked MAP. A **strict source-evidence audit** cannot
certify such a mismatch without an independently specified, reviewed
translator/MAP completeness policy.

Public Phase12 `scripts/strict_translation_metadata.py` API explicitly
calls `require_complete_map_coverage`, requiring a nonempty one-to-one
MAP/metadata address set with no duplicates. This policy is deliberately
conservative; it is **not a claim** that authentic source translator output
must always contain the same entries as every possible MAP producer.
Should a legitimate upstream mapping exception be demonstrated later,
review a new explicit policy with source provenance, NOT an implicit
`strict_compatible=true` on mismatched inputs.

The test now makes the previously unsupported positive a **negative**:
missing MAP entry must fail closed (ValueError or report status != 0 and
strict false), adds a true positive when both MAP and metadata contain
identical entries and retains the **two preexisting MAP negative assertions
verbatim**. This is the only old test changed in this commit. A newer
clean Mario auditor candidate is still necessary; this test intentionally
fails against the old auditor, which incorrectly greenlights the extra.

All DOL data used in tests are invented bytes. This test cannot certify
the user's original Nintendo DOL (SHA mismatch with pinned profile), Wii
boot, executable REL overlays, IOS/GX dependencies, or native gameplay.
