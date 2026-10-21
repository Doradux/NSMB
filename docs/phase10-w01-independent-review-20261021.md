# Luigi — W01 Phase10 red-first evidence review (21 Oct 2026)

Reviewer: Luigi, independent read-only baseline CLEAN EXACT SHA 9708663 (Luigi-P10-W01-Clean-970). Mario-W01 remains dirty; it was NOT edited.

## Real Python validation on marcos

- PR #4 / Luigi 15 tests: 3 PASS / 12 EXPECTED RED on clean W01 SHA 9708663, zero skipped. Read-only current Mario-W01 staging: also 3 PASS / 12 EXPECTED RED.
- Peach PR #2 SHA c87090e: 10 cases on clean SHA9708663, 3 PASS / 7 EXPECTED RED, zero skipped.
- Toad PR #3 SHA 117f1fe: 6 cases against a private scratch copy of clean W01 source, 2 PASS / 4 EXPECTED RED uncontrolled AttributeError, zero skipped.
- RED cases are defects in the old auditor, NOT successful functionality. No assertions were relaxed; no original Wii data was read.

## Source anchors

- Old rel_sections uses json.loads(text) without recursive duplicate detection; Unicode-decoded object-key aliases can overwrite earlier evidence.
- layout.get("modules"), module["sections"].values(), item.get("exec") use unvalidated JSON types; null/list roots and nested null sections raise uncontrolled AttributeError.
- Translation metadata uses json.loads(metadata_text), int(entryPoint), quality.get(counter, 0); permits ambiguous duplicate quality, float truncation and bool-as-zero.
- With MAP/REL/metadata missing, old strict_compatible can be true despite incomplete evidence.
- Original DOL SHA/profile mismatch independently remains W01 HARD STOP even if parser is fixed.

## Integration requirements

Mario alone must publish new CLEAN exact W01 source SHA and resolve all Phase7/Phase9/Phase10 RED tests with original hash mismatch still incompatible; independent Peach/Toad/Luigi code review. Run REAL Node, Emscripten, serial Chromium and REA typed ABI checks for integrated synthetic Wasm only after Toad's native Time64 rollback bug is fixed. Never publish Nintendo files, private function symbols, original translated source or traces.
