"""Phase14 deterministic adversarial security tests, *synthetic only*.

Targets the REAL integrated W01 audit_profile.py; never monkeypatches it.
All fixtures are invented, tiny DOL-like headers with no Nintendo data.
To review an exact other checkout, set NSMB_W01_AUDIT_ROOT=/clean/review/root.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import random
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(os.environ.get("NSMB_W01_AUDIT_ROOT",
                           Path(__file__).resolve().parents[2])).resolve()
SCRIPT = ROOT / "scripts" / "audit_profile.py"
if not SCRIPT.is_file():
    raise RuntimeError(f"Target auditor missing: {SCRIPT}")
spec = importlib.util.spec_from_file_location("toad_phase14_exact_auditor", SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
START = 0x80004000
ENTRY = START + 4
DATA = 0x80300000
REL = 0x80500000
SEED = 14025


def invented_dol(*, bss=0x80310000, bss_size=0x1000,
                 text_address=START, text_size=0x20):
    data = bytearray(0x160)
    struct.pack_into(">I", data, 0, 0x100)
    struct.pack_into(">I", data, 0x48, text_address)
    struct.pack_into(">I", data, 0x90, text_size)
    struct.pack_into(">I", data, 7*4, 0x120)
    struct.pack_into(">I", data, 0x48+7*4, DATA)
    struct.pack_into(">I", data, 0x90+7*4, 0x10)
    struct.pack_into(">III", data, 0xD8, bss, bss_size, ENTRY)
    data[0x100:0x120] = bytes(range(32))
    return bytes(data)


DOL = invented_dol()


def profile(dol=DOL, *, matching=True):
    sha = hashlib.sha256(dol).hexdigest() if matching else "f"*64
    return ("project:\n  game_id: SYNTHETIC\n"
            "inputs:\n  dol:\n    sha256: " + sha + "\n"
            "translation:\n  entry_points:\n    - 0x80004004\n")


def rel_doc(*segments, extra=None):
    # First text interval witnesses the independent MAP entry.
    sec = {"text": {"addr": hex(REL), "size": "0x20", "exec": True}}
    for i, (addr, size, executable) in enumerate(segments):
        sec[f"extra{i}"] = {"addr": addr, "size": size, "exec": executable}
    doc = {"modules": [{"sections": sec}]}
    if extra is not None:
        doc["extra"] = extra
    return json.dumps(doc, ensure_ascii=True)


GOOD_REL = rel_doc()
MAP = "80004004 synthetic_dol\n80500004 synthetic_rel\n"
META_OBJ = {"functions": [{"entryPoint": ENTRY}, {"entryPoint": REL+4}],
            "quality": {"unsupportedInstructionCount": 0,
                        "invalidSsaFunctionCount": 0}}
GOOD_META = json.dumps(META_OBJ)


def analyze(*, data=DOL, yaml=None, map_text=MAP, rel=GOOD_REL,
            metadata=GOOD_META):
    return audit.analyze(data, profile(data) if yaml is None else yaml,
                         map_text, rel, metadata)


def run_cli(*, data=DOL, yaml=None, map_text=MAP, rel=GOOD_REL,
            metadata=GOOD_META, probe=False):
    with tempfile.TemporaryDirectory(prefix="toad-p14-w01-public-") as temp:
        p = Path(temp)
        (p/"source.dol").write_bytes(data)
        (p/"source.yml").write_text(profile(data) if yaml is None else yaml)
        args = [sys.executable, "-B", str(SCRIPT), "--dol", str(p/"source.dol"),
                "--profile", str(p/"source.yml")]
        for text, flag, name in ((map_text, "--map", "source.map"),
                                 (rel, "--rel-layout", "source.rel.json"),
                                 (metadata, "--translation-metadata", "source.meta.json")):
            if text is not None:
                (p/name).write_text(text, encoding="utf-8")
                args.extend((flag, str(p/name)))
        if probe:
            args.append("--probe")
        return subprocess.run(args, capture_output=True, text=True,
                              timeout=15, check=False)


class PositiveEvidenceControls(unittest.TestCase):
    def test_valid_two_function_source_full_status_zero(self):
        result, code = analyze()
        self.assertEqual(code, 0)
        self.assertTrue(result["strict_compatible"])
        self.assertEqual(result["function_map"]["counts"],
                         {"dol": 1, "rel": 1, "unmapped": 0})

    def test_rel_sections_adjacent_positive_data_and_nonexec(self):
        rel = rel_doc((REL+0x20, "0x10", False),
                      (REL+0x30, "0x10", True))
        result, code = analyze(rel=rel)
        self.assertEqual(code, 0)
        self.assertTrue(result["strict_compatible"])

    def test_dol_data_boundary_positive(self):
        rel = rel_doc((DATA+0x10, "0x20", False))
        self.assertEqual(analyze(rel=rel)[1], 0)

    def test_clean_nonzero_quality_is_semantic_three_not_schema_four(self):
        meta = json.loads(GOOD_META)
        meta["quality"]["unsupportedInstructionCount"] = 1
        report, code = analyze(metadata=json.dumps(meta))
        self.assertEqual(code, 3)
        self.assertFalse(report["strict_compatible"])
        self.assertEqual(run_cli(metadata=json.dumps(meta)).returncode, 3)

    def test_checksum_only_mismatch_two_and_probe_not_strict(self):
        yaml = profile(matching=False)
        self.assertEqual(analyze(yaml=yaml)[1], 2)
        for probe, expected in ((False, 2), (True, 0)):
            with self.subTest(probe=probe):
                result = run_cli(yaml=yaml, probe=probe)
                self.assertEqual(result.returncode, expected, result.stderr)
                self.assertFalse(json.loads(result.stdout)["strict_compatible"])

    def test_incomplete_evidence_three_whether_hash_matched_or_probe(self):
        for probe in (False, True):
            for valid_hash in (True, False):
                with self.subTest(probe=probe, valid_hash=valid_hash):
                    yaml = profile(matching=valid_hash)
                    report, code = analyze(yaml=yaml, map_text=None)
                    self.assertEqual(code, 3)
                    self.assertFalse(report["strict_compatible"])
                    cli = run_cli(yaml=yaml, map_text=None, probe=probe)
                    self.assertEqual(cli.returncode, 3, cli.stderr)

    def test_no_rel_document_is_distinct_from_present_empty(self):
        # A fully covered DOL-only profile needs no REL file.
        meta = json.dumps({"functions": [{"entryPoint": ENTRY}],
                           "quality": META_OBJ["quality"]})
        report, code = analyze(map_text="80004004 only\n",
                               rel=None, metadata=meta)
        self.assertEqual(code, 0)
        self.assertTrue(report["strict_compatible"])
        with self.assertRaises(ValueError):
            analyze(map_text="80004004 only\n", rel="", metadata=meta)

    def test_bss_adjacent_to_loaded_data_positive(self):
        # DOL initialized data occupies [DATA,DATA+0x10); BSS immediately
        # following it is a genuine non-overlap boundary.
        data = invented_dol(bss=DATA+0x10, bss_size=0x10)
        result, code = analyze(data=data)
        self.assertEqual(code, 0)
        self.assertTrue(result["strict_compatible"])


class MalformedStructuralEvidence(unittest.TestCase):
    def assert_bad(self, **kwargs):
        with self.assertRaises(ValueError):
            analyze(**kwargs)

    def test_rel_duplicate_nfkc_and_unicode_escaped_keys(self):
        originals = (
            GOOD_REL[:-1] + ',"mod\\u0075les":[]}',
            GOOD_REL[:-1] + ',"ｍodules":[]}',
            GOOD_REL[:-1] + ',"modules":[]}',
        )
        for raw in originals:
            with self.subTest(raw=raw[-40:]):
                self.assert_bad(rel=raw)

    def test_metadata_duplicate_quality_and_unknown_field(self):
        originals = (
            GOOD_META[:-1] + ',"qual\\u0069ty":{}}',
            GOOD_META[:-1] + ',"ｑuality":{}}',
            GOOD_META[:-1] + ',"quality":{}}',
            GOOD_META[:-1] + ',"extra":{"v":1e9999}}',
            GOOD_META[:-1] + r',"extra":{"\ud800":"v"}}',
            GOOD_META[:-1] + ',"extra":{"v":NaN}}',
            GOOD_META[:-1] + ',"extra":{"v":-Infinity}}',
        )
        for raw in originals:
            with self.subTest(raw=raw[-50:]):
                self.assert_bad(metadata=raw)

    def test_rel_nonfinite_unknown_and_unicode_surrogate(self):
        samples = (
            GOOD_REL[:-1] + ',"ignored":[1e9999]}',
            GOOD_REL[:-1] + ',"ignored":[NaN]}',
            GOOD_REL[:-1] + ',"ignored":[Infinity]}',
            GOOD_REL[:-1] + r',"ignored":{"\ud800":0}}',
            GOOD_REL[:-1] + ',"ignored":' + "["*260 + "0" + "]"*260 + '}',
        )
        for raw in samples:
            with self.subTest(tail=raw[-40:]):
                self.assert_bad(rel=raw)

    def test_numeric_boundary_types_exec(self):
        for address in (False, 1.0, -1, 0x100000000,
                        "0x100000000", "0x-1", "80500020"):
            with self.subTest(address=address):
                self.assert_bad(rel=rel_doc((address, "0x10", False)))
        for size in (True, -1, 0, 1.5, "0x100000000", "-0x1", "10"):
            with self.subTest(size=size):
                self.assert_bad(rel=rel_doc((REL+0x20, size, False)))
        for exe in (0, 1, "true", None):
            with self.subTest(exe=exe):
                self.assert_bad(rel=rel_doc((REL+0x20, "0x10", exe)))

    def test_rel_wrap_and_rel_dol_exec_and_nonexec_overlap(self):
        for addr, size, exe in (
            ("0xFFFFFFF0", "0x20", True),
            (START+0x10, 0x10, True),
            (DATA+0x8, 0x10, False),
            (REL+0x10, 0x10, False),
            (REL+0x10, 0x10, True),
        ):
            with self.subTest(addr=addr):
                self.assert_bad(rel=rel_doc((addr, size, exe)))

    def test_yaml_duplicate_parent_entrypoint_list_and_unsupported_inline(self):
        samples = (
            profile() + "inputs:\n  dol:\n    sha256: " + hashlib.sha256(DOL).hexdigest() + "\n",
            profile() + "translation:\n  entry_points:\n    - 0x80004004\n",
            profile().replace("    - 0x80004004", "    - 0x80004004\n    - 0x80004008"),
            profile().replace("  dol:\n", "  dol: {}\n"),
            profile().replace("    sha256: ", "    sha256: !!str "),
        )
        for p in samples:
            with self.subTest(tail=p[-70:]):
                self.assert_bad(yaml=p)

    def test_yaml_second_document_must_not_be_ignored(self):
        # YAML streams can encode multiple documents. Ignoring a later
        # document makes source interpretation consumer-dependent.
        self.assert_bad(yaml=profile() + "---\nextra: unchecked\n")

    def test_malformed_map_numeric_token(self):
        samples = ("+80004004 x\n80500004 rel", "8000_4004 x\n80500004 rel",
                   "0x80004004 x\n80500004 rel", "100000000 x\n80500004 rel",
                   "80004004 x\n80500004 rel\n80004004 dup",
                   "80004004 x\n80500004 rel\n80500004 dup")
        for m in samples:
            with self.subTest(map=m[:36]):
                # Every sample is a malformed or duplicated MAP with a
                # PRESENT complete translator manifest. Merely returning
                # incompatible status3 is not structural rejection.
                self.assert_bad(map_text=m)

    def test_translation_numeric_uint32_rejects_coercion(self):
        for entry in (True, False, 1.0, ENTRY+0.5, None,
                      -1, 0x100000000, str(ENTRY), hex(ENTRY)):
            with self.subTest(entry=entry):
                meta = json.loads(GOOD_META)
                meta["functions"][0]["entryPoint"] = entry
                self.assert_bad(metadata=json.dumps(meta))

    def test_metadata_missing_entry_and_duplicates(self):
        for functions in ([{}, {"entryPoint": REL+4}],
                          [{"entryPoint": ENTRY}, {"entryPoint": ENTRY}]):
            with self.subTest(functions=functions):
                meta = json.loads(GOOD_META)
                meta["functions"] = functions
                self.assert_bad(metadata=json.dumps(meta))

    def test_probe_never_waives_malformed_rel_metadata_or_map(self):
        wrong_sha = profile(matching=False)
        bad_rel = rel_doc((DATA+4, "0x10", False))
        bad_meta = GOOD_META[:-1] + ',"quality":{}}'
        for params in ({"rel": bad_rel},
                       {"metadata": bad_meta},
                       {"map_text": "+80004004 x\n80500004 y"}):
            for probe in (False, True):
                with self.subTest(params=params, probe=probe):
                    outcome = run_cli(yaml=wrong_sha, probe=probe, **params)
                    self.assertEqual(outcome.returncode, 4,
                                     outcome.stdout + outcome.stderr)
                    self.assertNotIn('"strict_compatible": true',
                                     outcome.stdout.lower())

    def test_probe_hash_mismatch_with_missing_map_never_zero(self):
        outcome = run_cli(yaml=profile(matching=False), map_text=None,
                          probe=True)
        self.assertEqual(outcome.returncode, 3, outcome.stderr)


class DolHeaderOwnership(unittest.TestCase):
    def test_bss_exclusive_end_2power32_is_rejected(self):
        # The pinned public C# DOL loader computes checked(uint+uint), so
        # an exclusive end at 0x100000000 is overflow even though a Python
        # integer can represent that mathematical half-open boundary.
        data = invented_dol(bss=0xFFFFFFF0, bss_size=0x10)
        with self.assertRaises(ValueError):
            audit.dol_sections(data)

    def test_bss_uint32_overflow_is_rejected(self):
        # No mapping can own bytes beyond 32-bit guest address space.
        data = invented_dol(bss=0xFFFFFFF0, bss_size=0x20)
        with self.assertRaises(ValueError):
            audit.dol_sections(data)

    def test_bss_overlap_existing_executable_load_is_rejected(self):
        data = invented_dol(bss=START+8, bss_size=0x10)
        with self.assertRaises(ValueError):
            audit.dol_sections(data)

    def test_bss_overlap_existing_data_load_is_rejected(self):
        data = invented_dol(bss=DATA+8, bss_size=0x10)
        with self.assertRaises(ValueError):
            audit.dol_sections(data)

    def test_bss_vs_rel_static_owner_is_rejected(self):
        # An unresolved BSS/REL overlay cannot count as static proof.
        data = invented_dol(bss=REL+4, bss_size=0x10)
        with self.assertRaises(ValueError):
            analyze(data=data)


class DeterministicRelOwnershipFuzz(unittest.TestCase):
    def test_128_randomized_segment_pairs_against_independent_half_open_oracle(self):
        rng = random.Random(SEED)
        for i in range(128):
            anchor = 0x80600000 + i * 0x100
            size = rng.randint(1, 0x50)
            delta = rng.randint(-0x10, 0x18)
            begin = anchor + size + delta
            size2 = rng.randint(1, 0x40)
            exec1, exec2 = bool(rng.randrange(2)), bool(rng.randrange(2))
            overlaps = anchor < begin + size2 and begin < anchor + size
            rel = rel_doc((anchor, size, exec1), (begin, size2, exec2))
            with self.subTest(seed=SEED, iteration=i, overlaps=overlaps):
                if overlaps:
                    with self.assertRaises(ValueError):
                        analyze(rel=rel)
                else:
                    result, status = analyze(rel=rel)
                    self.assertEqual(status, 0, result)
                    self.assertTrue(result["strict_compatible"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
