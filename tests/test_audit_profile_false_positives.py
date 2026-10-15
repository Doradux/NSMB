"""Red-first, copyright-free reproductions of five W01 audit false positives.

These tests intentionally FAIL against audit_profile.py at 9708663. They
must pass before a corrected audit can be reviewed or merged. No Wii data.
"""
from __future__ import annotations

import hashlib
import json
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from audit_profile import analyze, dol_sections


def fake_dol() -> bytes:
    data = bytearray(0x160)
    struct.pack_into(">I", data, 0, 0x100)
    struct.pack_into(">I", data, 0x48, 0x80004000)
    struct.pack_into(">I", data, 0x90, 0x20)
    struct.pack_into(">III", data, 0xD8, 0x80310000, 0x1000, 0x80004004)
    data[0x100:0x120] = bytes(range(32))
    return bytes(data)


def profile(data: bytes, *, specified_sha: str | None = None,
            prefix: str = "") -> str:
    actual = hashlib.sha256(data).hexdigest()
    return (
        prefix
        + "project:\n  game_id: SMNE01\n"
        + "inputs:\n  dol:\n    sha256: "
        + (specified_sha or actual)
        + "\ntranslation:\n  entry_points:\n    - 0x80004004\n"
    )


def metadata(*addresses: int, quality: dict | None = None) -> str:
    result = {"functions": [{"entryPoint": a} for a in addresses]}
    if quality is not None:
        result["quality"] = quality
    return json.dumps(result)


GOOD_QUALITY = {"unsupportedInstructionCount": 0,
                "invalidSsaFunctionCount": 0}


class CompatibilityNegativeRegressionTests(unittest.TestCase):
    def test_unrelated_preceding_hash_never_masks_dol_checksum(self):
        data = fake_dol()
        unrelated_actual = hashlib.sha256(data).hexdigest()
        misleading_profile = profile(
            data,
            specified_sha="f" * 64,
            prefix="extras:\n  unrelated_asset:\n    sha256: "
                   + unrelated_actual + "\n")
        report, status = analyze(
            data, misleading_profile, "80004004 start",
            None, metadata(0x80004004, quality=GOOD_QUALITY))
        self.assertFalse(report["hash_match"])
        self.assertFalse(report["strict_compatible"])
        self.assertNotEqual(status, 0)

    def test_two_dol_sections_cannot_alias_same_file_bytes(self):
        data = bytearray(fake_dol())
        struct.pack_into(">I", data, 4, 0x100)  # second text offset aliases first
        struct.pack_into(">I", data, 0x48 + 4, 0x80005000)
        struct.pack_into(">I", data, 0x90 + 4, 0x20)
        with self.assertRaisesRegex(ValueError, "(file|overlap|alias)"):
            dol_sections(bytes(data))

    def test_map_entries_missing_from_translation_never_pass_strict(self):
        data = fake_dol()
        report, status = analyze(
            data, profile(data), "80004004 a\n80004008 b\n",
            None, metadata(0x80004004, quality=GOOD_QUALITY))
        self.assertFalse(report["strict_compatible"],
                         "Mapped executable addresses must be translated")
        self.assertNotEqual(status, 0)

    def test_missing_translator_quality_counters_never_pass_strict(self):
        data = fake_dol()
        report, status = analyze(
            data, profile(data), "80004004 a", None,
            metadata(0x80004004))
        self.assertFalse(report["strict_compatible"],
                         "Absent counters cannot default to zero defects")
        self.assertNotEqual(status, 0)

    def test_hash_only_input_is_not_full_static_coverage(self):
        data = fake_dol()
        report, status = analyze(data, profile(data))
        self.assertFalse(report["strict_compatible"],
                         "Hash alone cannot establish function coverage")
        self.assertNotEqual(status, 0)

    def test_noninteger_and_negative_quality_fields_are_not_verified(self):
        data = fake_dol()
        for bad in (True, -1, "0", None, 0.0):
            with self.subTest(bad=bad):
                quality = dict(GOOD_QUALITY)
                quality["unsupportedInstructionCount"] = bad
                report, code = analyze(
                    data, profile(data), "80004004 a", None,
                    metadata(0x80004004, quality=quality))
                self.assertFalse(report["strict_compatible"])
                self.assertFalse(report["translation"]["quality_verified"])
                self.assertNotEqual(code, 0)

    def test_metadata_only_is_not_full_map_coverage(self):
        data = fake_dol()
        report, status = analyze(
            data, profile(data), None, None,
            metadata(0x80004004, quality=GOOD_QUALITY))
        self.assertFalse(report["strict_compatible"])
        self.assertFalse(report["coverage_evidence_complete"])
        self.assertNotEqual(status, 0)

    def test_repeated_map_entries_fail_closed(self):
        data = fake_dol()
        report, status = analyze(
            data, profile(data), "80004004 a\n80004004 b\n", None,
            metadata(0x80004004, quality=GOOD_QUALITY))
        self.assertFalse(report["strict_compatible"])
        self.assertNotEqual(status, 0)

    def test_complete_synthetic_inputs_are_eligible_for_static_coverage(self):
        data = fake_dol()
        report, status = analyze(
            data, profile(data), "80004004 a", None,
            metadata(0x80004004, quality=GOOD_QUALITY))
        self.assertEqual(status, 0)
        self.assertTrue(report["strict_compatible"])

    def test_complete_coverage_does_not_override_bad_pinned_hash(self):
        data = fake_dol()
        report, status = analyze(
            data, profile(data, specified_sha="f" * 64),
            "80004004 a", None,
            metadata(0x80004004, quality=GOOD_QUALITY))
        self.assertNotEqual(status, 0)
        self.assertFalse(report["strict_compatible"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
