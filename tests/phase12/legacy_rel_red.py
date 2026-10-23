"""Deliberately RED witness suite for ORIGINAL public W01 rel_sections().

Never include this file in the helper's green CI; it must fail on
published legacy audit_profile.py until Mario integrates a strict helper.
Run explicitly:
  python3 -B -m unittest discover -s tests/phase12 -p legacy_rel_red.py -v
Only synthetic JSON; no original game data.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from audit_profile import rel_sections


class OldRelUntrustedEvidenceRed(unittest.TestCase):
    def test_duplicated_root_modules_rejected(self):
        with self.assertRaises(ValueError):
            rel_sections('{"modules":[],"modules":[{"sections":{"t":{"exec":true,"addr":"0x80500000","size":"0x20"}}}]}')

    def test_unicode_escaped_root_alias_rejected(self):
        with self.assertRaises(ValueError):
            rel_sections('{"modules":[],"mod\\u0075les":[{"sections":{"t":{"exec":true,"addr":"0x80500000","size":"0x20"}}}]}')

    def test_top_level_list_rejected_as_controlled_value_error(self):
        with self.assertRaises(ValueError):
            rel_sections('[]')

    def test_null_sections_rejected_as_controlled_value_error(self):
        with self.assertRaises(ValueError):
            rel_sections('{"modules":[{"sections":null}]}')

    def test_overlapping_two_modules_rejected(self):
        with self.assertRaises(ValueError):
            rel_sections('{"modules":[{"sections":{"a":{"exec":true,"addr":"0x80500000","size":"0x20"}}},{"sections":{"b":{"exec":true,"addr":"0x80500010","size":"0x20"}}}]}')

    def test_bool_addr_rejected_not_accepted_as_integer(self):
        with self.assertRaises(ValueError):
            rel_sections('{"modules":[{"sections":{"a":{"exec":true,"addr":true,"size":"0x20"}}}]}')

    def test_duplicate_member_exec_false_then_true_rejected(self):
        with self.assertRaises(ValueError):
            rel_sections('{"modules":[{"sections":{"a":{"exec":false,"exec":true,"addr":"0x80500000","size":"0x20"}}}]}')

    def test_exec_int_one_rejected(self):
        with self.assertRaises(ValueError):
            rel_sections('{"modules":[{"sections":{"a":{"exec":1,"addr":"0x80500000","size":"0x20"}}}]}')
