"""Reviewer-owned synthetic W01 negative gates; never reads Nintendo media.

Run with NSMB_W01_AUDIT_ROOT pointing at an exact CLEAN published commit,
e.g. Peach-Phase5-W01-Audit. Every test requires audit to FAIL CLOSED.
"""
from __future__ import annotations
import hashlib, importlib.util, json, os, struct, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(os.environ.get("NSMB_W01_AUDIT_ROOT", Path(__file__).resolve().parents[2]))
SCRIPT = ROOT / "scripts" / "audit_profile.py"
if not SCRIPT.is_file():
    raise RuntimeError("Exact audit source missing: " + str(SCRIPT))
spec = importlib.util.spec_from_file_location("reviewed_audit_profile", SCRIPT)
auditor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auditor)
def fake_dol():
    b = bytearray(0x160)
    struct.pack_into(">I", b, 0, 0x100)
    struct.pack_into(">I", b, 0x48, 0x80004000)
    struct.pack_into(">I", b, 0x90, 0x20)
    struct.pack_into(">III", b, 0xD8, 0x80310000, 0x1000, 0x80004004)
    b[0x100:0x120] = bytes(range(32))
    return bytes(b)
DOL = fake_dol()
HASH = hashlib.sha256(DOL).hexdigest()
def profile(digest=HASH):
    return ("project:\n  game_id: SMNE01\ninputs:\n  dol:\n    sha256: "
        + digest + "\ntranslation:\n  entry_points:\n    - 0x80004004\n")
def metadata(functions=None, quality=None):
    return json.dumps({"functions": [{"entryPoint":0x80004004}] if functions is None else functions,
        "quality": {"unsupportedInstructionCount":0,"invalidSsaFunctionCount":0}
        if quality is None else quality})
def audit(prof=None, map_text="80004004 a", meta=None):
    return auditor.analyze(DOL,profile() if prof is None else prof,map_text,None,
        metadata() if meta is None else meta)

class W01FailClosedPhase5(unittest.TestCase):
    def test_legitimate_full_synthetic_coverage_is_accepted(self):
        r, code = audit()
        self.assertEqual(code,0)
        self.assertTrue(r["strict_compatible"])

    def test_duplicate_translation_subtree_must_not_silently_use_first_entry(self):
        conflicting = profile()+"translation:\n  entry_points:\n    - 0x80009999\n"
        with self.assertRaisesRegex(ValueError, "Duplicate|profile|entry|translation"):
            auditor.profile_info(conflicting)

    def test_duplicate_top_level_inputs_must_not_preserve_old_sha(self):
        conflicting = profile()+"inputs:\n  dol:\n    md5: 1234567890\n"
        with self.assertRaisesRegex(ValueError, "Duplicate|inputs|profile|sha"):
            auditor.profile_info(conflicting)

    def test_multiple_entry_points_include_all_or_explicitly_fail_closed(self):
        conflicting = profile().rstrip()+"\n    - 0x80009999\n"
        # Single-entry auditor may reject multi-entry configurations, but must
        # not greenlight an unverified second entry as if the only entry.
        try:
            r, code = audit(prof=conflicting)
        except ValueError:
            return
        self.assertFalse(r["strict_compatible"],"Second unvalidated translation entry silently ignored")
        self.assertNotEqual(code,0)

    def test_fractional_metadata_entry_point_must_not_truncate_to_real_guest_pc(self):
        for f in (float(0x80004004),float(0x80004004)+0.75):
            with self.subTest(entry=f):
                try:
                    r, code = audit(meta=metadata([{"entryPoint":f}]))
                except (ValueError,TypeError):
                    continue
                self.assertFalse(r["strict_compatible"],"JSON noninteger entryPoint truncated into a covered address")
                self.assertNotEqual(code,0)

    def test_negative_boolean_fraction_quality_fields_are_rejected(self):
        for bad in (-1,False,True,0.25,"0",None):
            with self.subTest(value=bad):
                q={"unsupportedInstructionCount":bad,"invalidSsaFunctionCount":0}
                r, code=audit(meta=metadata(quality=q))
                self.assertFalse(r["strict_compatible"])
                self.assertNotEqual(code,0)

    def test_missing_map_or_metadata_never_probe_success_just_due_to_wrong_hash(self):
        with tempfile.TemporaryDirectory(prefix="peach-w01-synthetic-") as folder:
            t=Path(folder)
            (t/"fixture.dol").write_bytes(DOL)
            (t/"profile.yml").write_text(profile("f"*64),encoding="utf-8")
            (t/"map.txt").write_text("80004004 a\n",encoding="utf-8")
            (t/"metadata.json").write_text(metadata(),encoding="utf-8")
            base=[sys.executable,str(SCRIPT),"--dol",str(t/"fixture.dol"),"--profile",str(t/"profile.yml")]
            full=["--map",str(t/"map.txt"),"--translation-metadata",str(t/"metadata.json")]
            for args, expected in [(full,0),([],3),(["--map",str(t/"map.txt")],3),
                     (["--translation-metadata",str(t/"metadata.json")],3)]:
                with self.subTest(args=args):
                    run=subprocess.run([*base,"--probe",*args],capture_output=True,text=True)
                    if expected==0:
                        self.assertEqual(run.returncode,0,run.stderr)
                        self.assertFalse(json.loads(run.stdout)["strict_compatible"])
                    else:
                        self.assertNotEqual(run.returncode,0,
                            "Probe accepted wrong SHA AND incomplete static coverage, treating failure as success")

    def test_dol_address_overflow_and_aliased_file_ranges_are_rejected(self):
        b=bytearray(DOL)
        struct.pack_into(">I",b,0x48,0xFFFFFFF0)
        struct.pack_into(">I",b,0x90,0x20)
        with self.assertRaises(ValueError):auditor.dol_sections(bytes(b))
        b=bytearray(DOL)
        struct.pack_into(">I",b,4,0x100)
        struct.pack_into(">I",b,0x48+4,0x80005000)
        struct.pack_into(">I",b,0x90+4,0x20)
        with self.assertRaises(ValueError):auditor.dol_sections(bytes(b))

    def test_valid_extra_translated_func_and_empty_map_rules(self):
        r,code=audit(meta=metadata([{"entryPoint":0x80004004},{"entryPoint":0x80004008}]))
        self.assertTrue(r["strict_compatible"]);self.assertEqual(code,0)
        r,code=audit(map_text="")
        self.assertFalse(r["strict_compatible"]);self.assertNotEqual(code,0)
        r,code=audit(map_text="80004004 a\n80004008 b")
        self.assertFalse(r["strict_compatible"]);self.assertNotEqual(code,0)

if __name__=="__main__":
    unittest.main(verbosity=2)
