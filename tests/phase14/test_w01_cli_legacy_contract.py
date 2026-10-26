"""Peach Phase14 independent real CLI negative and positive status matrix.

Use only synthetic 0x160-byte DOL constructed at test time, never private
original DOL/REL/ISO/profile. Run via subprocess with actual source CLI.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(os.environ.get("NSMB_W01_AUDIT_ROOT", Path(__file__).resolve().parents[2]))
CLI = ROOT / "scripts" / "audit_profile.py"
if not CLI.is_file():
    raise RuntimeError(f"Candidate CLI missing: {CLI}")

def dol_bytes():
    b = bytearray(0x160)
    struct.pack_into(">I", b, 0, 0x100)
    struct.pack_into(">I", b, 0x48, 0x80004000)
    struct.pack_into(">I", b, 0x90, 0x20)
    struct.pack_into(">III", b, 0xD8, 0x80310000, 0x1000, 0x80004004)
    b[0x100:0x120] = bytes(range(32))
    return bytes(b)

DOL = dol_bytes()
HASH = hashlib.sha256(DOL).hexdigest()
MAP = "80004004 test_function\n"
QUALITY = {"unsupportedInstructionCount": 0, "invalidSsaFunctionCount": 0}

def metadata(functions=None, quality=None):
    if functions is None:
        functions = [0x80004004]
    if quality is None:
        quality = dict(QUALITY)
    return json.dumps({
        "functions": [{"entryPoint": a} for a in functions],
        "quality": quality,
    })

def profile(sha=HASH):
    return ("project:\n  game_id: SYNTHETIC\n"
            "inputs:\n  dol:\n    sha256: " + sha
            + "\ntranslation:\n  entry_points:\n    - 0x80004004\n")

class StrictW01LegacyCli(unittest.TestCase):
    def run_cli(self, *, map_text=MAP, meta=None, sha=HASH, probe=False):
        with tempfile.TemporaryDirectory(prefix="peach-p14-synthetic-cli-") as folder:
            t = Path(folder)
            (t / "fake.dol").write_bytes(DOL)
            (t / "profile.yml").write_text(profile(sha), encoding="utf-8")
            args = [sys.executable, "-B", str(CLI),
                    "--dol", str(t / "fake.dol"),
                    "--profile", str(t / "profile.yml")]
            if map_text is not None:
                (t / "fake.map").write_text(map_text, encoding="utf-8")
                args.extend(["--map", str(t / "fake.map")])
            if meta is not None:
                (t / "meta.json").write_text(meta, encoding="utf-8")
                args.extend(["--translation-metadata", str(t / "meta.json")])
            if probe:
                args.append("--probe")
            return subprocess.run(args, capture_output=True, text=True,
                                  timeout=15, check=False)

    def assert_status(self, status, **kwargs):
        result = self.run_cli(**kwargs)
        self.assertEqual(result.returncode, status,
                         f"expected {status}, got {result.returncode}; "
                         f"stdout={result.stdout!r}; stderr={result.stderr!r}")
        if status == 4:
            self.assertIn("Audit failed:", result.stderr)
            self.assertNotIn('"strict_compatible": true', result.stdout.lower())
        else:
            report = json.loads(result.stdout)
            self.assertIs(report["strict_compatible"], status == 0 and not kwargs.get("probe", False))
        return result

    def test_fully_supported_synthetic_coverage_is_status_zero(self):
        self.assert_status(0, meta=metadata())

    def test_valid_wrong_sha_only_yields_status_two(self):
        self.assert_status(2, sha="f" * 64, meta=metadata())

    def test_hash_only_incomplete_evidence_yields_three_even_on_bad_sha(self):
        self.assert_status(3, sha="f" * 64, map_text=None)
        self.assert_status(3, sha="f" * 64, meta=None)

    def test_nonzero_wellformed_quality_is_semantic_status_three(self):
        quality = dict(QUALITY, unsupportedInstructionCount=1)
        self.assert_status(3, meta=metadata(quality=quality))

    def test_structural_missing_quality_is_error_four(self):
        self.assert_status(4, meta=json.dumps({"functions": [{"entryPoint":0x80004004}]}))

    def test_structural_bad_quality_type_is_error_four(self):
        for bad in (False, True, -1, 0.5, "0", None):
            with self.subTest(value=repr(bad)):
                quality = dict(QUALITY, unsupportedInstructionCount=bad)
                self.assert_status(4, meta=metadata(quality=quality))

    def test_structural_duplicate_translated_function_is_error_four(self):
        self.assert_status(4, meta=metadata([0x80004004, 0x80004004]))

    def test_structural_repeated_map_guest_address_is_error_four(self):
        self.assert_status(4, meta=metadata(),
                           map_text="80004004 test_function\n80004004 alias\n")

    def test_structural_unmatched_extra_map_is_error_four(self):
        self.assert_status(4, meta=metadata(),
                           map_text=MAP+"80004008 extra_without_provenance\n")

    def test_structural_unmatched_extra_translation_is_error_four(self):
        self.assert_status(4, meta=metadata([0x80004004, 0x80004008]))

    def test_probe_requires_complete_evidence_and_never_marks_sha_good(self):
        result = self.run_cli(meta=metadata(), sha="f"*64, probe=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertIs(report["hash_match"], False)
        self.assertIs(report["strict_compatible"], False)
        for absent in ({"map_text":None},{"meta":None}):
            with self.subTest(absent=absent):
                self.assert_status(3, sha="f"*64, probe=True,
                                   **({"meta":metadata()} | absent))

    def test_probe_never_waives_malformed_structural_evidence(self):
        for broken in ({"meta":metadata([0x80004004,0x80004004])},
                       {"meta":metadata([0x80004004,0x80004008])},
                       {"map_text": MAP+"80004004 duplicate\n", "meta":metadata()},
                       {"meta":metadata(quality=dict(QUALITY, invalidSsaFunctionCount="0"))}):
            with self.subTest(broken=repr(broken)[:90]):
                self.assert_status(4, sha="f"*64, probe=True,
                                   **({"meta":metadata()} | broken))

if __name__ == "__main__":
    unittest.main(verbosity=2)
