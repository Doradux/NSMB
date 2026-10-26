# Peach Phase14 — strict structural rejection, unchanged negative intent

Only tests/documentation on independent branch; no modification to production auditor.

## Historic incompatible *negative* assertions

A number of legacy tests correctly intended to reject malicious/incomplete
evidence but incorrectly assumed `analyze()` would always return a detailed
`(report, 3)` even when the evidence cannot be parsed unambiguously.
The *reviewed strict parsers* now reject malformed structure with
`ValueError`, and the real CLI converts such failures to exit **4**.
This strengthens the fail-closed requirement: no report is safe when schema
identity itself is ambiguous.

The author `test_duplicate_translation_entry_is_invalid` previously
expected `translation.unique=2` and `status3` for a duplicate entry
in the source metadata. But the approved producer-grounded C# `uint`
entryPoint array must uniquely identify functions. Expect exact typed
`ValueError("Repeated translation function address")` instead.

The author `test_map_entries_missing_from_translation_never_pass_strict`
now requires `ValueError("Incomplete MAP/translation...")`: a MAP-extra
entry may not be laundered as a complete manifest. The old
`test_missing_translator_quality_counters_never_pass_strict` and
`test_noninteger_and_negative_quality_fields_are_not_verified` now
explicitly reject missing/malformed counters via `ValueError`
without silently treating absent/invalid fields as zero. The
`test_repeated_map_entries_fail_closed` asserts the specific
`ValueError("Repeated MAP function address")` rather than permitting
a report with ambiguous two-name address ownership.

Phase7 old quality-negative subtests (-1/False/True/0.25/"0"/None)
now independently demand typed `ValueError`. Phase7 two old negatives
for explicitly empty MAP and MAP-extra remain tested: they demand
the *specific* nonempty or incomplete one-to-one MAP exception.
The earlier Phase13 correction to the unrelated metadata-extra
positive remains in place and is NOT weakened.

## Structural rejection versus semantic incompatible evidence

Exit/report code **3** is reserved for **well-formed but unsupported or
incomplete evidence** (missing MAP, missing translation output, nonzero
valid translator quality counters, unmapped addresses, wrong DOL entry).
A present-but-invalid JSON schema, repeated function identity, malformed
quality counters or repeated MAP addresses must fail **4** at CLI.
Hash mismatch with otherwise complete valid evidence is **2**, or
read-only `--probe` **0** with `strict_compatible=false`;
a hash mismatch does NOT mask invalid data or missing MAP.

The separately committed full-coverage positives for status0 and bad-hash2
ensure the suite does not merely accept everything as ValueError. No
negative was deleted, skipped or broadened to catch arbitrary exceptions
(especially NOT `KeyError` or `TypeError`). The exact numeric-only
metadata contract comes from the upstream public C# producer type
`BaseTranslationFunctionMetadata.EntryPoint:uint` and default JSON
number serialization, not conjecture.

This change DOES NOT establish identity of the user's original DOL,
whose pinned checksum mismatch is an independent STOP. No original
Nintendo files or code are used here.
