"""Fail-closed public synthetic REL address/layout gates for W01.

No private DOL, REL, game profile or translated code is needed. Until a
module-aware placement/overlay proof exists, malformed section mappings must not abort outside the auditor's controlled
error contract. Overlap policies are covered independently in Peach PR #2.
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

    def test_top_level_list_produces_controlled_value_error(self):
        with self.assertRaises(ValueError):
            rel_sections("[]")

    def test_null_section_mapping_produces_controlled_value_error(self):
        self.assert_invalid([{"sections": None}])

    def test_list_section_mapping_produces_controlled_value_error(self):
        self.assert_invalid([{"sections": []}])

    def test_null_nested_section_produces_controlled_value_error(self):
        self.assert_invalid([{"sections": {"text": None}}])


if __name__ == "__main__":
    unittest.main()
