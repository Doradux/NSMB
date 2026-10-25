"""Phase14 peer CHANGES_REQUESTED: adversarial source-level no-false-green gates.

Invented DOL, YAML, MAP and JSON only. No Nintendo material, no external YAML
dependency, no mocks of the actual auditor or subprocess CLI.
"""
import json
import struct
import unittest

from test_w01_structural_adversarial import (
    DOL, GOOD_META, MAP, analyze, audit, invented_dol, profile, run_cli,
)

class ProfilePeerFindings(unittest.TestCase):
    def check_bad(self, document):
        with self.assertRaises(ValueError):
            analyze(yaml=document)
        result = run_cli(yaml=document)
        self.assertEqual(result.returncode, 4, result.stdout + result.stderr)
        self.assertNotIn('"strict_compatible": true', result.stdout.lower())

    def test_reject_invalid_root_yamls_found_by_toad(self):
        for suffix in ("- extra-node\n", "unexpected scalar\n",
                       "%YAML 1.2\n", "[17, 19]\n",
                       "*nonexistent\n", "additional: [unterminated\n",
                       "\ufeffextra: 1\n"):
            with self.subTest(suffix=suffix):
                self.check_bad(profile() + suffix)

    def test_no_fake_source_evidence_inside_literal_or_folded_scalar(self):
        for header in ("ignored_notes: |\n", "ignored_notes: >\n",
                       "- |\n"):
            with self.subTest(header=header):
                forged = header + "".join("  " + line for line in profile().splitlines(True))
                with self.assertRaises(ValueError):
                    audit.profile_info(forged)
                self.check_bad(forged)

    def test_nested_scalar_cannot_promote_to_root_evidence(self):
        for trailer in (
            "ignored: present\n  project:\n    game_id: invalid\n",
            "ignored:\n  inner: block\n    translation:\n      entry_points:\n        - 0x80004004\n",
            "ignored: >-\n  project: forged\n",
            "ignored: {unterminated\n",
            "ignored: &anchor value\n",
        ):
            with self.subTest(trailer=trailer):
                self.check_bad(profile() + trailer)

    def test_positive_unknown_mapping_and_first_doc_marker_remain_valid(self):
        for doc in (profile() + "extra: 1\n",
                    "--- # one document\n" + profile() + "extra:\n  explanation: valid\n"):
            with self.subTest(doc=doc[:30]):
                report, code = analyze(yaml=doc)
                self.assertEqual(code, 0)
                self.assertTrue(report["strict_compatible"])
                self.assertEqual(run_cli(yaml=doc).returncode, 0)


def dol_at_boundary(address, size):
    d = bytearray(invented_dol())
    struct.pack_into(">I", d, 0x48, address)
    struct.pack_into(">I", d, 0x90, size)
    entry = address + 4
    struct.pack_into(">I", d, 0xE0, entry)
    return bytes(d), entry


def matching_inputs(data, entry):
    prof = profile(data).replace("0x80004004", f"0x{entry:08X}")
    addresses = f"{entry:08X} synthetic\n"
    meta = json.dumps({"functions": [{"entryPoint": entry}],
                       "quality": {"unsupportedInstructionCount": 0,
                                   "invalidSsaFunctionCount": 0}})
    return prof, addresses, meta


class DolInitializedSectionUint32(unittest.TestCase):
    def test_exact_end_2pow32_rejected_by_checked_uint_upstream(self):
        data, entry = dol_at_boundary(0xFFFFFFF0, 0x10)
        with self.assertRaisesRegex(ValueError, "32-bit|uint32"):
            audit.dol_sections(data)
        prof, fmap, meta = matching_inputs(data, entry)
        with self.assertRaises(ValueError):
            audit.analyze(data, prof, fmap, None, meta)
        result = run_cli(data=data, yaml=prof, map_text=fmap, rel=None, metadata=meta)
        self.assertEqual(result.returncode, 4, result.stdout + result.stderr)

    def test_beyond_2pow32_rejected_by_checked_uint_upstream(self):
        data, entry = dol_at_boundary(0xFFFFFFF0, 0x20)
        with self.assertRaises(ValueError):
            audit.dol_sections(data)

    def test_adjacency_and_valid_last_exclusive_uint32_positive(self):
        data, entry = dol_at_boundary(0xFFFFFFE0, 0x10)
        section = audit.dol_sections(data)["sections"][0]
        self.assertEqual(section["end"], 0xFFFFFFF0)
        prof, fmap, meta = matching_inputs(data, entry)
        report, code = audit.analyze(data, prof, fmap, None, meta)
        self.assertEqual(code, 0)
        self.assertTrue(report["strict_compatible"])
        self.assertEqual(run_cli(data=data, yaml=prof, map_text=fmap, rel=None,
                                 metadata=meta).returncode, 0)


class ThirdRoundPeerReviewRegressions(unittest.TestCase):
    # All examples are invented. They hit the actual analyze() and subprocess
    # CLI; none of these assertions depends on PyYAML being installed.
    def reject(self, doc):
        with self.assertRaises(ValueError):
            analyze(yaml=doc)
        for probe in (False, True):
            with self.subTest(probe=probe):
                process = run_cli(yaml=doc, probe=probe)
                self.assertEqual(process.returncode, 4, process.stdout + process.stderr)
                self.assertNotIn('"strict_compatible": true', process.stdout.lower())

    def accept(self, doc):
        result, code = analyze(yaml=doc)
        self.assertEqual(code, 0)
        self.assertTrue(result["strict_compatible"])
        process = run_cli(yaml=doc)
        self.assertEqual(process.returncode, 0, process.stderr)

    def test_luigi_ascii_controls_cannot_create_yaml_root(self):
        for n in (0x1C, 0x1D, 0x1E):
            with self.subTest(code=hex(n)):
                self.reject("ignored: harmless" + chr(n) + profile())

    def test_toad_unknown_mapping_sibling_indent_fail_closed(self):
        for malformed in (
            "extra:\n    first: yes\n   second: no\n",
            "extra:\n   one: yes\n  two: no\n",
            "extra:\n  nested:\n      first: yes\n     second: no\n",
            "extra:\n     first: yes\n    second:\n      third: yes\n",
            "unknown:\n       first: yes\n      second: no\nother: yes\n",
        ):
            with self.subTest(case=malformed):
                self.reject(profile() + malformed)

    def test_peach_sequence_scalar_rejects_same_indent_map(self):
        self.reject(profile() + "    child: not-valid-after-list-item\n")

    def test_peach_project_mapping_rejects_mixed_sibling_columns(self):
        doc = profile().replace(
            "  game_id: SYNTHETIC\n",
            "   game_id: SYNTHETIC\n  other: 1\n",
        )
        self.reject(doc)

    def test_valid_sibling_columns_and_root_dedent_stay_compatible(self):
        for extension in (
            "extra:\n    first: yes\n    second: no\n",
            "extra:\n    first: yes\n    nested:\n      leaf: no\nother: yes\n",
            "extra:\n  explanation: valid\n",
        ):
            with self.subTest(extension=extension):
                self.accept(profile() + extension)

    def test_crlf_line_ending_remains_supported(self):
        self.accept(profile().replace("\n", "\r\n"))

    def test_unknown_nested_no_source_provenance_in_block(self):
        self.reject("ignored: |\n" + "".join("  " + line for line in profile().splitlines(True)))


if __name__ == "__main__":
    unittest.main()
