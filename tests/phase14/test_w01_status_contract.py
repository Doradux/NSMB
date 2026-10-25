"""Luigi Phase14 independently verifies W01 audit status precedence.

Only invented DOL, MAP, YAML and JSON fixtures. No Nintendo content.
Run: PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests/phase14 -p 'test_w01_status_contract.py' -v
"""
import hashlib
import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import audit_profile as audit

DOL_BYTES = bytearray(0x160)
struct.pack_into(">I", DOL_BYTES, 0x00, 0x100)
struct.pack_into(">I", DOL_BYTES, 0x48, 0x80004000)
struct.pack_into(">I", DOL_BYTES, 0x90, 0x20)
struct.pack_into(">III", DOL_BYTES, 0xD8, 0x80310000, 0x1000, 0x80004004)
DOL_BYTES[0x100:0x120] = bytes(range(32))
DOL = bytes(DOL_BYTES)
DIGEST = hashlib.sha256(DOL).hexdigest()
MAP = "80004004 functionA\n"
Q = {"unsupportedInstructionCount": 0, "invalidSsaFunctionCount": 0}


def profile(digest=DIGEST):
    return (
        "project:\n  game_id: SYNTHETIC\ninputs:\n  dol:\n    sha256: "
        + digest + "\ntranslation:\n  entry_points:\n    - 0x80004004\n"
    )


def meta(addresses=(0x80004004,), quality=None):
    return json.dumps({
        "functions": [{"entryPoint": n} for n in addresses],
        "quality": Q if quality is None else quality,
    })


class StatusPrecedence(unittest.TestCase):
    def audit(self, map_text=MAP, metadata_text=None, digest=DIGEST):
        return audit.analyze(
            DOL, profile(digest), map_text, None,
            meta() if metadata_text is None else metadata_text
        )

    def test_exact_identity_with_complete_valid_evidence_is_zero(self):
        report, status = self.audit()
        self.assertEqual(status, 0)
        self.assertIs(report["strict_compatible"], True)
        self.assertTrue(report["coverage_evidence_complete"])

    def test_bad_identity_with_otherwise_complete_valid_evidence_is_two(self):
        report, status = self.audit(digest="f" * 64)
        self.assertEqual(status, 2)
        self.assertIs(report["strict_compatible"], False)
        self.assertIs(report["hash_match"], False)

    def test_identity_mismatch_plus_absent_evidence_is_three_not_two(self):
        for map_text, metadata_text in ((None, None), (MAP, None), (None, meta())):
            with self.subTest(map=map_text is not None, metadata=metadata_text is not None):
                _, status = audit.analyze(
                    DOL, profile("f" * 64), map_text, None, metadata_text
                )
                self.assertEqual(status, 3)

    def test_identity_mismatch_plus_semantic_quality_defect_is_three(self):
        q = dict(Q, unsupportedInstructionCount=1)
        report, status = self.audit(metadata_text=meta(quality=q), digest="f"*64)
        self.assertEqual(status, 3)
        self.assertFalse(report["strict_compatible"])
        self.assertTrue(report["coverage_evidence_complete"])

    def test_clean_identity_plus_nonzero_quality_is_three(self):
        report, status = self.audit(metadata_text=meta(quality=dict(Q, invalidSsaFunctionCount=4)))
        self.assertEqual(status, 3)
        self.assertFalse(report["strict_compatible"])

    def test_malformed_schema_takes_precedence_over_bad_hash(self):
        for payload in (
            meta(addresses=("0x80004004",)),
            meta(addresses=(True,)),
            meta(addresses=(0x100000000,)),
            meta(quality=dict(Q, unsupportedInstructionCount=False)),
            '{"functions":[{"entryPoint":2147500036}],'
            '"quality":{"unsupportedInstructionCount":0,'
            '"invalidSsaFunctionCount":0},"qual\\u0069ty":{}}',
        ):
            with self.subTest(payload=payload[:65]):
                with self.assertRaises(ValueError):
                    self.audit(metadata_text=payload, digest="f" * 64)

    def test_map_not_one_to_one_raises_structural_valueerror(self):
        for function_map, metadata in (
            (MAP + "80004008 functionB\n", meta()),
            (MAP, meta((0x80004004, 0x80004008))),
            (MAP + MAP, meta()),
            ("+80004004 invalid\n", meta()),
        ):
            with self.subTest(map=function_map[:40]):
                with self.assertRaises(ValueError):
                    self.audit(map_text=function_map, metadata_text=metadata)

    def test_missing_evidence_has_three_even_with_correct_identity(self):
        for m, t in ((None, None), (MAP, None), (None, meta())):
            with self.subTest(map=m is not None, metadata=t is not None):
                report, status = audit.analyze(DOL, profile(), m, None, t)
                self.assertEqual(status, 3)
                self.assertFalse(report["strict_compatible"])

    def test_cli_probe_wrong_digest_complete_evidence_only_and_never_claim_compatible(self):
        proc = self._cli(probe=True, wrong_hash=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        report = json.loads(proc.stdout)
        self.assertFalse(report["hash_match"])
        self.assertFalse(report["strict_compatible"])

    def test_cli_probe_wrong_digest_without_metadata_stays_three(self):
        p = self._cli(probe=True, wrong_hash=True, metadata_text=False)
        self.assertEqual(p.returncode, 3, p.stderr)
        self.assertFalse(json.loads(p.stdout)["strict_compatible"])

    def test_cli_probe_wrong_digest_with_malformed_metadata_stays_four(self):
        p = self._cli(probe=True, wrong_hash=True, metadata_text=meta(("0x80004004",)))
        self.assertEqual(p.returncode, 4, p.stderr)
        self.assertIn("Audit failed:", p.stderr)
        self.assertFalse(p.stdout.strip())

    def test_cli_invalid_quality_is_four_and_nonzero_quality_is_three(self):
        p = self._cli(metadata_text=meta(quality=dict(Q, invalidSsaFunctionCount=False)))
        self.assertEqual(p.returncode, 4, p.stderr)
        p = self._cli(metadata_text=meta(quality=dict(Q, invalidSsaFunctionCount=3)))
        self.assertEqual(p.returncode, 3, p.stderr)

    def _cli(self, *, probe=False, wrong_hash=False, metadata_text=None):
        with tempfile.TemporaryDirectory(prefix="luigi-p14-synthetic-") as name:
            root = Path(name)
            (root / "a.dol").write_bytes(DOL)
            (root / "p.yml").write_text(profile("f" * 64 if wrong_hash else DIGEST))
            (root / "a.map").write_text(MAP)
            args = [
                sys.executable, "-B", str(ROOT / "scripts" / "audit_profile.py"),
                "--dol", str(root / "a.dol"), "--profile", str(root / "p.yml"),
                "--map", str(root / "a.map"),
            ]
            if metadata_text is not False:
                (root / "a.json").write_text(meta() if metadata_text is None else metadata_text)
                args += ["--translation-metadata", str(root / "a.json")]
            if probe:
                args.append("--probe")
            return subprocess.run(args, capture_output=True, text=True, timeout=10)


if __name__ == "__main__":
    unittest.main()
