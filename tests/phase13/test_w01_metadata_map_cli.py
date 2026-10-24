"""Luigi Phase13: exact W01 auditor interoperability contracts, synthetic only.

Run against an immutable, clean candidate:
  NSMB_W01_AUDIT_ROOT=/path/to/EXACT-COMMIT \
    PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover \
    -s tests/phase13 -p 'test_w01_metadata_map_cli.py' -v

Every fixture DOL/MAP/JSON/profile is invented in memory. The code imports no
original game material and touches no private path. It does NOT implement the
audit or alter any other agent's assertions.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

SOURCE_ROOT = Path(os.environ.get(
    "NSMB_W01_AUDIT_ROOT", Path(__file__).resolve().parents[2]
))
SCRIPT = SOURCE_ROOT / "scripts" / "audit_profile.py"
if not SCRIPT.is_file():
    raise RuntimeError(f"Missing exact audited source: {SCRIPT}")
_spec = importlib.util.spec_from_file_location("luigi_phase13_audit_candidate", SCRIPT)
audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit)

DOL_HEADER = bytearray(0x160)
struct.pack_into(">I", DOL_HEADER, 0, 0x100)
struct.pack_into(">I", DOL_HEADER, 0x48, 0x80004000)
struct.pack_into(">I", DOL_HEADER, 0x90, 0x30)
struct.pack_into(">III", DOL_HEADER, 0xD8, 0x80310000, 0x1000, 0x80004004)
DOL_HEADER[0x100:0x130] = bytes(range(0x30))
DOL = bytes(DOL_HEADER)
HASH = hashlib.sha256(DOL).hexdigest()
PROFILE = (
    "project:\n  game_id: SYNTHETIC\ninputs:\n  dol:\n    sha256: " + HASH +
    "\ntranslation:\n  entry_points:\n    - 0x80004004\n"
)
MAP = "80004004 synthetic_function\n"
A = 0x80004004
B = 0x80004008
QUALITY = {"unsupportedInstructionCount": 0, "invalidSsaFunctionCount": 0}


def metadata(*functions: object, quality: object = None) -> str:
    return json.dumps({
        "format": "mkw-base-translation-output",
        "formatVersion": 2,
        "functions": [{"entryPoint": item} for item in (functions or (A,))],
        "quality": QUALITY if quality is None else quality,
    })


class ExactAuditorContract(unittest.TestCase):
    def inspect(self, *, map_text=MAP, meta=None, profile=PROFILE):
        return audit.analyze(DOL, profile, map_text, None, metadata() if meta is None else meta)

    def reject(self, **kwargs):
        """Schema errors may raise ValueError; evidence failures must not be green."""
        try:
            report, code = self.inspect(**kwargs)
        except (ValueError, KeyError, TypeError):
            return
        self.assertIs(report["strict_compatible"], False)
        self.assertNotEqual(code, 0)

    def test_positive_complete_numeric_metadata_has_status_zero(self):
        report, status = self.inspect()
        self.assertEqual(status, 0)
        self.assertIs(report["strict_compatible"], True)
        self.assertTrue(report["hash_match"])
        self.assertEqual(report["function_map"]["counts"]["dol"], 1)

    def test_checksum_mismatch_with_valid_evidence_is_status_two(self):
        report, status = self.inspect(profile=PROFILE.replace(HASH, "f" * 64))
        self.assertEqual(status, 2)
        self.assertIs(report["strict_compatible"], False)

    def test_missing_map_or_metadata_is_status_three_not_success(self):
        for choice in ({"map_text": None}, {"meta": None}):
            with self.subTest(choice=choice):
                if "meta" in choice:
                    # inspect() defaults missing meta to complete evidence.
                    report, status = audit.analyze(DOL, PROFILE, MAP, None, None)
                else:
                    report, status = self.inspect(**choice)
                self.assertEqual(status, 3)
                self.assertIs(report["strict_compatible"], False)

    def test_nonzero_but_wellformed_quality_is_status_three(self):
        quality = dict(QUALITY, unsupportedInstructionCount=1)
        report, status = self.inspect(meta=metadata(quality=quality))
        self.assertEqual(status, 3)
        self.assertIs(report["strict_compatible"], False)

    def test_fractional_entrypoint_must_not_truncate_into_valid_address(self):
        self.reject(meta=metadata(A + 0.25))

    def test_boolean_entrypoint_is_structurally_invalid_not_coerced(self):
        self.reject(meta=metadata(True))

    def test_hexadecimal_string_metadata_entrypoint_is_not_csharp_uint(self):
        self.reject(meta=metadata("0x80004004"))

    def test_decimal_string_metadata_entrypoint_is_not_csharp_uint(self):
        self.reject(meta=metadata(str(A)))

    def test_uint32_overflow_does_not_map_into_guest_range(self):
        self.reject(meta=metadata(1 << 32))

    def test_duplicate_quality_with_unicode_escaped_key_cannot_shadow(self):
        raw = ('{"functions":[{"entryPoint":' + str(A) + '}],'
               '"quality":{"unsupportedInstructionCount":9},'
               '"qual\\u0069ty":' + json.dumps(QUALITY) + "}")
        self.reject(meta=raw)

    def test_extra_translation_not_documented_by_map_must_not_be_certified(self):
        self.reject(meta=metadata(A, B))

    def test_map_entry_without_translation_must_not_be_certified(self):
        self.reject(map_text=MAP + "80004008 extra\n")

    def test_map_plus_prefix_is_not_canonical(self):
        self.reject(map_text="+80004004 fake\n")

    def test_map_underscore_is_not_canonical(self):
        self.reject(map_text="8000_4004 fake\n")

    def test_malformed_translator_json_returns_controlled_cli_four(self):
        self._cli(expected=4, meta='{"functions":[', probe=False)

    def test_invalid_numeric_type_returns_controlled_cli_four(self):
        self._cli(expected=4, meta=metadata("0x80004004"), probe=False)

    def test_cli_complete_positive_zero_and_wrong_sha_two(self):
        self._cli(expected=0)
        self._cli(expected=2, profile=PROFILE.replace(HASH, "f" * 64))

    def test_probe_only_waives_identity_exit_on_otherwise_valid_evidence(self):
        bad_profile = PROFILE.replace(HASH, "f" * 64)
        proc = self._cli(expected=0, profile=bad_profile, probe=True)
        report = json.loads(proc.stdout)
        self.assertFalse(report["hash_match"])
        self.assertFalse(report["strict_compatible"])

    def test_probe_cannot_waive_incomplete_evidence_or_bad_schema(self):
        self._cli(expected=3, map_text=None, probe=True,
                  profile=PROFILE.replace(HASH, "f" * 64))
        self._cli(expected=4, meta=metadata("0x80004004"), probe=True,
                  profile=PROFILE.replace(HASH, "f" * 64))

    def _cli(self, *, expected, map_text=MAP, meta=None, profile=PROFILE,
             probe=False):
        with tempfile.TemporaryDirectory(prefix="luigi-w01-synthetic-") as scratch:
            root = Path(scratch)
            (root / "source.dol").write_bytes(DOL)
            (root / "profile.yml").write_text(profile, encoding="utf-8")
            args = [
                sys.executable, "-B", str(SCRIPT),
                "--dol", str(root / "source.dol"),
                "--profile", str(root / "profile.yml"),
            ]
            if map_text is not None:
                (root / "source.map").write_text(map_text, encoding="utf-8")
                args.extend(["--map", str(root / "source.map")])
            if meta is not None or (map_text is not None):
                (root / "translation.json").write_text(
                    metadata() if meta is None else meta, encoding="utf-8"
                )
                args.extend(["--translation-metadata", str(root / "translation.json")])
            if probe:
                args.append("--probe")
            proc = subprocess.run(args, capture_output=True, text=True,
                                  timeout=15, check=False)
            self.assertEqual(proc.returncode, expected, (
                f"expected CLI exit {expected}, got {proc.returncode}; "
                f"stderr={proc.stderr!r}"
            ))
            if expected == 4:
                self.assertIn("Audit failed:", proc.stderr)
            return proc


if __name__ == "__main__":
    unittest.main(verbosity=2)
