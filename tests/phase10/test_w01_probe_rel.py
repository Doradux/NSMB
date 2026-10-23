"""Phase10 W01 --probe is read-only: it must NOT bless ambiguous REL evidence.

Only an invented tiny DOL and synthetic metadata are created in a temporary
folder. No Nintendo copyrighted executable, ROM, REL, or private profile.
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
AUDITOR = ROOT / "scripts" / "audit_profile.py"

data = bytearray(0x160)
struct.pack_into(">I", data, 0, 0x100)
struct.pack_into(">I", data, 0x48, 0x80004000)
struct.pack_into(">I", data, 0x90, 0x20)
struct.pack_into(">III", data, 0xD8, 0x80310000, 0x1000, 0x80004004)
data[0x100:0x120] = bytes(range(32))
DOL = bytes(data)
GOOD_SHA = hashlib.sha256(DOL).hexdigest()
META = json.dumps({
    "functions": [{"entryPoint": 0x80004004}, {"entryPoint": 0x80500004}],
    "quality": {"unsupportedInstructionCount": 0, "invalidSsaFunctionCount": 0},
})
GOOD_REL = '{"modules":[{"sections":{"text":{"exec":true,"addr":"0x80500000","size":"0x20"}}}]}'
BAD_REL = (
    '{"modules":[{"sections":{"text":{"exec":true,"addr":"0xFFFFFFF0","size":"0x20"}}}],'
    '"modules":[{"sections":{"text":{"exec":true,"addr":"0x80500000","size":"0x20"}}}]}'
)


class ProbeMustNotWaiveInvalidLayout(unittest.TestCase):
    def run_probe(self, *, rel=GOOD_REL, map_present=True, expected_sha="f" * 64):
        if not AUDITOR.is_file():
            self.fail("Exact W01 source unavailable; no automatic skip: " + str(AUDITOR))
        with tempfile.TemporaryDirectory(prefix="peach-phase10-probe-") as name:
            root = Path(name)
            (root / "fixture.dol").write_bytes(DOL)
            (root / "profile.yml").write_text(
                "inputs:\n  dol:\n    sha256: " + expected_sha
                + "\ntranslation:\n  entry_points:\n    - 0x80004004\n",
                encoding="utf-8",
            )
            (root / "map.txt").write_text(
                "80004004 main\n80500004 rel\n", encoding="utf-8"
            )
            (root / "meta.json").write_text(META, encoding="utf-8")
            (root / "layout.json").write_text(rel, encoding="utf-8")
            args = [sys.executable, "-B", str(AUDITOR), "--probe",
                    "--dol", str(root / "fixture.dol"),
                    "--profile", str(root / "profile.yml"),
                    "--translation-metadata", str(root / "meta.json"),
                    "--rel-layout", str(root / "layout.json")]
            if map_present:
                args += ["--map", str(root / "map.txt")]
            run = subprocess.run(args, capture_output=True, text=True,
                                 timeout=20, check=False)
            if run.returncode == 0:
                self.assertFalse(json.loads(run.stdout)["strict_compatible"],
                                 "--probe must never assert strict match on wrong SHA")
            return run

    def test_probe_permits_only_explicit_mismatch_with_unambiguous_complete_evidence(self):
        result = self.run_probe()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_probe_refuses_duplicate_rel_json_even_when_checksum_is_mismatched(self):
        result = self.run_probe(rel=BAD_REL)
        self.assertNotEqual(result.returncode, 0,
                            "--probe quietly blessed overwritten REL provenance")

    def test_probe_refuses_missing_map_with_otherwise_valid_rel(self):
        result = self.run_probe(map_present=False)
        self.assertNotEqual(result.returncode, 0,
                            "--probe cannot waive missing function MAP")

    def test_matching_hash_does_not_require_probe_or_mask_ambiguous_rel(self):
        result = self.run_probe(rel=BAD_REL, expected_sha=GOOD_SHA)
        self.assertNotEqual(result.returncode, 0,
                            "Ambiguous REL cannot become clean just from matching DOL SHA")


if __name__ == "__main__":
    unittest.main(verbosity=2)
