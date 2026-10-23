"""Phase10: source-identity RED-first checks for ambiguous REL executable ownership.

Test ONLY synthetic code/data. No original Nintendo DOL, REL, ISO or profile.
Run against an *exact clean* W01 checkout supplied in NSMB_W01_AUDIT_ROOT.
Do not weaken failing assertions to turn a broken auditor green.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import struct
import unittest

ROOT = Path(os.environ.get("NSMB_W01_AUDIT_ROOT", Path(__file__).resolve().parents[2]))
SOURCE = ROOT / "scripts" / "audit_profile.py"
if not SOURCE.is_file():
    raise RuntimeError("W01 source unavailable; no automatic skip: " + str(SOURCE))
spec = importlib.util.spec_from_file_location("peach_phase10_w01", SOURCE)
auditor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auditor)

data = bytearray(0x160)
struct.pack_into(">I", data, 0x00, 0x100)
struct.pack_into(">I", data, 0x48, 0x80004000)
struct.pack_into(">I", data, 0x90, 0x20)
struct.pack_into(">III", data, 0xD8, 0x80310000, 0x1000, 0x80004004)
data[0x100:0x120] = bytes(range(32))
DOL = bytes(data)
PROFILE = ("inputs:\n  dol:\n    sha256: " + hashlib.sha256(DOL).hexdigest()
           + "\ntranslation:\n  entry_points:\n    - 0x80004004\n")
MAP = "80004004 translated_main\n80500014 translated_rel\n"
META = json.dumps({
    "functions": [{"entryPoint": 0x80004004}, {"entryPoint": 0x80500014}],
    "quality": {"unsupportedInstructionCount": 0, "invalidSsaFunctionCount": 0},
})


def sec(name: str, addr: str, size: str = "0x20"):
    return {"sections": {name: {"exec": True, "addr": addr, "size": size}}}


def analyze(layout):
    return auditor.analyze(DOL, PROFILE, MAP, json.dumps(layout), META)


class RejectAmbiguousRelExecutableOwner(unittest.TestCase):
    def assertStrictRejects(self, layout):
        try:
            report, status = analyze(layout)
        except (ValueError, KeyError, TypeError):
            return
        self.assertFalse(
            report["strict_compatible"],
            "Overlapping executable REL ownership was declared verified"
        )
        self.assertNotEqual(status, 0)

    def test_one_unambiguous_rel_module_is_positive(self):
        report, status = analyze({"modules": [sec("text", "0x80500000")]})
        self.assertEqual(status, 0)
        self.assertTrue(report["strict_compatible"])
        self.assertEqual(report["function_map"]["counts"]["rel"], 1)

    def test_identical_executable_intervals_from_two_modules_fail_closed(self):
        self.assertStrictRejects({"modules": [
            sec("text", "0x80500000"),
            sec("text2", "0x80500000"),
        ]})

    def test_partially_overlapping_executable_intervals_fail_closed(self):
        self.assertStrictRejects({"modules": [
            sec("text", "0x80500000"),
            sec("text2", "0x80500010"),
        ]})

    def test_overlapping_exec_sections_within_same_rel_module_fail_closed(self):
        self.assertStrictRejects({"modules": [{
            "sections": {
                "text": {"exec": True, "addr": "0x80500000", "size": "0x20"},
                "overlay": {"exec": True, "addr": "0x80500010", "size": "0x20"},
            }
        }]})

    def test_rel_executable_claim_conflicts_with_dol_executable(self):
        self.assertStrictRejects({"modules": [
            sec("text", "0x80500000"),
            sec("conflict", "0x80004000"),
        ]})

    def test_adjacent_distinct_rel_exec_ranges_are_not_falsely_rejected(self):
        report, status = analyze({"modules": [
            sec("text", "0x80500000", "0x20"),
            sec("text2", "0x80500020", "0x20"),
        ]})
        self.assertEqual(status, 0)
        self.assertTrue(report["strict_compatible"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
