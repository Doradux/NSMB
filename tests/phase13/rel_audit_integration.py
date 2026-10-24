"""Phase13 REL/DOL integration CONTRACT; deliberately RED on old W01.

Invoke explicitly, never hide failures:
  NSMB_W01_AUDIT_ROOT=/absolute/path/to/clean/auditor \
    python3 -B -m unittest discover -s tests/phase13 \
      -p rel_audit_integration.py -v

Only invented DOL/REL/MAP/metadata; NEVER private Nintendo binaries.
Mario owns audit_profile.py; this suite does not modify it.
"""
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


ROOT = Path(os.environ.get("NSMB_W01_AUDIT_ROOT",
                           Path(__file__).resolve().parents[2])).resolve()
AUDIT_PATH = ROOT / "scripts" / "audit_profile.py"
if not AUDIT_PATH.is_file():
    raise RuntimeError(f"Missing exact audit_profile.py at {AUDIT_PATH}")
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("phase13_audit_under_test", AUDIT_PATH)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def fake_dol():
    """Fabricate a header with one text and one *nonexecutable* data section."""
    data = bytearray(0x140)
    struct.pack_into(">I", data, 0, 0x100)
    struct.pack_into(">I", data, 0x48, 0x80004000)
    struct.pack_into(">I", data, 0x90, 0x20)
    struct.pack_into(">I", data, 7 * 4, 0x120)
    struct.pack_into(">I", data, 0x48 + 7 * 4, 0x80300000)
    struct.pack_into(">I", data, 0x90 + 7 * 4, 0x10)
    struct.pack_into(">III", data, 0xD8, 0x80310000, 0x1000, 0x80004004)
    data[0x100:0x120] = bytes(range(32))
    return bytes(data)


DOL = fake_dol()


def profile(data=DOL, *, matched=True):
    digest = hashlib.sha256(data).hexdigest() if matched else "f" * 64
    return (f"project:\n  game_id: SMNE01\ninputs:\n  dol:\n"
            f"    sha256: {digest}\ntranslation:\n  entry_points:\n"
            "    - 0x80004004\n")


def section(addr="0x80500000", size="0x20", executable=True):
    return {"addr": addr, "size": size, "exec": executable}


def layout(*sections, extra=None):
    modules = [{"sections": {str(i): item for i, item in enumerate(sections)}}]
    doc = {"modules": modules}
    if extra is not None:
        doc["extra"] = extra
    return json.dumps(doc, ensure_ascii=True)


def good_rel():
    return layout(section(), section("0x80500020", "0x10", False))


MAP = "80004004 text\n80500004 rel\n"
META = json.dumps({
    "functions": [{"entryPoint": 0x80004004}, {"entryPoint": 0x80500004}],
    "quality": {"unsupportedInstructionCount": 0,
                "invalidSsaFunctionCount": 0},
})


def report_for(rel, *, mismatch=False):
    return audit.analyze(DOL, profile(matched=not mismatch),
                         MAP, rel, META)


class RealAnalyzeRelDolContract(unittest.TestCase):
    """Run the real exported analyzer, not a monkeypatched/shim parser."""

    def reject(self, text):
        with self.assertRaises(ValueError):
            report_for(text)

    def test_positive_adjacent_rel_and_unambiguous_dol_ownership(self):
        report, code = report_for(good_rel())
        self.assertEqual(code, 0)
        self.assertTrue(report["strict_compatible"])
        self.assertEqual(report["rel_executable_sections"], 1)
        self.assertEqual(report["function_map"]["counts"]["unmapped"], 0)

    def test_positive_nonexec_rel_adjacent_to_dol_data(self):
        # DOL data occupies [0x80300000,0x80300010), nonexec REL starts
        # at its end. Both text and data ownership must remain unambiguous.
        report, code = report_for(layout(section(), section("0x80300010", "0x10", False)))
        self.assertEqual(code, 0)
        self.assertTrue(report["strict_compatible"])

    def test_positive_json_finite_extensions_not_rejected(self):
        report, code = report_for(layout(section(), extra={"name": "Señal",
                                                             "v": 1.5}))
        self.assertEqual(code, 0)
        self.assertTrue(report["strict_compatible"])

    def test_empty_string_explicit_rel_evidence_is_not_silently_omitted(self):
        self.reject("")

    def test_whitespace_is_not_silently_omitted(self):
        self.reject(" ")

    def test_rel_dol_executable_overlap_is_fatal(self):
        self.reject(layout(section("0x80004010", "0x10")))

    def test_rel_dol_nonexec_data_overlap_is_fatal_even_if_rel_nonexec(self):
        self.reject(layout(section(), section("0x80300008", "0x8", False)))

    def test_rel_rel_exec_overlap_is_fatal(self):
        self.reject(layout(section(), section("0x80500010", "0x20")))

    def test_rel_rel_data_overlap_is_fatal_even_if_nonexec(self):
        self.reject(layout(section(), section("0x80500010", "0x10", False)))

    def test_root_unicode_escaped_duplicate_is_fatal(self):
        self.reject(r'{"modules":[{"sections":{"a":{"addr":"0x80500000","size":"0x20","exec":true}}}],"mod\u0075les":[]}')

    def test_nfkc_sections_alias_is_fatal(self):
        self.reject('{"modules":[{"sections":{}, "sec\uff54ions":{"x":{}}}]}')

    def test_extra_nonfinite_exponent_is_fatal(self):
        self.reject(layout(section())[:-1] + ',"extra":{"ignored":[1e9999]}}')

    def test_unpaired_surrogate_in_ignored_field_is_fatal(self):
        self.reject(layout(section())[:-1] + r',"extra":{"\ud800":0}}')

    def test_deeply_nested_unused_extension_is_fatal(self):
        self.reject(layout(section())[:-1] + ',"extra":' + "[" * 270 + '0' + "]" * 270 + '}')

    def test_exec_true_only_int_is_not_accepted(self):
        self.reject(layout(section(executable=1)))

    def test_bool_address_is_not_accepted_as_integer(self):
        self.reject(layout(section(addr=True)))

    def test_float_or_signed_size_is_not_accepted(self):
        self.reject(layout(section(size=1.5)))
        self.reject(layout(section(size=-1)))

    def test_exceeding_uint32_interval_is_fatal(self):
        self.reject(layout(section("0xFFFFFFF0", "0x20")))

    def test_probe_cli_mismatch_cannot_waive_invalid_rel(self):
        with tempfile.TemporaryDirectory(prefix="w01-phase13-rel-") as temp:
            t = Path(temp)
            (t / "fake.dol").write_bytes(DOL)
            (t / "profile.yml").write_text(profile(matched=False), encoding="utf-8")
            (t / "map.txt").write_text(MAP, encoding="utf-8")
            (t / "meta.json").write_text(META, encoding="utf-8")
            (t / "rel.json").write_text(layout(section("0x80300008", "0x8", False),
                                               section()), encoding="utf-8")
            args = [sys.executable, str(AUDIT_PATH), "--dol", str(t / "fake.dol"),
                    "--profile", str(t / "profile.yml"), "--map", str(t / "map.txt"),
                    "--rel-layout", str(t / "rel.json"),
                    "--translation-metadata", str(t / "meta.json"), "--probe"]
            run = subprocess.run(args, capture_output=True, text=True, check=False)
            self.assertEqual(run.returncode, 4,
                             "probe must not convert structural REL failure into success")
            self.assertNotIn('"strict_compatible": true', run.stdout.lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
