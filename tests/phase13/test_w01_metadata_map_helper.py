"""Phase13 direct helper contract verification, separate from the unfinished auditor.

This is GREEN on the imported, already reviewed Phase12 metadata parser;
the CLI integration oracles in test_w01_metadata_map_cli.py are RED against
old audit_profile.py until Mario supplies a clean reviewed integration SHA.
"""
from __future__ import annotations
import json
from pathlib import Path
import sys
import unittest

SCRIPT_DIR = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))
from strict_translation_metadata import (
    parse_translation_metadata, quality_clean,
    require_complete_map_coverage,
)

A, B = 0x80004004, 0x80004008
Q = {"unsupportedInstructionCount": 0, "invalidSsaFunctionCount": 0}


def envelope(*entries, quality=Q):
    return json.dumps({"functions": [{"entryPoint": addr} for addr in entries],
                       "quality": quality})


class ImportedNumericABI(unittest.TestCase):
    def test_source_authoritative_numeric_uint32_positive(self):
        r = parse_translation_metadata(envelope(A, B), map_addresses=[B, A])
        self.assertTrue(r["map_coverage_verified"])
        self.assertEqual(r["addresses"], [A, B])
        self.assertTrue(quality_clean(r))

    def test_accepts_upstream_unsigned_boundaries(self):
        r = parse_translation_metadata(envelope(0, 0xFFFFFFFF),
                                       map_addresses=[0, 0xFFFFFFFF])
        self.assertEqual(r["total"], 2)

    def test_all_string_or_noninteger_values_are_structurally_rejected(self):
        for bad in ("0x80004004", "2147500036", "+0x80004004", True,
                    False, 0.0, A + 0.5, -1, 1 << 32, None):
            with self.subTest(bad=repr(bad)), self.assertRaises(ValueError):
                parse_translation_metadata(envelope(bad))

    def test_recursive_unicode_duplication_rejected(self):
        bad = ('{"functions":[{"entryPoint":' + str(A) + '}],'
               '"quality":' + json.dumps(Q) + ',"qual\\u0069ty":' +
               json.dumps(Q) + "}")
        with self.assertRaises(ValueError):
            parse_translation_metadata(bad)

    def test_bad_quality_values_are_rejected(self):
        for bad in (True, False, 0.0, None, -1, "0"):
            q = dict(Q, invalidSsaFunctionCount=bad)
            with self.subTest(bad=repr(bad)), self.assertRaises(ValueError):
                parse_translation_metadata(envelope(A, quality=q))

    def test_nonzero_quality_is_structurally_valid_but_not_clean(self):
        q = dict(Q, unsupportedInstructionCount=3)
        r = parse_translation_metadata(envelope(A), map_addresses=[A])
        self.assertTrue(quality_clean(r))
        r = parse_translation_metadata(envelope(A, quality=q),
                                       map_addresses=[A])
        self.assertEqual(r["quality"]["unsupportedInstructionCount"], 3)
        self.assertFalse(quality_clean(r))

    def test_translation_only_address_no_map_provenance_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Incomplete MAP"):
            parse_translation_metadata(envelope(A, B), map_addresses=[A])

    def test_map_only_address_without_generated_function_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Incomplete MAP"):
            parse_translation_metadata(envelope(A), map_addresses=[A, B])

    def test_duplicate_map_address_must_be_rejected_even_if_set_equal(self):
        with self.assertRaisesRegex(ValueError, "Repeated MAP"):
            parse_translation_metadata(envelope(A), map_addresses=[A, A])

    def test_duplicate_translation_address_must_be_rejected(self):
        with self.assertRaisesRegex(ValueError, "Repeated translation"):
            parse_translation_metadata(envelope(A, A), map_addresses=[A])

    def test_map_not_provided_cannot_be_called_verified(self):
        r = parse_translation_metadata(envelope(A))
        self.assertFalse(r["map_coverage_verified"])

    def test_raw_map_text_is_not_validated_numeric_evidence(self):
        with self.assertRaises(ValueError):
            require_complete_map_coverage("80004004 a", [A])


if __name__ == "__main__":
    unittest.main()
