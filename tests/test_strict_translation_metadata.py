"""Adversarial Phase12 tests for strict_translation_metadata. Synthetic JSON only.

Standalone:
    PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover \
      -s tests -p 'test_strict_translation_metadata.py' -v
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from strict_translation_metadata import (
    UINT32_MAX,
    load_translation_json,
    parse_translation_metadata,
    quality_clean,
    require_complete_map_coverage,
    strict_uint32,
)

A = 0x80004004
B = 0x80500004
QUALITY = {"unsupportedInstructionCount": 0, "invalidSsaFunctionCount": 0}


def good(*addresses: int) -> str:
    return json.dumps({
        "format": "mkw-base-translation-output",
        "formatVersion": 2,
        "functions": [{"entryPoint": p, "relativePath": f"gen/{i}.cpp"}
                      for i, p in enumerate(addresses or (A, B))],
        "quality": QUALITY,
    })


class GoodSyntheticMetadata(unittest.TestCase):
    def test_two_canonical_functions_are_accepted_and_order_preserved(self):
        obj = parse_translation_metadata(good(), map_addresses=[B, A])
        self.assertEqual(obj["addresses"], [A, B])
        self.assertEqual((obj["total"], obj["unique"]), (2, 2))
        self.assertTrue(obj["quality_verified"])
        self.assertTrue(obj["map_coverage_verified"])
        self.assertTrue(quality_clean(obj))
        self.assertEqual(obj["functions"][0]["relativePath"], "gen/0.cpp")

    def test_valid_uint32_boundaries_and_extra_metadata_fields(self):
        obj = parse_translation_metadata(good(0, UINT32_MAX),
                                         map_addresses=[UINT32_MAX, 0])
        self.assertEqual(obj["addresses"], [0, UINT32_MAX])

    def test_valid_quality_positive_counters_are_retained_not_claimed_clean(self):
        data = json.loads(good())
        data["quality"]["unsupportedInstructionCount"] = 7
        data["quality"]["invalidSsaFunctionCount"] = 2
        obj = parse_translation_metadata(json.dumps(data))
        self.assertEqual(obj["quality"]["unsupportedInstructionCount"], 7)
        self.assertFalse(quality_clean(obj))

    def test_valid_clean_empty_map_option_is_not_declared_verified(self):
        obj = parse_translation_metadata(good())
        self.assertFalse(obj["map_coverage_verified"])

    def test_canonical_hex_strings_are_accepted_and_normalized_to_uint32(self):
        source = json.loads(good())
        source["functions"][1]["entryPoint"] = "0x80500004"
        parsed = parse_translation_metadata(json.dumps(source), map_addresses=[A, B])
        self.assertEqual(parsed["addresses"], [A, B])
        self.assertEqual(parsed["functions"][1]["entryPoint"], B)
        for prefix in ("0x", "0X"):
            self.assertEqual(strict_uint32(prefix + "80500004",
                allow_canonical_hex=True), B)

    def test_no_coercion_from_decimal_to_integer(self):
        self.assertEqual(strict_uint32(A), A)
        self.assertEqual(strict_uint32(0), 0)
        self.assertEqual(strict_uint32(UINT32_MAX), UINT32_MAX)


class DuplicateJSONRejection(unittest.TestCase):
    def test_direct_root_duplicate(self):
        source = '{"functions":[],"functions":[],"quality":{}}'
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            parse_translation_metadata(source)

    def test_root_unicode_escaped_key_alias(self):
        source = '{"functions":[],"funct\\u0069ons":[],"quality":{}}'
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            parse_translation_metadata(source)

    def test_nested_quality_counter_duplicate(self):
        source = ('{"functions":[{"entryPoint":2147500036}],'
                  '"quality":{"unsupportedInstructionCount":10,'
                  '"unsupportedInstructionCount":0,"invalidSsaFunctionCount":0}}')
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            parse_translation_metadata(source)

    def test_nested_quality_counter_unicode_key(self):
        source = ('{"functions":[{"entryPoint":2147500036}],'
                  '"quality":{"invalidSsaFunctionCount":5,'
                  '"invalidSsaFunctionCo\\u0075nt":0,'
                  '"unsupportedInstructionCount":0}}')
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            parse_translation_metadata(source)

    def test_duplicate_entrypoint_same_key_and_unicode_alias(self):
        for source in (
            '{"entryPoint":1,"entryPoint":2147500036}',
            '{"entryPoint":1,"entryPo\\u0069nt":2147500036}',
        ):
            with self.subTest(source=source):
                metadata = '{"functions":[' + source + '],"quality":' + json.dumps(QUALITY) + '}'
                with self.assertRaisesRegex(ValueError, "Duplicate"):
                    parse_translation_metadata(metadata)

    def test_hidden_duplicate_inside_extra_unknown_metadata(self):
        metadata = good()
        metadata = metadata[:-1] + ',"extra":{"inner":[{"policy":{"ok":true,"ok":false}}]}}'
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            parse_translation_metadata(metadata)

    def test_nfkc_unicode_compatibility_key_alias_rejected(self):
        source = good()[:-1] + ',"ｑｕａｌｉｔｙ":' + json.dumps(QUALITY) + '}'
        with self.assertRaisesRegex(ValueError, "ambiguous Unicode"):
            parse_translation_metadata(source)

    def test_identical_duplicate_rejected_even_if_values_match(self):
        metadata = '{"functions":[{"entryPoint":1,"entryPoint":1}],"quality":' + json.dumps(QUALITY) + '}'
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            parse_translation_metadata(metadata)

    def test_unicode_key_is_normalized_before_schema_access(self):
        metadata = ('{"funct\\u0069ons":[{"entryPo\\u0069nt":' + str(A) +
                    '}],"qual\\u0069ty":' + json.dumps(QUALITY) + '}')
        self.assertEqual(parse_translation_metadata(metadata)["addresses"], [A])

    def test_nonfinite_overflowed_float_in_extra_evidence_fails_closed(self):
        metadata = good()[:-1] + ',"extra":{"deep":[1e9999]}}'
        with self.assertRaisesRegex(ValueError, "Nonfinite"):
            parse_translation_metadata(metadata)

    def test_unpaired_unicode_surrogates_fail_closed(self):
        for tail in ('"\\ud800"', '{"\\udfff":1}', '["\\ud800"]'):
            with self.subTest(tail=tail):
                metadata = good()[:-1] + ',"other":' + tail + '}'
                with self.assertRaisesRegex(ValueError, "surrogate"):
                    parse_translation_metadata(metadata)

    def test_reject_nonfinite_constants_at_any_depth(self):
        for nonfinite in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(nonfinite=nonfinite):
                source = good()[:-1] + f',"extra":{{"inside":[{nonfinite}]}}}}'
                with self.assertRaisesRegex(ValueError, "Nonfinite"):
                    parse_translation_metadata(source)


class SchemaRejection(unittest.TestCase):
    def test_bad_roots(self):
        for source in ('null', 'false', '[]', '0', '"string"', 'true'):
            with self.subTest(source=source):
                with self.assertRaises(ValueError):
                    parse_translation_metadata(source)

    def test_bad_functions(self):
        for bad in (None, False, 3, "[]", {}, [], [None], [1],
                    ["item"], [True], [{"notEntryPoint": A}]):
            with self.subTest(bad=repr(bad)):
                source = json.dumps({"functions": bad, "quality": QUALITY})
                with self.assertRaises(ValueError):
                    parse_translation_metadata(source)

    def test_bad_entrypoint_types_values(self):
        for bad in (True, False, None, 0.0, 3.0, A + 0.9, -1, 2**32,
                    "+0x80004004", "0x8000_4004", "0x000000000",
                    str(A), "2147500036", "0", "", [],
                    {}, ["0x80004004"]):
            with self.subTest(bad=repr(bad)):
                source = json.dumps({"functions": [{"entryPoint": bad}],
                                     "quality": QUALITY})
                with self.assertRaisesRegex(ValueError, "integer uint32"):
                    parse_translation_metadata(source)

    def test_duplicate_function_addresses_in_different_forms(self):
        raw = good()
        obj = json.loads(raw)
        obj["functions"].append({"entryPoint": A})
        with self.assertRaisesRegex(ValueError, "Repeated translation"):
            parse_translation_metadata(json.dumps(obj))

    def test_missing_or_bad_quality(self):
        for bad in (None, False, 1, "0", [], {}, [QUALITY]):
            with self.subTest(bad=repr(bad)):
                obj = json.loads(good())
                obj["quality"] = bad
                with self.assertRaises(ValueError):
                    parse_translation_metadata(json.dumps(obj))

    def test_bad_quality_values(self):
        for key in QUALITY:
            for bad in (None, True, False, -1, 2.5, 0.0, "0", "0x0", [],
                        {}, 10**1000 if sys.get_int_max_str_digits()==0 else 2**62 * -1):
                with self.subTest(key=key, bad=repr(bad)):
                    data = json.loads(good())
                    data["quality"][key] = bad
                    with self.assertRaises(ValueError):
                        parse_translation_metadata(json.dumps(data))

    def test_missing_counter_cannot_default_to_zero(self):
        for key in QUALITY:
            with self.subTest(key=key):
                data = json.loads(good())
                del data["quality"][key]
                with self.assertRaisesRegex(ValueError, "present nonnegative"):
                    parse_translation_metadata(json.dumps(data))

    def test_bad_json_format_returns_controlled_error(self):
        for source in ('{', '{}junk', '{"functions":', '\\'):
            with self.subTest(source=source):
                with self.assertRaises(ValueError):
                    parse_translation_metadata(source)

    def test_bad_json_depth_returns_valueerror_not_uncaught_recursionerror(self):
        source = '[' * 2000 + '0' + ']' * 2000
        with self.assertRaises(ValueError):
            load_translation_json(source)


class MAPCoverageRejection(unittest.TestCase):
    def test_exact_complete_coverage_is_accepted_regardless_of_order(self):
        obj = parse_translation_metadata(good(), map_addresses=(p for p in (B, A)))
        self.assertTrue(obj["map_coverage_verified"])

    def test_missing_translation_in_metadata(self):
        with self.assertRaisesRegex(ValueError, "Incomplete MAP"):
            parse_translation_metadata(good(A), map_addresses=[A, B])

    def test_missing_map_of_extra_translator_address(self):
        with self.assertRaisesRegex(ValueError, "Incomplete MAP"):
            parse_translation_metadata(good(A, B), map_addresses=[A])

    def test_duplicate_map_addresses(self):
        with self.assertRaisesRegex(ValueError, "Repeated MAP"):
            parse_translation_metadata(good(A, B), map_addresses=[A, A, B])

    def test_empty_map_is_incomplete(self):
        with self.assertRaises(ValueError):
            parse_translation_metadata(good(), map_addresses=[])

    def test_bad_map_scalar_types(self):
        for bad in (True, A + 0.5, str(A), None, -1, 2**32):
            with self.subTest(bad=repr(bad)):
                with self.assertRaises(ValueError):
                    require_complete_map_coverage([bad, B], [A, B])

    def test_map_text_not_valid_address_container(self):
        with self.assertRaises(ValueError):
            require_complete_map_coverage("80004004", [A])
        with self.assertRaises(ValueError):
            require_complete_map_coverage(None, [A])

    def test_untrusted_duplicate_translation_addresses_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "Repeated translation"):
            require_complete_map_coverage([A], [A, A])


if __name__ == "__main__":
    unittest.main()
