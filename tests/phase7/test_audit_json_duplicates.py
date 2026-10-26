"""Synthetic W01 source identity audit: duplicate JSON objects and YAML ambiguity.

Run with NSMB_W01_AUDIT_ROOT pointing at exact CLEAN Mario candidate checkout.
Never opens Wii DOL or any original proprietary game files.
"""
import hashlib, importlib.util, json, os, struct, unittest
from pathlib import Path
ROOT=Path(os.environ.get('NSMB_W01_AUDIT_ROOT',Path(__file__).resolve().parents[2]))
FILE=ROOT/'scripts'/'audit_profile.py'
spec=importlib.util.spec_from_file_location('auditor_phase6',FILE)
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
b=bytearray(0x160)
struct.pack_into('>I',b,0x00,0x100)
struct.pack_into('>I',b,0x48,0x80004000)
struct.pack_into('>I',b,0x90,0x20)
struct.pack_into('>III',b,0xD8,0x80310000,0x1000,0x80004004)
b[0x100:0x120]=bytes(range(32))
DATA=bytes(b)
HASH=hashlib.sha256(DATA).hexdigest()
PROFILE='project:\n  game_id: SMNE01\ninputs:\n  dol:\n    sha256: '+HASH+'\ntranslation:\n  entry_points:\n    - 0x80004004\n'
MAP='80004004 included\n'
Q='"unsupportedInstructionCount":0,"invalidSsaFunctionCount":0'
GOOD='{"functions":[{"entryPoint":2147500036}],"quality":{'+Q+'}}'
def accepted(meta,prof=PROFILE,map_text=MAP):
 try:
  result,status=audit.analyze(DATA,prof,map_text,None,meta)
  return bool(result['strict_compatible']),status
 except (TypeError,ValueError,KeyError):
  return False,4
class MetadataDuplicateKeyGate(unittest.TestCase):
 def test_synthetic_positive_and_safe_extra_function(self):
  self.assertEqual(accepted(GOOD),(True,0))
  extra='{"functions":[{"entryPoint":2147500036},{"entryPoint":2147500040}],"quality":{'+Q+'}}'
  # This historical positive was wrong: metadata alone may NOT invent
  # an additional translated function unobserved by independent MAP.
  self.assertEqual(accepted(extra),(False,4))
  # Preserve the actual positive: independently witnessed MAP and
  # translation metadata both name the extra synthetic DOL function.
  self.assertEqual(accepted(extra,map_text=MAP+'80004008 included\n'),(True,0))
 def test_conflicting_duplicate_json_quality_keys_must_not_pass_static_compatibility(self):
  for first in ('1','-1','null','"unsupported"','true'):
   with self.subTest(first=first):
    raw='{"functions":[{"entryPoint":2147500036}],"quality":{"unsupportedInstructionCount":'+first+','+Q+'}}'
    valid,code=accepted(raw)
    self.assertFalse(valid,'duplicated quality counter silently takes last zero')
    self.assertNotEqual(code,0)
 def test_conflicting_duplicate_functions_field_must_not_pass_static_compatibility(self):
  raw='{"functions":[{"entryPoint":2147500044}],"functions":[{"entryPoint":2147500036}],"quality":{'+Q+'}}'
  valid,code=accepted(raw)
  self.assertFalse(valid,'duplicated function list silently takes last mapped entry')
  self.assertNotEqual(code,0)
 def test_duplicate_function_address_inside_one_object_must_not_pass(self):
  raw='{"functions":[{"entryPoint":2147500044,"entryPoint":2147500036}],"quality":{'+Q+'}}'
  valid,code=accepted(raw)
  self.assertFalse(valid,'duplicate entryPoint property silently overwrote wrong address')
  self.assertNotEqual(code,0)
 def test_valid_adjacent_dol_data_section_does_not_create_false_physical_overlap(self):
  x=bytearray(DATA)
  struct.pack_into('>I',x,7*4,0x120)
  struct.pack_into('>I',x,0x48+7*4,0x80300000)
  struct.pack_into('>I',x,0x90+7*4,0x10)
  self.assertEqual(len(audit.dol_sections(bytes(x))['sections']),2)
 def test_out_of_range_quality_and_entry_points_fail_closed(self):
  for addr in ('4294967296','-1','2147500036.5','true','null'):
   with self.subTest(address=addr):
    raw='{"functions":[{"entryPoint":'+addr+'}],"quality":{'+Q+'}}'
    valid,code=accepted(raw)
    self.assertFalse(valid)
    self.assertNotEqual(code,0)
if __name__=='__main__':unittest.main()
