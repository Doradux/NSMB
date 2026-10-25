"""Tests use synthetic DOL/REL fixtures; no Nintendo bytes or assets."""
import hashlib
import json
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from audit_profile import analyze, classify, dol_sections, profile_info, rel_sections, read_map


def fake_dol():
    data = bytearray(0x138)
    struct.pack_into(">I", data, 0x00, 0x100)
    struct.pack_into(">I", data, 0x48, 0x80004000)
    struct.pack_into(">I", data, 0x90, 0x20)
    struct.pack_into(">I", data, 7 * 4, 0x120)
    struct.pack_into(">I", data, 0x48 + 7 * 4, 0x80300000)
    struct.pack_into(">I", data, 0x90 + 7 * 4, 0x10)
    struct.pack_into(">III", data, 0xD8, 0x80310000, 0x1000, 0x80004004)
    data[0x100:0x120] = bytes(range(32))
    return bytes(data)


def profile(data, expected=None):
    digest = expected or hashlib.sha256(data).hexdigest()
    return f"""project:
  game_id: SMNE01
inputs:
  dol:
    sha256: {digest}
translation:
  entry_points:
    - 0x80004004
"""


def synthetic_rel():
    return json.dumps({
        "modules": [{
            "sections": {
                "1": {"addr": "0x80768000", "size": "0x20", "exec": True},
                "2": {"addr": "0x80768020", "size": "0x10", "exec": False},
            }
        }]
    })


def synthetic_meta():
    return json.dumps({
        "functions": [
            {"entryPoint": 0x80004004},
            {"entryPoint": 0x80768004},
        ],
        "quality": {"unsupportedInstructionCount": 0, "invalidSsaFunctionCount": 0},
    })


class DolAuditTests(unittest.TestCase):
    def test_valid_profile_and_map(self):
        data = fake_dol()
        report, status = analyze(data, profile(data), "80004004 start\n80768004 rel\n",
                                 synthetic_rel(), synthetic_meta())
        self.assertEqual(status, 0)
        self.assertTrue(report["strict_compatible"])
        self.assertEqual(report["function_map"]["counts"], {"dol": 1, "rel": 1, "unmapped": 0})
        self.assertEqual(report["translation"]["total"], 2)

    def test_hash_mismatch_is_never_strict(self):
        data = fake_dol()
        # Wrong SHA does not justify status 2 when MAP/metadata evidence is
        # missing. The strict contract reports incomplete evidence (3),
        # while still exposing the mismatch and NEVER claiming compatibility.
        report, status = analyze(data, profile(data, "f" * 64), None, synthetic_rel())
        self.assertEqual(status, 3)
        self.assertFalse(report["strict_compatible"])
        self.assertFalse(report["hash_match"])
        self.assertFalse(report["coverage_evidence_complete"])

    def test_hash_mismatch_with_complete_checked_evidence_is_status_two(self):
        # Positive control for the original hash-mismatch intent: only a
        # complete and otherwise valid synthetic MAP/translation/REL bundle
        # can be classified specifically as a SHA mismatch (2).
        data = fake_dol()
        report, status = analyze(
            data, profile(data, "f" * 64), "80004004 start\n80768004 rel\n",
            synthetic_rel(), synthetic_meta())
        self.assertEqual(status, 2)
        self.assertFalse(report["strict_compatible"])
        self.assertFalse(report["hash_match"])
        self.assertTrue(report["coverage_evidence_complete"])

    def test_unmapped_entry_is_invalid_even_with_correct_hash(self):
        data = fake_dol()
        report, status = analyze(data, profile(data), "80999999 unknown", synthetic_rel())
        self.assertEqual(status, 3)
        self.assertEqual(report["function_map"]["unmapped_sample"], ["0x80999999"])

    def test_unsupported_instruction_is_invalid(self):
        data = fake_dol()
        meta = json.loads(synthetic_meta())
        meta["quality"]["unsupportedInstructionCount"] = 1
        report, status = analyze(data, profile(data), None, synthetic_rel(), json.dumps(meta))
        self.assertEqual(status, 3)
        self.assertFalse(report["strict_compatible"])

    def test_duplicate_translation_entry_is_invalid(self):
        data = fake_dol()
        meta = json.loads(synthetic_meta())
        meta["functions"].append(meta["functions"][0])
        report, status = analyze(data, profile(data), None, synthetic_rel(), json.dumps(meta))
        self.assertEqual(status, 3)
        self.assertEqual(report["translation"]["unique"], 2)

    def test_truncated_and_out_of_range_dol(self):
        with self.assertRaisesRegex(ValueError, "truncated"):
            dol_sections(b"hi")
        data = bytearray(fake_dol())
        struct.pack_into(">I", data, 0x90, len(data) + 1)
        with self.assertRaisesRegex(ValueError, "exceeds"):
            dol_sections(bytes(data))

    def test_overlapping_dol_regions(self):
        data = bytearray(fake_dol())
        struct.pack_into(">I", data, 0x48 + 7 * 4, 0x80004010)
        with self.assertRaisesRegex(ValueError, "overlap"):
            dol_sections(bytes(data))

    def test_rel_ranges_and_unmapped_data(self):
        sections = rel_sections(synthetic_rel())
        self.assertEqual(classify([0x80768000, 0x80768020], [], sections)["counts"],
                         {"dol": 0, "rel": 1, "unmapped": 1})
        with self.assertRaisesRegex(ValueError, "Invalid executable"):
            rel_sections('{"modules":[{"sections":{"1":{"addr":"0xFFFFFFF0","size":"0x20","exec":true}}}]}')

    def test_bad_map_and_profile(self):
        with self.assertRaisesRegex(ValueError, "function-map"):
            read_map("not_hex_name func")
        with self.assertRaisesRegex(ValueError, "Missing"):
            profile_info("translation: {}")

    def test_zero_section_and_out_of_range(self):
        data = bytearray(fake_dol())
        struct.pack_into(">I", data, 0x90, 0)
        struct.pack_into(">I", data, 0x90 + 7 * 4, 0)
        with self.assertRaisesRegex(ValueError, "no sections"):
            dol_sections(bytes(data))
        with self.assertRaisesRegex(ValueError, "uint32"):
            classify([-1], [], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
