"""Peach Phase12 independent review of Toad strict REL helper (NOT full audit).

Invoke explicitly:
 NSMB_P12_REL_HELPER_ROOT=/absolute/clean/toad/sha \
  python3 -B tests/phase12/review_rel_helper.py

Uses only invented schema and addresses. Does not modify peer code.
"""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import unittest

ROOT = os.environ.get("NSMB_P12_REL_HELPER_ROOT")
if not ROOT or not Path(ROOT).is_absolute():
    raise RuntimeError("Supply ABSOLUTE exact clean Toad SHA root; never skip")
SOURCE = Path(ROOT) / "scripts" / "strict_rel_layout.py"
if not SOURCE.is_file():
    raise RuntimeError("Published candidate parser missing: " + str(SOURCE))
spec = importlib.util.spec_from_file_location("strict_rel_under_review", SOURCE)
parser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)

BODY = '{"modules":[{"sections":{"text":{"exec":true,"addr":"0x80500000","size":"0x20"}}}]'


class PeerRelJSONConstantValidation(unittest.TestCase):
    def test_unambiguous_synthetic_positive(self):
        result = parser.parse_rel_sections(BODY + "}")
        self.assertEqual(result, [{"start": 0x80500000, "end": 0x80500020,
                                   "executable": True}])

    def test_valid_finite_extra_metadata_does_not_create_false_positive(self):
        result = parser.parse_rel_sections(BODY + ',"extra":{"version":1.5}}')
        self.assertEqual(len(result), 1)

    def test_nonfinite_json_exponent_in_unused_top_level_metadata_fails_closed(self):
        with self.assertRaises(ValueError):
            parser.parse_rel_sections(BODY + ',"extra":1e9999}')

    def test_nonfinite_json_exponent_in_unused_nested_metadata_fails_closed(self):
        with self.assertRaises(ValueError):
            parser.parse_rel_sections(BODY + ',"extra":{"deep":[1e9999]}}')


if __name__ == "__main__":
    unittest.main(verbosity=2)
