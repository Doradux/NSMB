# Luigi • Phase 13 W01: producer → metadata → MAP → CLI audit

Date: 2026-10-24. Owner: Luigi, isolated branch
`agent/luigi/phase13-w01-interop`, based on Mario's **local preparation**
`dd3002570c6bdddc8d35bcd79eccf6506d32f6be`.
This report and its two test files use only *invented*, copyright-free
synthetic fixture data. The original Wii executable, REL files, private
hashes, translated game code and credentials were not accessed.

## Grounding from public upstream producer (read-only)

Read `upstream-nsmbw/translator/src/Translator.Core/Mods/BaseTranslationOutputMetadata.cs`:
`BaseTranslationFunctionMetadata(..., uint EntryPoint, ...)` and
`TranslationQualityMetadata(int UnsupportedInstructionCount, int
InvalidSsaFunctionCount)`. Read
`upstream-nsmbw/translator/src/Translator.Core/IO/JsonOutput.cs`:
uses `JsonSerializer.SerializeToUtf8Bytes` with
`PropertyNamingPolicy = JsonNamingPolicy.CamelCase`. Therefore producer
emits numeric JSON `entryPoint` (never a `"0x..."` string), numeric
`unsupportedInstructionCount` and `invalidSsaFunctionCount`.
`EntryPoint` is unsigned 32-bit at source; booleans, floats, strings and
truncated/converting values are not authentic emitted values.

| Producer/evidence | Required parser/auditor contract | New assertion |
| --- | --- | --- |
| C# `uint EntryPoint` | JSON number integer in `0..0xFFFFFFFF`, not boolean, float, hex/decimal text | `test_source_authoritative_numeric_uint32_positive`, `test_all_string_or_noninteger_values_are_structurally_rejected`, `test_hexadecimal_string_metadata_entrypoint_is_not_csharp_uint` |
| C# two signed `int` quality counts | Both present, exact integers >=0; nonzero is structurally valid but **never release-eligible** | `test_bad_quality_values_are_rejected`, `test_nonzero_but_wellformed_quality_is_status_three` |
| `System.Text.Json` UTF-8 JSON output | Reject repeated/ambiguous keys, including Unicode aliases; never accept shadowed `quality` | `test_recursive_unicode_duplication_rejected`, `test_duplicate_quality_with_unicode_escaped_key_cannot_shadow` |
| W01 source function MAP is independent evidence | Each MAP entry needs actual translated function; translation-only entries lack MAP provenance unless separately authenticated | `test_translation_only_address_no_map_provenance_is_rejected`, `test_extra_translation_not_documented_by_map_must_not_be_certified` |
| Address/quality/identity separate | Full correct synthetic evidence 0; wrong DOL SHA with valid coverage 2; inadequate evidence or nonzero quality 3; malformed JSON/metadata input controlled CLI 4 | `test_cli_complete_positive_zero_and_wrong_sha_two`, `test_nonzero_but_wellformed_quality_is_status_three`, `test_malformed_translator_json_returns_controlled_cli_four` |
| `--probe` is identity-only investigation | Wrong hash may have *process* exit 0 only when everything else valid; JSON report remains `hash_match=false`, `strict_compatible=false` | `test_probe_only_waives_identity_exit_on_otherwise_valid_evidence`, `test_probe_cannot_waive_incomplete_evidence_or_bad_schema` |
| `read_map` is separate from metadata JSON | Reject Python-only `+8000...` and `8000_...`; preserve canonical plain hexadecimal MAP | `test_map_plus_prefix_is_not_canonical`, `test_map_underscore_is_not_canonical`, numeric positive tests |

The helper `scripts/strict_translation_metadata.py` is independently
approved at Phase12 public SHA `193ec4e86b37b645365ab6e475e3870a10da0a6a`.
Mario alone owns and edits `scripts/audit_profile.py`. No production
files were edited in Luigi's Phase13 worktree.

## Pending policy conflict: extra translated function vs MAP

The historical positive
`tests/phase7/test_audit_failclosed.py::
test_valid_extra_translated_func_and_empty_map_rules`
expects `strict_compatible=True` when the MAP contains only
`0x80004004` while metadata declares **both** `0x80004004` and
`0x80004008`.

The public C# metadata producer's `Functions` list describes functions
it **actually emitted**, not necessarily a claim that every entry came
from the MAP being audited. **This does NOT prove either set equality or
that a translation-only address is authentic.** A surplus could be a
valid generated helper *or* untrusted extra translation from a mismatched
source revision. The old positive alone is not evidence of safe provenance.

**Safety decision for this W01 strict gate:** retain the separately reviewed
`require_complete_map_coverage` **set equality** policy until Mario/Peach
produce a version-pinned, source-grounded, auditable subset/superset
contract for the specific MAP's origin and complete translated output.
The historical test's expected green contradicts that policy; flag it
for **independent review**, and do not silently edit or weaken its
assertion. A limited positive with matching MAP+metadata already exists
and remains green. If producer semantics prove a safe superset,
a *new* explicit provenance-aware policy and tests are required; do not
change helper by speculation.

Separate historical author test
`tests/test_audit_profile.py::test_duplicate_translation_entry_is_invalid`
expects `analyze(...)` to return a report with status 3 and `unique=2`.
The stricter helper raises `ValueError` on repeated numeric entries
(and the CLI handles it as controlled **4**). Decide whether the stable
auditor *function* API must return status3+counts for syntactically
valid-but-duplicated functions, or can reject as a structural ValueError.
It cannot silently accept duplicates. Require a justified review to
change this author's assertion; our tests intentionally do not
force its disputed exact code while source contract is unresolved.

The older `tests/test_audit_profile.py::test_rel_ranges_and_unmapped_data`
also checks exact wording of a legacy ValueError. Error semantics matter,
but new REL helper uses more precise text; message compatibility requires
explicit review, not disabling rejection.

## Evidence as of commit creation

Executed independently on unmodified old combined W01 auditor
`dd30025`:
- Initial 19-case CLI/MAP/metadata suite: **10 PASS, 9 FAIL, 0 SKIP**.
- After Toad independent review, invalid types now MUST raise ValueError
  (no raw KeyError/TypeError or generic nonzero report allowed), map syntax
  CLI MUST exit4, and missing `entryPoint` has its own assertion:
  **20 cases, 9 PASS, 10 FAIL and 1 uncontrolled ERROR (KeyError)
  against the OLD audit**, zero SKIP. This is STRONGER intentional RED.
  (a deliberately **RED** regression suite; tests explicitly identify
  false positives and missing controlled CLI status4).
- 12 new tests directly invoking the approved strict metadata helper:
  **12 PASS, 0 FAIL, 0 SKIP** (separate **GREEN** structural gate).
- Original author+helpers `tests/test_*.py`: **110 PASS, 0 FAIL, 0 SKIP**.
  That does **not** prove the legacy audit integrates the helpers.

The 20-case RED suite is *not* claimed GREEN until a NEW clean exact
Mario integration SHA exists. At that point run unchanged suite against
`NSMB_W01_AUDIT_ROOT=/path/to/EXACT-COMMIT`, plus all author,
Phase7/9/10/12 tests, without SKIP, and separately inspect CLI
codes and report fields. Do not modify Mario/Peach/Toad worktrees.

## STOP outside W01

Original Nintendo DOL source SHA still differs from the pinned translator
profile: a separately enforced hard STOP even if every synthetic audit test
eventually passes. No original guest leaf, Wii boot/HLE or gameplay claim.
Time64 remains independently approved synthetic only, not original Wii OS.
