"""Phase9 independent REL JSON ambiguity gate, tiny invented DOL only.

Run with NSMB_W01_AUDIT_ROOT pointing to exact audited W01 source.
Do not read any original Nintendo Wii REL/DOL/RVZ bytes or profile hashes.
"""
import hashlib
import importlib.util
import json
import os
import struct
import unittest
from pathlib import Path
ROOT = Path(os.environ.get("NSMB_W01_AUDIT_ROOT", Path(__file__).resolve().parents[2]))
SCRIPT = ROOT / "scripts" / "audit_profile.py"
assert SCRIPT.is_file(), SCRIPT
spec = importlib.util.spec_from_file_location("phase9_w01_candidate", SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
data=bytearray(0x160)
struct.pack_into(">I",data,0x00,0x100)
struct.pack_into(">I",data,0x48,0x80004000)
struct.pack_into(">I",data,0x90,0x20)
struct.pack_into(">III",data,0xD8,0x80310000,0x1000,0x80004004)
data[0x100:0x120]=bytes(range(32))
DOL=bytes(data)
PROFILE=("inputs:\n  dol:\n    sha256: "+hashlib.sha256(DOL).hexdigest()
  +"\ntranslation:\n  entry_points:\n    - 0x80004004\n")
MAP="80004004 translated_main\n80500004 translated_rel\n"
METADATA=json.dumps({"functions":[{"entryPoint":0x80004004},{"entryPoint":0x80500004}],
 "quality":{"unsupportedInstructionCount":0,"invalidSsaFunctionCount":0}})
VALID_MODULE='{"sections":{"text":{"exec":true,"addr":"0x80500000","size":"0x20"}}}'
BAD_MODULE='{"sections":{"text":{"exec":true,"addr":"0xFFFFFFF0","size":"0x20"}}}'
VALID_REL='{"modules":['+VALID_MODULE+']}'
def complete(rel):
 return audit.analyze(DOL,PROFILE,MAP,rel,METADATA)
class StrictRelJsonObjectIdentity(unittest.TestCase):
 def test_legitimate_rel_exec_coverage_positive(self):
  result,code=complete(VALID_REL)
  self.assertEqual(code,0)
  self.assertTrue(result["strict_compatible"])
  self.assertEqual(result["function_map"]["counts"]["rel"],1)
 def test_duplicate_top_level_modules_must_not_erase_unsafe_first(self):
  self.assertReject('{"modules":['+BAD_MODULE+'],"modules":['+VALID_MODULE+']}')
 def test_duplicate_section_map_must_not_hide_invalid_first_section(self):
  self.assertReject('{"modules":[{"sections":{"bad":{"exec":true,"addr":"0xFFFFFFF0","size":"0x20"}},"sections":{"text":{"exec":true,"addr":"0x80500000","size":"0x20"}}}]}')
 def test_duplicate_nested_address_must_not_hide_invalid_first_address(self):
  self.assertReject('{"modules":[{"sections":{"text":{"exec":true,"addr":"0xFFFFFFF0","addr":"0x80500000","size":"0x20"}}}]}')
 def test_unicode_escaped_duplicate_rel_mapping_must_not_hide_first(self):
  self.assertReject('{"modules":[{"sections":{"bad":{"exec":true,"addr":"0xFFFFFFF0","size":"0x20"}},"sec\\u0074ions":{"text":{"exec":true,"addr":"0x80500000","size":"0x20"}}}]}')
 def assertReject(self, rel):
  try:
   result,code=complete(rel)
  except (ValueError,KeyError,TypeError):
   return
  self.assertFalse(result["strict_compatible"],
    "Duplicate REL JSON object keys silently overwritten, reporting verified static coverage")
  self.assertNotEqual(code,0)
if __name__=="__main__":unittest.main()
