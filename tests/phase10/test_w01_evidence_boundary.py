"""Phase 10 W01 strict evidence trust-boundary regressions.

This suite creates a tiny *invented* DOL, REL layout, translation output
and profile in memory.  It NEVER reads Nintendo originals or user secrets.

Run against a selected, independently checked-out W01 source SHA:
    set NSMB_W01_AUDIT_ROOT=C:\path\to\clean\W01
    python -B -m unittest discover -s tests/phase10 -p "test_w01_evidence_boundary.py" -v

A red result against the vulnerable W01 auditor is INTENTIONAL.
Never loosen an oracle to get a green report. The issue remains blocked
until Mario publishes a fixed SHA and peers re-run these tests.
"""
import hashlib
import importlib.util
import json
import os
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(os.environ.get("NSMB_W01_AUDIT_ROOT", Path(__file__).resolve().parents[2]))
SCRIPT = ROOT / "scripts" / "audit_profile.py"
if not SCRIPT.is_file():
    raise RuntimeError(f"An exact W01 source tree is required: {SCRIPT}")
spec = importlib.util.spec_from_file_location("luigi_phase10_w01_candidate", SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

source = bytearray(0x160)
struct.pack_into(">I", source, 0x00, 0x100)
struct.pack_into(">I", source, 0x48, 0x80004000)
struct.pack_into(">I", source, 0x90, 0x20)
struct.pack_into(">III", source, 0xD8, 0x80310000, 0x1000, 0x80004004)
source[0x100:0x120] = bytes(range(32))
DOL = bytes(source)
SHA = hashlib.sha256(DOL).hexdigest()
PROFILE = ("inputs:\n  dol:\n    sha256: " + SHA
           + "\ntranslation:\n  entry_points:\n    - 0x80004004\n")
MAP = "80004004 translated_main\n80500004 translated_rel\n"
FUNCTIONS = [{"entryPoint": 0x80004004}, {"entryPoint": 0x80500004}]
QUALITY = {"unsupportedInstructionCount": 0, "invalidSsaFunctionCount": 0}
METADATA = json.dumps({"functions": FUNCTIONS, "quality": QUALITY})
VALID_MODULE = '{"sections":{"text":{"exec":true,"addr":"0x80500000","size":"0x20"}}}'
VALID_REL = '{"modules":[' + VALID_MODULE + "]}"


class StrictEvidenceIdentity(unittest.TestCase):
    def analyze(self, rel=VALID_REL, metadata=METADATA, profile=PROFILE):
        return audit.analyze(DOL, profile, MAP, rel, metadata)

    def reject(self, rel=VALID_REL, metadata=METADATA, profile=PROFILE):
        # A strict parser may reject malformed evidence by raising; otherwise
        # it MUST explicitly mark the result noncompatible and return nonzero.
        try:
            result, status = self.analyze(rel, metadata, profile)
        except (ValueError, KeyError, TypeError):
            return
        self.assertIs(result["strict_compatible"], False,
                      "Ambiguous/untrusted evidence was marked strict-compatible")
        self.assertNotEqual(status, 0,
                            "Ambiguous/untrusted evidence returned success")

    def test_positive_unique_keys_with_complete_map(self):
        result, status = self.analyze()
        self.assertEqual(status, 0)
        self.assertIs(result["strict_compatible"], True)
        self.assertEqual(result["function_map"]["counts"]["rel"], 1)

    def test_rel_duplicate_modules_unicode_key_alias(self):
        self.reject(rel=('{"modules":[], "mod\\u0075les":[' + VALID_MODULE + "]}"))

    def test_rel_duplicate_executable_section_name_unicode_alias(self):
        self.reject(rel=('{"modules":[{"sections":{'
                         '"text":{"exec":true,"addr":"0xFFFFFFF0","size":"0x20"},'
                         '"te\\u0078t":{"exec":true,"addr":"0x80500000","size":"0x20"}'
                         '}}]}'))

    def test_rel_duplicate_executable_flag_false_then_true(self):
        self.reject(rel=('{"modules":[{"sections":{"text":{'
                         '"exec":false,"exec":true,'
                         '"addr":"0x80500000","size":"0x20"}}}]}'))

    def test_rel_duplicate_size_cannot_hide_overflow(self):
        self.reject(rel=('{"modules":[{"sections":{"text":{'
                         '"exec":true,"addr":"0x80500000",'
                         '"size":"0xFFFFFFF0","size":"0x20"}}}]}'))

    def test_rel_duplicate_same_value_still_ambiguous(self):
        self.reject(rel=('{"modules":[' + VALID_MODULE + '],'
                         '"modules":[' + VALID_MODULE + ']}'))

    def test_metadata_top_level_duplicate_quality(self):
        meta = ('{"functions":' + json.dumps(FUNCTIONS) +
                ',"quality":{"unsupportedInstructionCount":8},'
                '"quality":{"unsupportedInstructionCount":0}}')
        self.reject(metadata=meta)

    def test_metadata_unicode_escaped_duplicate_quality(self):
        meta = ('{"functions":' + json.dumps(FUNCTIONS) +
                ',"quality":{"unsupportedInstructionCount":8},'
                '"qual\\u0069ty":{"unsupportedInstructionCount":0}}')
        self.reject(metadata=meta)

    def test_metadata_duplicate_nested_quality_counter(self):
        meta = ('{"functions":' + json.dumps(FUNCTIONS) +
                ',"quality":{"unsupportedInstructionCount":5,'
                '"unsupportedInstructionCount":0,"invalidSsaFunctionCount":0}}')
        self.reject(metadata=meta)

    def test_metadata_duplicate_function_entrypoint(self):
        meta = ('{"functions":[{"entryPoint":0,"entryPoint":' +
                str(0x80004004) +
                '},{"entryPoint":' + str(0x80500004) +
                '}],"quality":' + json.dumps(QUALITY) + "}")
        self.reject(metadata=meta)

    def test_metadata_fractional_entrypoint_must_not_truncate_to_valid_address(self):
        # int(float) silently truncates; source entry points must be uint32.
        bad = [{"entryPoint": float(0x80004004) + 0.25}, FUNCTIONS[1]]
        self.reject(metadata=json.dumps({"functions": bad, "quality": QUALITY}))

    def test_metadata_boolean_quality_counter_not_a_valid_count(self):
        # Python bool is a subclass of int; JSON false must not count as 0.
        bad = {"functions": FUNCTIONS,
               "quality": {"unsupportedInstructionCount": False,
                           "invalidSsaFunctionCount": 0}}
        self.reject(metadata=json.dumps(bad))

    def test_identity_mismatch_cannot_be_waived_by_complete_coverage(self):
        bad_profile = PROFILE.replace(SHA, "0" * 64)
        result, status = self.analyze(profile=bad_profile)
        self.assertEqual(status, 2)
        self.assertIs(result["hash_match"], False)
        self.assertIs(result["strict_compatible"], False)

    def test_probe_mode_cannot_mark_checksum_mismatch_compatible(self):
        with tempfile.TemporaryDirectory(prefix="public-w01-fake-") as scratch:
            folder = Path(scratch)
            (folder / "fake.dol").write_bytes(DOL)
            (folder / "profile.yml").write_text(PROFILE.replace(SHA, "0" * 64),
                                                encoding="utf-8")
            (folder / "functions.map").write_text(MAP, encoding="utf-8")
            (folder / "rel.json").write_text(VALID_REL, encoding="utf-8")
            (folder / "translation.json").write_text(METADATA, encoding="utf-8")
            command = [sys.executable, "-B", str(SCRIPT),
                       "--dol", str(folder / "fake.dol"),
                       "--profile", str(folder / "profile.yml"),
                       "--map", str(folder / "functions.map"),
                       "--rel-layout", str(folder / "rel.json"),
                       "--translation-metadata", str(folder / "translation.json"),
                       "--probe"]
            result = subprocess.run(command, capture_output=True, text=True,
                                    timeout=15, check=False)
            # A read-only probe may use a zero process exit; it MUST still
            # truthfully report that the original identity did not match.
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(result.stdout)
            self.assertIs(report["hash_match"], False)
            self.assertIs(report["strict_compatible"], False)

    def test_probe_missing_evidence_must_not_claim_full_strict_coverage(self):
        with tempfile.TemporaryDirectory(prefix="public-w01-fake-") as scratch:
            folder = Path(scratch)
            (folder / "fake.dol").write_bytes(DOL)
            (folder / "profile.yml").write_text(PROFILE, encoding="utf-8")
            result = subprocess.run(
                [sys.executable, "-B", str(SCRIPT), "--dol", str(folder / "fake.dol"),
                 "--profile", str(folder / "profile.yml"), "--probe"],
                capture_output=True, text=True, timeout=15, check=False)
            # The audit must not announce *complete strict compatibility*
            # when function MAP, REL and translation metadata are absent.
            if result.returncode == 0:
                self.assertIs(json.loads(result.stdout)["strict_compatible"], False,
                              "Probe without MAP/REL/metadata claimed full compatibility")
            else:
                self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
