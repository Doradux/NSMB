"""Phase13: GREEN controls for the same contract against the reviewed helper.

Explicit runner:
  python3 -B -m unittest discover -s tests/phase13 -p rel_helper_contract.py -v
Old analyzer integration failures remain deliberately RED in a DIFFERENT file.
"""
import unittest

from rel_audit_integration import DOL, audit, good_rel, layout, section
from strict_rel_layout import parse_rel_sections


def dol_sections():
    return audit.dol_sections(DOL)["sections"]


class StrictRelDolParserContract(unittest.TestCase):
    def parse(self, text):
        return parse_rel_sections(text, dol_sections=dol_sections())

    def rejected(self, text):
        with self.assertRaises(ValueError):
            self.parse(text)

    def test_nonoverlapping_positive_and_no_loss_of_executable_shape(self):
        value = self.parse(good_rel())
        self.assertEqual(value, [{"start": 0x80500000, "end": 0x80500020,
                                  "executable": True}])

    def test_real_dol_data_boundary_adjacency_positive(self):
        self.assertEqual(len(self.parse(layout(
            section(), section("0x80300010", "0x10", False)))), 1)

    def test_finite_non_ascii_extension_positive(self):
        self.assertEqual(len(self.parse(layout(
            section(), extra={"name": "Señal", "v": 1.5}))), 1)

    def test_end_of_u32_half_open_boundary_positive(self):
        self.assertEqual(self.parse(layout(section("0xFFFFFFF0", "0x10"))),
                         [{"start": 0xFFFFFFF0, "end": 0x100000000,
                           "executable": True}])

    def test_empty_and_whitespace_evidence_rejected(self):
        for raw in ("", " ", "\n"):
            with self.subTest(raw=repr(raw)):
                self.rejected(raw)

    def test_dol_text_overlap_rejected(self):
        self.rejected(layout(section("0x80004010", "0x10")))

    def test_nonexecuting_rel_dol_data_overlap_rejected(self):
        self.rejected(layout(section(), section("0x80300008", "0x8", False)))

    def test_rel_rel_text_and_nonexec_intersections_rejected(self):
        for raw in (layout(section(), section("0x80500010", "0x20")),
                    layout(section(), section("0x80500010", "0x10", False))):
            with self.subTest(raw=raw):
                self.rejected(raw)

    def test_unicode_alias_escaped_duplicate_rejected(self):
        self.rejected(r'{"modules":[{"sections":{"a":{"addr":"0x80500000","size":"0x20","exec":true}}}],"mod\u0075les":[]}')

    def test_nfkc_sections_collision_rejected(self):
        self.rejected('{"modules":[{"sections":{}, "sec\uff54ions":{"x":{}}}]}')

    def test_nonfinite_in_unused_root_nested_extension_rejected(self):
        self.rejected(layout(section())[:-1] + ',"extra":{"ignored":[1e9999]}}')

    def test_unpaired_surrogate_in_unused_extension_rejected(self):
        self.rejected(layout(section())[:-1] + r',"extra":{"\ud800":0}}')

    def test_depth_limit_rejected(self):
        self.rejected(layout(section())[:-1] + ',"extra":' +
                      '[' * 270 + '0' + ']' * 270 + '}')

    def test_exec_nonbool_int_rejected(self):
        self.rejected(layout(section(executable=1)))

    def test_addr_bool_rejected(self):
        self.rejected(layout(section(addr=True)))

    def test_bad_size_types_and_negative_rejected(self):
        for size in (1.5, -1, False):
            with self.subTest(size=size):
                self.rejected(layout(section(size=size)))

    def test_uint32_overflow_rejected(self):
        self.rejected(layout(section("0xFFFFFFF0", "0x20")))

    def test_overlay_hints_do_not_override_missing_lifetime_evidence(self):
        raw = layout(section("0x80300008", "0x8"),
                     extra={"allowOverlay": True, "lifetime": "invented"})
        self.rejected(raw)

    def test_bare_parser_must_not_be_misrepresented_as_dol_ownership_proof(self):
        # Documented deliberate limitation: Mario MUST supply DOL sections
        # to analyze() even when standalone parse succeeds.
        raw = layout(section("0x80300008", "0x8"))
        self.assertEqual(len(parse_rel_sections(raw)), 1)
        self.rejected(raw)


if __name__ == "__main__":
    unittest.main(verbosity=2)
