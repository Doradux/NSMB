"""Peach independent contract review for Luigi exact clean metadata helper.

Explicit only, not an audit-wide test:
 NSMB_P12_METADATA_HELPER_ROOT=/absolute/detached/review/sha \
   python3 -B tests/phase12/review_metadata_helper.py

Public synthetic JSON; no Nintendo source or private artifacts.
"""
from __future__ import annotations
import importlib.util
import json
import os
from pathlib import Path
import unittest

ROOT=os.environ.get("NSMB_P12_METADATA_HELPER_ROOT")
if not ROOT or not Path(ROOT).is_absolute():
    raise RuntimeError("Exact absolute Luigi clean helper checkout required")
path=Path(ROOT)/"scripts"/"strict_translation_metadata.py"
if not path.is_file():
    raise RuntimeError("Missing strict helper: "+str(path))
spec=importlib.util.spec_from_file_location("reviewed_metadata_parser",path)
parser=importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)
A,B=0x80004004,0x80500004
Q={"unsupportedInstructionCount":0,"invalidSsaFunctionCount":0}
def good():
    return {"functions":[{"entryPoint":A},{"entryPoint":B}],"quality":dict(Q)}

class PeerTranslationProvenance(unittest.TestCase):
    def test_real_json_integer_positive_and_exact_map(self):
        p=parser.parse_translation_metadata(json.dumps(good()),map_addresses=[B,A])
        self.assertEqual(p["addresses"],[A,B])
        self.assertTrue(p["map_coverage_verified"])
        self.assertTrue(parser.quality_clean(p))

    def test_upstream_uint_json_abi_rejects_all_entrypoint_strings(self):
        m=good()
        for entry in (str(B),"0x80500004","+0x80500004","0x8050_0004"," 0x80500004"):
            with self.subTest(entry=entry):
                m["functions"][1]["entryPoint"]=entry
                with self.assertRaises(ValueError):
                    parser.parse_translation_metadata(json.dumps(m),map_addresses=[A,B])

    def test_fractions_bool_and_invalid_uint32_fail(self):
        for value in (float(B)+0.5, True, -1, 2**32):
            with self.subTest(value=repr(value)):
                m=good();m["functions"][1]["entryPoint"]=value
                with self.assertRaises(ValueError):
                    parser.parse_translation_metadata(json.dumps(m),map_addresses=[A,B])

    def test_quality_extra_can_be_finite_but_nonzero_fails_release(self):
        m=good()
        m["quality"]["syntheticBuildId"]="independent"
        m["quality"]["unsupportedInstructionCount"]=4
        p=parser.parse_translation_metadata(json.dumps(m),map_addresses=[A,B])
        self.assertFalse(parser.quality_clean(p))
        self.assertEqual(p["quality"]["syntheticBuildId"],"independent")

    def test_duplicate_nested_function_key_even_identical_rejected(self):
        metadata=(
            '{"functions":[{"entryPoint":%d,"entryPoint":%d},{"entryPoint":%d}],'
            '"quality":{"unsupportedInstructionCount":0,"invalidSsaFunctionCount":0}}'
            % (A,A,B)
        )
        with self.assertRaises(ValueError):
            parser.parse_translation_metadata(metadata,map_addresses=[A,B])

    def test_nfkc_duplicate_quality_and_overflow_extra_rejected(self):
        m=json.dumps(good())
        for tail in (
            ',"ｑｕａｌｉｔｙ":'+json.dumps(Q),
            ',"unused":{"deep":[1e9999]}',
        ):
            with self.subTest(tail=tail[:35]):
                with self.assertRaises(ValueError):
                    parser.parse_translation_metadata(m[:-1]+tail+"}",map_addresses=[A,B])

    def test_exact_map_excludes_missing_extras_and_duplicates(self):
        for m in ([A],[A,B,B],[A,B,0x80600000]):
            with self.subTest(mapping=m):
                with self.assertRaises(ValueError):
                    parser.parse_translation_metadata(json.dumps(good()),map_addresses=m)

if __name__=="__main__":
    unittest.main(verbosity=2)
