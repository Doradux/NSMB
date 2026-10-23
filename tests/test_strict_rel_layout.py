"""Synthetic-only positive/negative contract tests for strict_rel_layout.

Run:
  python3 -B -m unittest discover -s tests -p 'test_strict_rel_layout.py' -v
Do not use original Nintendo artifacts or credential files.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from strict_rel_layout import parse_rel_sections  # noqa: E402


def section(addr="0x80500000", size="0x20", *, executable=True, **extra):
    return {"exec": executable, "addr": addr, "size": size, **extra}


def payload(*modules):
    return json.dumps({"modules": list(modules)})


def module(**sections):
    return {"sections": sections}


DOL = [
    {"start": 0x80004000, "end": 0x80004020, "executable": True},
    {"start": 0x80300000, "end": 0x80300010, "executable": False},
]


class TestStrictRelPositives(unittest.TestCase):
    def test_regular_author_rel_with_nonexec(self):
        raw = payload(module(text=section(), data=section(
            "0x80500020", "0x10", executable=False)))
        self.assertEqual(parse_rel_sections(raw, dol_sections=DOL),
                         [{"start": 0x80500000, "end": 0x80500020,
                           "executable": True}])

    def test_adjacent_sections_and_distinct_modules(self):
        raw = payload(module(text=section()), module(text=section("0x80500020")))
        self.assertEqual(len(parse_rel_sections(raw, dol_sections=DOL)), 2)

    def test_integer_uint32_and_last_byte_half_open_end(self):
        raw = payload(module(text=section(0xFFFFFFFF, 1)))
        self.assertEqual(parse_rel_sections(raw)[0]["end"], 0x100000000)

    def test_empty_modules_explicitly_supported(self):
        self.assertEqual(parse_rel_sections('{"modules":[]}', dol_sections=DOL), [])

    def test_nonexecutable_valid_section_does_not_count_as_translated(self):
        self.assertEqual(parse_rel_sections(payload(module(data=section(
            "0x80500000", "0x20", executable=False))), dol_sections=DOL), [])

    def test_json_whitespace_and_explicit_integer_types(self):
        raw = '  {"modules": [{"sections":{"a": {"addr":2169503744,"size":32,"exec":true}}}]}  '
        self.assertEqual(parse_rel_sections(raw)[0]["start"], 2169503744)

    def test_boundary_next_to_dol_is_not_overlap(self):
        self.assertEqual(len(parse_rel_sections(
            payload(module(text=section("0x80004020", "0x10"))),
            dol_sections=DOL)), 1)

    def test_unrelated_extra_fields_do_not_act_as_waiver(self):
        raw = payload({"sections": {"text": section()}, "note": "synthetic"})
        self.assertEqual(len(parse_rel_sections(raw, dol_sections=DOL)), 1)


class TestStrictRelInvalidJson(unittest.TestCase):
    def assertBad(self, raw, *, dol_sections=None):
        with self.assertRaises(ValueError):
            parse_rel_sections(raw, dol_sections=dol_sections)

    def test_duplicate_root_modules(self):
        self.assertBad('{"modules":[],"modules":[{"sections":{}}]}')

    def test_unicode_escape_duplicate_root(self):
        self.assertBad('{"modules":[],"mod\\u0075les":[]}')

    def test_unicode_escape_duplicate_sections(self):
        self.assertBad('{"modules":[{"sections":{},"sec\\u0074ions":{}}]}')

    def test_duplicate_nested_section_name(self):
        self.assertBad('{"modules":[{"sections":{"text":{},"text":{}}}]}')

    def test_unicode_escape_duplicate_nested_member(self):
        self.assertBad('{"modules":[{"sections":{"t":{"exec":true,"ex\\u0065c":false}}}]}')

    def test_unicode_compatibility_key_collision(self):
        self.assertBad('{"modules":[],"extension":{"Key":1,"\\u212Aey":2}}')

    def test_duplicate_any_ignored_extension_still_rejected(self):
        self.assertBad('{"modules":[],"extra":{"nested":{"x":1,"x":2}}}')

    def test_nonfinite_json_constant_even_in_extension(self):
        for raw in ('{"modules":[],"ignored":NaN}',
                    '{"modules":[],"ignored":Infinity}',
                    '{"modules":[],"ignored":-Infinity}'):
            with self.subTest(raw=raw):
                self.assertBad(raw)

    def test_invalid_json_syntax(self):
        for raw in ("{", "", '{"modules":[}', '{"modules":[]}//comment'):
            with self.subTest(raw=raw):
                self.assertBad(raw)


class TestStrictRelStructures(unittest.TestCase):
    def test_root_must_be_object(self):
        for root in ([], None, True, False, 17, "x"):
            with self.subTest(root=root), self.assertRaises(ValueError):
                parse_rel_sections(json.dumps(root))

    def test_modules_must_be_list_not_missing(self):
        for value in (None, {}, "x", False, 1):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_rel_sections(json.dumps({"modules": value}))
        with self.assertRaises(ValueError):
            parse_rel_sections("{}")

    def test_every_module_must_be_object(self):
        for value in (None, "text", [], 0, False):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_rel_sections(payload(value))

    def test_sections_required_and_mapping(self):
        for mod in ({}, {"sections": None}, {"sections": []},
                    {"sections": 3}, {"sections": "data"}):
            with self.subTest(mod=mod), self.assertRaises(ValueError):
                parse_rel_sections(payload(mod))

    def test_section_must_be_object(self):
        for item in (None, [], "section", False, 10):
            with self.subTest(item=item), self.assertRaises(ValueError):
                parse_rel_sections(payload(module(text=item)))

    def test_exec_explicit_bool_only(self):
        for flag in (None, 1, 0, "true", "false", 0.0, 1.0, [], {}):
            with self.subTest(flag=flag), self.assertRaises(ValueError):
                parse_rel_sections(payload(module(text=section(executable=flag))))
        with self.assertRaises(ValueError):
            parse_rel_sections(payload(module(text={"addr": "0x80500000",
                                                    "size": "0x20"})))

    def test_addr_size_both_required_even_when_nonexec(self):
        for field in ("addr", "size"):
            for executable in (True, False):
                value = section(executable=executable)
                del value[field]
                with self.subTest(field=field, executable=executable), self.assertRaises(ValueError):
                    parse_rel_sections(payload(module(text=value)))

    def test_zero_size_rejected_in_executable_and_nonexec(self):
        for flag in (True, False):
            for value in (0, "0x0", "0x0000"):
                with self.subTest(flag=flag, value=value), self.assertRaises(ValueError):
                    parse_rel_sections(payload(module(text=section(size=value, executable=flag))))

    def test_bad_addr_values(self):
        invalid = (True, False, None, [], {}, 1.25, -1, "0x-1",
                   "0b100", "200", "0XGG", "0x", " 0x10", "0x100000000",
                   0x100000000, "-0x1", "0x1.5", "nan")
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_rel_sections(payload(module(text=section(addr=value))))

    def test_bad_size_values(self):
        invalid = (True, False, None, [], {}, 0, -1, 1.5, "0x0",
                   "0x-1", "0b1", "42", "0XGG", "0x100000000",
                   0x100000000, "-1", "0xF.5", "Infinity")
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_rel_sections(payload(module(text=section(size=value))))

    def test_uint32_end_overflow(self):
        for begin, size in (("0xFFFFFFF0", "0x20"),
                            (0xFFFFFFFF, 2), ("0x80500000", "0x80000000")):
            with self.subTest(begin=begin, size=size), self.assertRaises(ValueError):
                parse_rel_sections(payload(module(text=section(begin, size))))

    def test_invalid_dol_schema_must_not_be_ignored(self):
        raw = payload(module(text=section()))
        for bad in (None, "x", {"start": 1}, [None],
                    [{"start": True, "end": 3, "executable": True}],
                    [{"start": 1, "end": 3.5, "executable": True}],
                    [{"start": 1, "end": 3, "executable": 1}],
                    [{"start": 3, "end": 3, "executable": True}],
                    [{"start": 0, "end": 0x100000001, "executable": True}]):
            if bad is None:
                continue  # None is the explicit parser-only mode.
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                parse_rel_sections(raw, dol_sections=bad)


class TestStrictRelOwnership(unittest.TestCase):
    def reject(self, raw, *, dol_sections=None):
        with self.assertRaisesRegex(ValueError, "[Oo]verlap"):
            parse_rel_sections(raw, dol_sections=dol_sections)

    def test_two_modules_same_exec_interval(self):
        self.reject(payload(module(text=section()), module(text2=section())))

    def test_distinct_modules_partially_overlap(self):
        self.reject(payload(module(text=section()), module(text2=section("0x80500010"))))

    def test_two_sections_in_same_module_overlap(self):
        self.reject(payload(module(text=section(), overlay=section("0x80500010"))))

    def test_executable_vs_nonexecuting_range_collision(self):
        self.reject(payload(module(text=section()), module(
            data=section("0x80500010", executable=False))))

    def test_two_nonexec_ranges_overlap(self):
        self.reject(payload(module(data=section(executable=False),
                                   data2=section("0x80500010", executable=False))))

    def test_rel_overlaps_dol_executable(self):
        self.reject(payload(module(text=section("0x80004010", "0x20"))),
                    dol_sections=DOL)

    def test_rel_overlaps_dol_nonexecuting(self):
        self.reject(payload(module(data=section("0x80300000", "0x10",
                                               executable=False))), dol_sections=DOL)

    def test_rel_starts_on_dol_exact_same_interval(self):
        self.reject(payload(module(text=section("0x80004000", "0x20"))),
                    dol_sections=DOL)

    def test_json_claimed_overlay_proof_is_not_authenticated(self):
        raw = payload({"sections": {"text": section("0x80004000")},
                       "overlay_lifetime": "trust me"})
        self.reject(raw, dol_sections=DOL)

    def test_json_claimed_relocation_does_not_bypass(self):
        raw = payload(module(text=section(overlay=True),
                             alias=section("0x80500010", relocation="verified")))
        self.reject(raw)


if __name__ == "__main__":
    unittest.main(verbosity=2)
