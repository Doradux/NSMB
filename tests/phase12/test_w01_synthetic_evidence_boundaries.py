"""Peach Phase12 supplementary adversarial gates, SYNTHETIC ONLY.

No original Wii executable, REL, game profile, translated source, or secrets.
Every positive control must succeed on the audited source before a RED case
can be claimed as a meaningful true positive/negative.
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
AUDIT = ROOT / "scripts" / "audit_profile.py"
if not AUDIT.is_file():
    raise RuntimeError("Exact clean W01 source is required; not SKIP: " + str(AUDIT))
spec = importlib.util.spec_from_file_location("peach_p12_w01_auditor", AUDIT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

payload = bytearray(0x160)
struct.pack_into(">I", payload, 0, 0x100)
struct.pack_into(">I", payload, 0x48, 0x80004000)
struct.pack_into(">I", payload, 0x90, 0x20)
struct.pack_into(">III", payload, 0xD8, 0x80310000, 0x1000, 0x80004004)
payload[0x100:0x120] = bytes(range(32))
DOL = bytes(payload)
SHA = hashlib.sha256(DOL).hexdigest()
PROFILE = f"inputs:\n  dol:\n    sha256: {SHA}\ntranslation:\n  entry_points:\n    - 0x80004004\n"
MAP = "80004004 translated_main\n80500004 translated_rel\n"
VALID_REL = {
    "modules": [{
        "sections": {
            "text": {"exec": True, "addr": "0x80500000", "size": "0x20"}
        }
    }]
}
VALID_META = {
    "functions": [{"entryPoint": 0x80004004}, {"entryPoint": 0x80500004}],
    "quality": {"unsupportedInstructionCount": 0, "invalidSsaFunctionCount": 0},
}


class StrictBoundaryAdditions(unittest.TestCase):
    def audit(self, *, rel=None, metadata=None, map_text=MAP):
        if rel is None:
            rel = json.dumps(VALID_REL)
        if metadata is None:
            metadata = json.dumps(VALID_META)
        return audit.analyze(DOL, PROFILE, map_text, rel, metadata)

    def reject(self, *, rel=None, metadata=None, map_text=MAP):
        try:
            report, status = self.audit(rel=rel, metadata=metadata, map_text=map_text)
        except (ValueError, KeyError, TypeError):
            return
        self.assertNotEqual(status, 0, "The auditor reported success on ambiguous evidence")
        self.assertIs(report["strict_compatible"], False,
                      "Cannot certify strict compatibility of ambiguous evidence")

    def test_positive_numeric_entrypoint_and_complete_evidence(self):
        report, status = self.audit()
        self.assertEqual(status, 0)
        self.assertIs(report["strict_compatible"], True)

    def test_positive_extra_upstream_metadata_fields_are_preserved(self):
        m = json.loads(json.dumps(VALID_META))
        m["quality"]["syntheticBuildId"] = "self-contained-public-fixture"
        report, status = self.audit(metadata=json.dumps(m))
        self.assertEqual(status, 0)
        self.assertIs(report["strict_compatible"], True)

    def test_metadata_canonical_hex_string_does_not_match_numeric_upstream_abi(self):
        m = json.loads(json.dumps(VALID_META))
        m["functions"][1]["entryPoint"] = "0x80500004"
        self.reject(metadata=json.dumps(m))

    def test_metadata_decimal_string_is_not_numeric_json_entrypoint(self):
        m = json.loads(json.dumps(VALID_META))
        m["functions"][1]["entryPoint"] = str(0x80500004)
        self.reject(metadata=json.dumps(m))

    def test_metadata_fractional_entrypoint_must_not_truncate(self):
        m = json.loads(json.dumps(VALID_META))
        m["functions"][1]["entryPoint"] = float(0x80500004) + 0.5
        self.reject(metadata=json.dumps(m))

    def test_metadata_entrypoint_string_with_unapproved_plus_prefix(self):
        m = json.loads(json.dumps(VALID_META))
        m["functions"][1]["entryPoint"] = "+0x80500004"
        self.reject(metadata=json.dumps(m))

    def test_metadata_entrypoint_string_with_python_underscore_separator(self):
        m = json.loads(json.dumps(VALID_META))
        m["functions"][1]["entryPoint"] = "0x8050_0004"
        self.reject(metadata=json.dumps(m))

    def test_metadata_duplicate_identical_entrypoint_in_nested_function(self):
        # Dynamic valid address avoids accidentally making the first key
        # an independent unmapped-functions reason for rejection.
        first = '{"entryPoint":%d,"entryPoint":%d}' % (0x80004004, 0x80004004)
        second = '{"entryPoint":%d}' % 0x80500004
        m = '{"functions":[%s,%s],"quality":{"unsupportedInstructionCount":0,"invalidSsaFunctionCount":0}}' % (first, second)
        self.reject(metadata=m)

    def test_rel_unknown_string_exec_in_nonparticipating_section_fails(self):
        layout = json.loads(json.dumps(VALID_REL))
        layout["modules"][0]["sections"]["bogus"] = {
            "exec": "false", "addr": "0x80600000", "size": "0x20"
        }
        self.reject(rel=json.dumps(layout))

    def test_rel_integer_exec_in_nonparticipating_section_fails(self):
        layout = json.loads(json.dumps(VALID_REL))
        layout["modules"][0]["sections"]["bogus"] = {
            "exec": 1, "addr": "0x80600000", "size": "0x20"
        }
        self.reject(rel=json.dumps(layout))

    def test_rel_python_underscore_hex_size_is_ambiguous(self):
        layout = json.loads(json.dumps(VALID_REL))
        layout["modules"][0]["sections"]["text"]["size"] = "0x2_0"
        self.reject(rel=json.dumps(layout))

    def test_rel_legacy_python_plus_prefix_address_is_ambiguous(self):
        layout = json.loads(json.dumps(VALID_REL))
        layout["modules"][0]["sections"]["text"]["addr"] = "+0x80500000"
        self.reject(rel=json.dumps(layout))

    def test_map_python_underscore_numeric_address_is_not_canonical(self):
        self.reject(map_text="80004004 translated_main\n8050_0004 translated_rel\n")

    def test_map_plus_prefix_numeric_address_is_not_canonical(self):
        self.reject(map_text="80004004 translated_main\n+80500004 translated_rel\n")


if __name__ == "__main__":
    unittest.main(verbosity=2)
