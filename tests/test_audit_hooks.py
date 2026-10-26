"""Synthetic native-hook coverage tests. No proprietary game data."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from audit_hooks import audit, scan_file, statuses, translated_entries, scrub_comments_and_literals


def metadata(*addresses):
    return json.dumps({"functions": [{"entryPoint": a} for a in addresses]})


class HookAuditTests(unittest.TestCase):
    def test_literal_comments_and_strings_masked(self):
        text = '''// PPC_NATIVE_OVERRIDE(0x80001234, excluded);
" PPC_NATIVE_OVERRIDE(0x80001234, excluded) ";
/* PPC_NATIVE_OVERRIDE(0x80001234, excluded); */
PPC_NATIVE_OVERRIDE(0x80004004, valid);
'''
        cleaned = scrub_comments_and_literals(text)
        self.assertEqual(cleaned.count("PPC_NATIVE_OVERRIDE"), 1)
        self.assertEqual(text.count("\n"), cleaned.count("\n"))

    def test_disabled_else_and_nested_preprocessors(self):
        text = '''#if 0
PPC_NATIVE_OVERRIDE(0x80000010, disabled);
#if 1
PPC_NATIVE_OVERRIDE(0x80000011, disabled);
#endif
#else
PPC_NATIVE_OVERRIDE(0x80000012, active);
#endif
#ifdef UNKNOWN_FLAG
PPC_NATIVE_OVERRIDE(0x80000013, conditional);
#else
PPC_NATIVE_OVERRIDE(0x80000014, conditional);
#endif
PPC_NATIVE_OVERRIDE(0x80000015, active);
'''
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            file = root / "a.cpp"
            file.write_text(text)
            result = scan_file(file, root)
        self.assertEqual([r["status"] for r in result],
                         ["disabled", "disabled", "active", "conditional",
                          "conditional", "active"])
        self.assertEqual([r["line"] for r in result], [2, 4, 7, 10, 12, 14])

    def test_all_matching_active_hooks(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            (root/"a.cpp").write_text("PPC_NATIVE_OVERRIDE(0x80004004, foo);")
            (root/"b.hpp").write_text("// PPC_NATIVE_OVERRIDE(0x80009999, comment)\n"
                                      "#if 0\nPPC_NATIVE_OVERRIDE(0x80001234, disabled);\n#endif\n")
            report=audit(root,metadata(0x80004004))
        self.assertEqual(report["hooks"]["active"]["matched"],1)
        self.assertEqual(report["hooks"]["disabled"]["unmatched"],1)
        self.assertTrue(report["active_hook_coverage"])

    def test_mismatch_is_reported_with_line_and_path(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            (root/"hook.cpp").write_text("\n\nPPC_NATIVE_OVERRIDE(0x80009999, fake);")
            report=audit(root,metadata(0x80004004))
        self.assertFalse(report["active_hook_coverage"])
        self.assertEqual(report["unmatched_sample"][0],
                         {"file":"hook.cpp", "line":3, "address":"0x80009999", "status":"active"})

    def test_conditional_hooks_must_still_match(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            (root/"hook.cpp").write_text("#ifdef SOME_PLATFORM\n"
                                         "PPC_NATIVE_OVERRIDE(0x80004004, maybe);\n#endif\n")
            report=audit(root,metadata())
        self.assertEqual(report["hooks"]["conditional"]["unmatched"],1)
        self.assertFalse(report["active_hook_coverage"])

    def test_multiline_macro(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            (root/"hook.cpp").write_text("PPC_NATIVE_OVERRIDE(\n 0x80004004, func);\n")
            report=audit(root,metadata(0x80004004))
        self.assertTrue(report["active_hook_coverage"])
        self.assertEqual(report["hooks"]["active"]["occurrences"],1)

    def test_invalid_source_directives(self):
        with self.assertRaisesRegex(ValueError,"Unterminated"):
            statuses("#if 1\nint a;\n")
        with self.assertRaisesRegex(ValueError,"Unmatched"):
            statuses("#else\n")

    def test_metadata_bad_address_or_missing_function_list(self):
        with self.assertRaisesRegex(ValueError,"Expected translated"):
            translated_entries("{}")
        with self.assertRaisesRegex(ValueError,"Invalid translated"):
            translated_entries(metadata(-1))
        self.assertEqual(translated_entries(metadata(0x80004004,0x80004004)),{0x80004004})

    def test_native_registration_without_hex_prefix(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            (root/"hook.cpp").write_text("PPC_NATIVE_OVERRIDE_VOID(80004004, function_name, (), ());")
            report=audit(root,metadata(0x80004004))
        self.assertEqual(report["hooks"]["active"]["matched"],1)
        self.assertTrue(report["active_hook_coverage"])

    def test_empty_registration_root_must_not_pass(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            (root/"only.cpp").write_text("int unrelated = 7;")
            report=audit(root,metadata(0x80004004))
        self.assertFalse(report["active_hook_coverage"])

    def test_no_guest_code_embedded_in_report(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            (root/"hook.cpp").write_text("PPC_NATIVE_OVERRIDE(0x80009999, confidential_original_hook);")
            report=audit(root,metadata())
        self.assertNotIn("confidential_original_hook",json.dumps(report))
        self.assertIn("0x80009999",json.dumps(report))


if __name__ == "__main__":
    unittest.main(verbosity=2)
