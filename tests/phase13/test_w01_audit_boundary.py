"""Independent W01 Phase13 *audit integration* and CLI safety gates.

Synthetic tiny generated DOL and non-Nintendo REL/MAP/metadata only.
NSMB_W01_AUDIT_ROOT MUST identify the candidate's exact clean SHA.
Never silently skip if auditor import or CLI is inaccessible.
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

ROOT = Path(os.environ.get("NSMB_W01_AUDIT_ROOT", Path(__file__).resolve().parents[2]))
SCRIPT = ROOT / "scripts" / "audit_profile.py"
if not SCRIPT.is_file():
    raise RuntimeError(f"Missing W01 auditor in explicit candidate: {SCRIPT}")
spec = importlib.util.spec_from_file_location("peach_p13_audit", SCRIPT)
auditor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auditor)

def fake_dol():
    buf = bytearray(0x160)
    struct.pack_into(">I", buf, 0, 0x100)
    struct.pack_into(">I", buf, 0x48, 0x80004000)
    struct.pack_into(">I", buf, 0x90, 0x20)
    struct.pack_into(">III", buf, 0xD8, 0x80310000, 0x1000, 0x80004004)
    buf[0x100:0x120] = bytes(range(32))
    return bytes(buf)

DOL = fake_dol()
HASH = hashlib.sha256(DOL).hexdigest()
MAP = "80004004 synthetic_main\n80500004 synthetic_rel\n"
REL = {"modules": [{"sections": {
    "text": {"addr": "0x80500000", "size": "0x20", "exec": True}
}}]}
META = {"functions": [{"entryPoint": 0x80004004}, {"entryPoint": 0x80500004}],
        "quality": {"unsupportedInstructionCount": 0, "invalidSsaFunctionCount": 0}}

def profile(digest=HASH):
    return ("project:\n  game_id: SYNTHETIC\ninputs:\n  dol:\n    sha256: "
            + digest + "\ntranslation:\n  entry_points:\n    - 0x80004004\n")

def meta():
    return json.loads(json.dumps(META))

def layout():
    return json.loads(json.dumps(REL))

def analyzed(*, r=None, m=None, map_text=MAP, digest=HASH):
    return auditor.analyze(DOL, profile(digest), map_text,
                          json.dumps(REL) if r is None else r,
                          json.dumps(META) if m is None else m)

class W01IntegratedBoundaries(unittest.TestCase):
    def test_positive_exact_two_function_map_rel_and_metadata(self):
        report, status = analyzed()
        self.assertEqual(status, 0, report)
        self.assertIs(report["strict_compatible"], True)
        self.assertEqual(report["function_map"]["counts"],
                         {"dol": 1, "rel": 1, "unmapped": 0})

    def test_positive_adjacent_rel_sections_are_distinct(self):
        r = layout()
        r["modules"][0]["sections"]["data"] = {
            "addr": "0x80500020", "size": "0x20", "exec": False
        }
        report, status = analyzed(r=json.dumps(r))
        self.assertEqual(status, 0, report)
        self.assertTrue(report["strict_compatible"])

    def test_positive_bad_digest_yields_status_two_not_strict(self):
        report, status = analyzed(digest="f" * 64)
        self.assertEqual(status, 2, report)
        self.assertIs(report["strict_compatible"], False)
        self.assertIs(report["hash_match"], False)

    def test_unpaired_legacy_hex_metadata_entrypoint_is_structural_failure(self):
        m = meta()
        m["functions"][1]["entryPoint"] = "0x80500004"
        with self.assertRaises(ValueError):
            analyzed(m=json.dumps(m))

    def test_fractional_metadata_pc_fails_before_coverage(self):
        m = meta()
        m["functions"][1]["entryPoint"] = float(0x80500004) + 0.25
        with self.assertRaises(ValueError):
            analyzed(m=json.dumps(m))

    def test_extra_translation_entry_not_covered_by_map_is_not_strict(self):
        m = meta()
        m["functions"].append({"entryPoint": 0x80500008})
        with self.assertRaises(ValueError):
            analyzed(m=json.dumps(m))

    def test_nested_quality_duplicate_plain_key_fails(self):
        source = json.dumps(meta())
        source = source.replace('"quality": {',
                                '"quality": {"invalidSsaFunctionCount": 0, ')
        with self.assertRaises(ValueError):
            analyzed(m=source)

    def test_nested_quality_escaped_unicode_alias_fails(self):
        source = json.dumps(meta())
        # Keep the literal JSON backslash-u escape in the source string;
        # the parser must unescape it BEFORE duplicate-key detection.
        encoded_key = 'invalidSsaFunctionCo' + chr(92) + 'u0075nt'
        source = source.replace('"quality": {',
                                '"quality": {"' + encoded_key + '": 0, ')
        with self.assertRaises(ValueError):
            analyzed(m=source)

    def test_rel_exec_false_integer_rejected_even_if_unused(self):
        r = layout()
        r["modules"][0]["sections"]["data"] = {
            "addr": "0x80500020", "size": "0x20", "exec": 0
        }
        with self.assertRaises(ValueError):
            analyzed(r=json.dumps(r))

    def test_rel_exec_false_text_rejected_even_if_unused(self):
        r = layout()
        r["modules"][0]["sections"]["data"] = {
            "addr": "0x80500020", "size": "0x20", "exec": "false"
        }
        with self.assertRaises(ValueError):
            analyzed(r=json.dumps(r))

    def test_rel_dol_executable_overlap_rejected(self):
        r = layout()
        r["modules"][0]["sections"]["text"]["addr"] = "0x80004000"
        with self.assertRaises(ValueError):
            analyzed(r=json.dumps(r))

    def test_rel_rel_overlapping_sections_rejected(self):
        r = layout()
        r["modules"][0]["sections"]["collision"] = {
            "addr": "0x80500008", "size": "0x20", "exec": True
        }
        with self.assertRaises(ValueError):
            analyzed(r=json.dumps(r))

    def test_empty_present_rel_is_not_equivalent_to_absent(self):
        with self.assertRaises(ValueError):
            analyzed(r="")

    def test_quality_nonzero_is_not_clean_but_is_structured_evidence(self):
        m = meta()
        m["quality"]["unsupportedInstructionCount"] = 2
        report, status = analyzed(m=json.dumps(m))
        self.assertEqual(status, 3, report)
        self.assertIs(report["strict_compatible"], False)

    def test_ambiguous_map_numeric_syntax_not_recognized(self):
        for map_text in (
            "80004004 synthetic_main\n+80500004 synthetic_rel\n",
            "80004004 synthetic_main\n8050_0004 synthetic_rel\n",
        ):
            with self.subTest(map_text=map_text):
                with self.assertRaises(ValueError):
                    analyzed(map_text=map_text)

    def test_duplicate_function_is_never_success_even_with_hash_match(self):
        m = meta()
        m["functions"].append(dict(m["functions"][0]))
        try:
            report, status = analyzed(m=json.dumps(m))
        except ValueError:
            return
        self.assertFalse(report["strict_compatible"])
        self.assertNotEqual(status, 0)

class W01RealCliGate(unittest.TestCase):
    def invoke(self, *, digest=HASH, r=None, m=None, map_text=MAP, probe=False):
        with tempfile.TemporaryDirectory(prefix="peach-p13-w01-synthetic-") as folder:
            base = Path(folder)
            (base / "invented.dol").write_bytes(DOL)
            (base / "profile.yml").write_text(profile(digest), encoding="utf-8")
            (base / "map.txt").write_text(map_text, encoding="utf-8")
            (base / "rel.json").write_text(
                json.dumps(REL) if r is None else r, encoding="utf-8")
            (base / "meta.json").write_text(
                json.dumps(META) if m is None else m, encoding="utf-8")
            args = [sys.executable, "-B", str(SCRIPT),
                    "--dol", str(base / "invented.dol"),
                    "--profile", str(base / "profile.yml"),
                    "--map", str(base / "map.txt"),
                    "--rel-layout", str(base / "rel.json"),
                    "--translation-metadata", str(base / "meta.json")]
            if probe:
                args.append("--probe")
            return subprocess.run(args, capture_output=True, text=True, timeout=15)

    def test_cli_clean_source_returns_zero_and_strict(self):
        run = self.invoke()
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertTrue(json.loads(run.stdout)["strict_compatible"])

    def test_cli_sha_mismatch_returns_two_without_probe(self):
        run = self.invoke(digest="f" * 64)
        self.assertEqual(run.returncode, 2, run.stderr)
        self.assertFalse(json.loads(run.stdout)["strict_compatible"])

    def test_cli_probe_with_wrong_sha_only_is_read_only_and_non_strict(self):
        run = self.invoke(digest="f" * 64, probe=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        result = json.loads(run.stdout)
        self.assertFalse(result["strict_compatible"])
        self.assertFalse(result["hash_match"])

    def test_cli_probe_never_permits_rel_json_ambiguity(self):
        r = json.dumps(REL).replace(
            '"modules":', '"modules": [], "modules":')
        for probe in (False, True):
            with self.subTest(probe=probe):
                run = self.invoke(digest="f" * 64, r=r, probe=probe)
                self.assertEqual(run.returncode, 4, run.stdout + run.stderr)
                self.assertNotIn("strict_compatible\": true", run.stdout)

    def test_cli_probe_never_permits_missing_map_evidence(self):
        run = self.invoke(digest="f" * 64, map_text="", probe=True)
        self.assertNotEqual(run.returncode, 0, run.stdout)
        self.assertNotIn("strict_compatible\": true", run.stdout)

if __name__ == "__main__":
    unittest.main(verbosity=2)
