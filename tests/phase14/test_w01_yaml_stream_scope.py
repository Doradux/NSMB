"""Mario Phase14: synthetic, fail-closed single-YAML-stream contract."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from audit_profile import profile_info

PROFILE = ("project:\n  game_id: SYNTHETIC\n"
           "inputs:\n  dol:\n    sha256: " + "a" * 64 + "\n"
           "translation:\n  entry_points:\n    - 0x80004004\n")


class StreamScope(unittest.TestCase):
    def test_optional_first_document_marker_and_comment(self):
        for prefix in ("---\n", "--- # verified only one\n"):
            with self.subTest(prefix=prefix):
                self.assertEqual(profile_info(prefix + PROFILE)["entry"], 0x80004004)

    def test_trailing_document_marker_cannot_smuggle_another_stream(self):
        for marker in ("---\nextra: unused\n", "--- # another stream\n",
                       "--- other\nextra: ignored\n", "----\n",
                       "...\n", "... malformed\n"):
            with self.subTest(marker=marker):
                with self.assertRaises(ValueError):
                    profile_info(PROFILE + marker)

    def test_embedded_document_marker_is_never_valid(self):
        with self.assertRaises(ValueError):
            profile_info("project:\n  ---\n" + PROFILE)


if __name__ == "__main__":
    unittest.main()
