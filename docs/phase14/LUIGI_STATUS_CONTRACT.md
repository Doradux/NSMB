# Luigi Phase14 — W01 return-contract and translation provenance review

Reviewed source: Mario's published Phase13 integration `faa7a219fb5bde27b0d96f430cc5620f4bf2bb9b`.
Inputs to the tests are fabricated synthetic DOL/MAP/YAML/JSON bytes. There is **no Wii executable, profile SHA from private material, or Nintendo code** here.

## Public producer evidence (not invented metadata)

The public pinned `upstream-nsmbw/translator/src/Translator.Core/Mods/BaseTranslationOutputMetadata.cs` defines `BaseTranslationFunctionMetadata(..., uint EntryPoint, ...)` (line 99), and stores it using `JsonOutput.CompactCamelCase` (line 176). `Translator.Core/IO/JsonOutput.cs` defines `CompactCamelCase` with only `PropertyNamingPolicy = JsonNamingPolicy.CamelCase` and `WriteIndented = false`; no `JsonNumberHandling.WriteAsString`. The supported producer schema is therefore **numeric JSON uint32** (not `"0x..."`, floats, booleans or decimal strings). Do not generalize from REL layout hex string formats to translator metadata.

## Semantic evidence vs malformed input: state matrix

| Case | `analyze()` behavior | CLI return | `--probe` with wrong SHA | Reason |
|---|---|---:|---|---|
| Correct SHA, clean full MAP and metadata, zero quality counters | `strict_compatible=true` | 0 | irrelevant | complete synthetic static checks |
| Wrong SHA **only**, otherwise full clean evidence | report `strict_compatible=false` | 2 | CLI 0 but report still false | investigation-only hash waiver |
| Wrong SHA AND missing MAP or metadata | report false | 3 | **3**, never 0 | missing evidence takes priority over digest mismatch |
| Correct SHA but missing MAP/metadata | report false | 3 | not a release | incomplete static coverage |
| Nonzero *well-typed nonnegative* quality counter | report false | 3 | **3** when wrong SHA | valid failure evidence, not malformed schema |
| Bad entryPoint type/range, missing quality counters, malformed JSON / Unicode duplicates | `ValueError` | 4 | **4** regardless of digest | structural evidence cannot be trusted |
| Duplicate function address, duplicate MAP with metadata, missing MAP-to-translation address on either side | `ValueError` | 4 | **4** | one-to-one provenance failed |
| Invalid MAP address syntax | `ValueError` | 4 | **4** | explicit input malformed |

A structurally valid MAP with duplicates **without** a metadata file is currently reported as 3 because coverage is incomplete; with metadata it is caught as structural 4 by the strict coverage helper. This is not a permission to certify any duplicate MAP. If uniform 4 in every partial-input condition is required, Mario must explicitly define that policy; this package does not alter his adapter.

The original author test `test_hash_mismatch_is_never_strict` expected 2 without MAP/metadata. That contradicted the Phase13 contract: missing complete evidence is 3 even if digest differs. The corrected expectation must be accompanied by a new positive control showing 2 when evidence is complete.

## Historical-contract changes proposed in a separate commit

The Phase13 helper rejects invalid metadata schema *before* an `analyze()` report exists. Legacy tests for missing/bad quality, duplicate translation addresses, duplicate MAP and MAP/metadata mismatch expected `report,status=3`. Those old expectations masked structural vs semantic distinction. The corresponding negative tests can assert the **specific ValueError** raised by the strict code, without skipping tests or weakening a single rejection. Positive controls remain unchanged.

## MAP one-to-one confidence limit

`strict_translation_metadata.py` requires exact equality of translated entry points and MAP entries; the author/peer test must reject translation-only entries without independent source evidence. Public C# serialization proves the numeric **type**, but **does not by itself prove that every public translator variant and MAP generator have the same enumeration scope**. Until independent upstream MAP-producer evidence is reviewed, a relaxed subset policy is unjustified. Peach owns resolution of stale Phase7 positive oracles; Luigi does not modify those tests.

## NEW source-backed producer-scope conflict — reviewer STOP (2026-10-25)

Public pinned `upstream-nsmbw/translator/src/Translator.Cli/Program.cs` is **not** a simple one-entry-per-MAP emitter:

- Lines 468-477 enqueue the configured `startAddr` directly, separately from the `speculativeSeeds` constructed from `functionMap?.Addresses`.
- Lines 719-739, `CommitResult`, add recursively discovered `discoveryTargets` to the translation queue, independently of a MAP listing.
- Line 875 builds `emissionAddresses` from `baseSummaries.Keys`, not from `functionMap.Addresses`. Lines 1336, 1417 and 1475-1479 build `BaseTranslationOutputMetadata` from that emitted-address collection.
- The comment at lines 474-477 states MAP entries that decode/lift unsuccessfully as *speculative seeds* may be skipped rather than fatal. Thus an input MAP entry need not appear in emitted metadata even for a legitimate translator run.
- `Translator.Core/Loading/FunctionMap.cs` lines 80-127 parses hexadecimal map entries into `HashSet<uint>` and sorts distinct `Addresses`. Its importer **deduplicates** repeated address lines; our strict auditor rejects them if raw MAP contains them.

**Conclusion:** strict set equality and rejection of every repeated raw MAP address are **conservative audit policies**, but strict equality is **NOT** proven to match all upstream generated translator outputs. A legitimate output can have translated functions discovered beyond MAP, and some speculative MAP entries can fail to translate. This upgrades the older Phase7 'extra translated function' positive contradiction from merely theoretical to a source-backed interoperability conflict. Conversely, accepting arbitrary extras just because recursion exists would allow false evidence, so **do not weaken the strict gate merely to turn tests green**.

**Required Mario+Peach+Toad decision:** define provenance for the superset of translated entries (entry roots and verified recursive discoveries), missing speculative MAP entries and classification of incomplete vs structurally broken evidence. Determine what a strict static-coverage claim actually attests; only then propose a carefully tested alternate policy. Unless a proper new evidence artifact exists, strict gate continues to fail closed (possibly false negative), original Wii remains STOP. The status matrix above is the currently implemented contract, not a universal guarantee of producer completeness.

## Reproduction

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests/phase14 -p 'test_w01_status_contract.py' -v
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p 'test_*.py' -q
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests/phase7 -p 'test_audit*.py' -q
```

A passing synthetic auditor is **not** runtime emulation and does not resolve the independent owner-original DOL/profile identity mismatch. No original Wii function may be marked verified based on these tests.
