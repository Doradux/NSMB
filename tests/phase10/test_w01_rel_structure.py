"""Fail-closed public synthetic REL address/layout gates for W01.

No private DOL, REL, game profile or translated code is needed. Until a
module-aware placement/overlay proof exists, overlapping executable ranges
cannot support an unambiguous strict source-identity claim.
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from audit_profile import rel_sections  # noqa: E402


def module(*sections):
    return {"sections": {f"section{n}": {"exec": True,
            "addr": hex(start), "size": hex(size)}
            for n, (start, size) in enumerate(sections)}}


class RelStrictStructuralGates(unittest.TestCase):
    def parse(self, modules):
        return rel_sections(json.dumps({"modules": modules}))

    def assert_invalid(self, modules):
        with self.assertRaises(ValueError):
            self.parse(modules)

    def test_distinct_sections_allowed(self):
        result = self.parse([module((0x80500000, 0x20)),
                             module((0x80600000, 0x20))])
        self.assertEqual([(s["start"], s["end"]) for s in result],
                         [(0x80500000, 0x80500020),
                          (0x80600000, 0x80600020)])

    def test_touching_section_boundaries_allowed(self):
        result = self.parse([module((0x80500000, 0x20),
                                    (0x80500020, 0x20))])
        self.assertEqual(len(result), 2)

    def test_one_module_overlapping_executable_sections_rejected(self):
        self.assert_invalid([module((0x80500000, 0x40),
                                    (0x80500020, 0x40))])

    def test_two_modules_same_address_cannot_be_claimed_strict_unambiguously(self):
        self.assert_invalid([module((0x80500000, 0x40)),
                             module((0x80500000, 0x40))])

    def test_partial_cross_module_overlap_rejected_without_overlay_proof(self):
        self.assert_invalid([module((0x80500000, 0x40)),
                             module((0x8050003F, 0x40))])

    def test_null_section_mapping_produces_controlled_value_error(self):
        self.assert_invalid([{"sections": None}])

    def test_list_section_mapping_produces_controlled_value_error(self):
        self.assert_invalid([{"sections": []}])

    def test_null_nested_section_produces_controlled_value_error(self):
        self.assert_invalid([{"sections": {"text": None}}])


if __name__ == "__main__":
    unittest.main()
