# Luigi Phase13: translator metadata / MAP interoperability contract

Scope: synthetic-only evidence. The helper from Phase12 is integrated in the Phase13 base, but `scripts/audit_profile.py` remains unadapted at base `dd3002570c6bdddc8d35bcd79eccf6506d32f6be`.

## Producer -> contract -> assertion matrix

| Public pinned producer/schema | Accepted contract | Independent regression |
|---|---|---|
| `Translator.Core/Mods/BaseTranslationOutputMetadata.cs`: `BaseTranslationFunctionMetadata.EntryPoint` is C# `uint`; JsonOutput CompactCamelCase without WriteAsString | JSON number, 0..4294967295, never string/float/bool | `test_w01_metadata_map_helper.ImportedNumericABI` and `ExactAuditorContract.test_*entrypoint*` |
| JSON nested object keys, including unicode escapes | no duplicated or Unicode-NFKC-colliding keys at any depth | `test_recursive_unicode_duplication_rejected`, `test_duplicate_quality_with_unicode_escaped_key_cannot_shadow` |
| translator `quality` | both `unsupportedInstructionCount` and `invalidSsaFunctionCount` mandatory numeric nonnegative ints; both zero for strict eligibility | `test_bad_quality_values_are_rejected`, `test_nonzero_but_wellformed_quality_is_status_three` |
| function MAP and translator output | exact numeric uint32 one-to-one address set and no duplicates, pending a provenance-proven alternate policy | `test_translation_only_address_no_map_provenance_is_rejected`, `test_map_entry_without_translation_must_not_be_certified` |
| public audit CLI | status 0 only verified identity + complete clean evidence, 2 only digest mismatch, 3 incompatible/incomplete evidence, 4 malformed structural input | `ExactAuditorContract` CLI tests |
| `--probe` | may allow read-only investigation of a SHA mismatch if all other checks passed; report must keep `strict_compatible=false`; cannot waive schema/coverage failures | `test_probe_*` |

## Historical positive oracle conflict (STOP, independent review required)

`tests/phase7/test_audit_failclosed.py::test_valid_extra_translated_func_and_empty_map_rules` currently expects status 0 with two translated function entry points and only one MAP entry. The strict Phase12 metadata helper rejects that case, since it is not possible to assert *complete* MAP-to-generated-function provenance for a translation-only entry. A C# numeric `EntryPoint` serialization contract does NOT itself demonstrate whether a translator might legitimately emit an extra entry absent from one particular MAP. Do not silently change either test or parser: require source-grounded upstream translator enumeration / MAP producer scope evidence and a peer-reviewed policy decision. Until then, report this as an unresolved contradictory positive oracle and fail closed. Peach owns historical assertion changes.

## Other return-contract conflict

`tests/test_audit_profile.py::test_duplicate_translation_entry_is_invalid` expects an `analyze` report with status 3 and unique counts; the strict parser raises ValueError for duplicate function addresses (CLI status 4). Resolve at Mario's adapter boundary with a separately justified semantic distinction, not by quietly catching and granting success. Preserve meaningful reports when inputs are valid but incompatible, and controlled status 4 for malformed evidence.

## Baseline reproducible evidence

Against unchanged Phase13 base `dd30025` (old auditor, imported helpers): direct helper 12/12 PASS; CLI/interoperability 19 tests, 9 FAIL, 10 PASS; 0 skipped. FAIL is deliberate RED-old evidence, not an acceptable W01 status. Source fixtures are fabricated DOL/MAP/metadata/profile; no Nintendo content, executable, original hash or private data present.

To re-run after Mario publishes a clean exact commit, use a separately checked-out candidate and `NSMB_W01_AUDIT_ROOT=/path/to/exact/checkout python3 -B -m unittest discover -s tests/phase13 -p 'test_w01_metadata_map_cli.py' -v`. Do not claim GREEN-new until that happens. The original DOL/profile identity mismatch remains a separate STOP even if all synthetic tests pass.
