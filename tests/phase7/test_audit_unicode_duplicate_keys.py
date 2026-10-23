"""Additional W01 canonical Unicode key alias attack (public 0x160 byte DOL).
Original binaries never read, and no private original hashes used.
"""
import unittest
from test_audit_json_duplicates import accepted, Q

class CanonicalJsonKeyAudit(unittest.TestCase):
    def test_escaped_unicode_key_cannot_hide_invalid_entrypoint(self):
        # JSON parser decodes U+0050 to "P": TWO entryPoint properties.
        encoded='{"functions":[{"entryPoint":2147500044,"entry\\u0050oint":2147500036}],"quality":{'+Q+'}}'
        valid,code=accepted(encoded)
        self.assertFalse(valid,"Unicode alias hides invalid first guest address")
        self.assertNotEqual(code,0)

    def test_escaped_unicode_key_cannot_hide_invalid_quality(self):
        # JSON parser decodes U+0043 to "C": duplicate count, last 0 wins.
        encoded='{"functions":[{"entryPoint":2147500036}],"quality":{"unsupportedInstructionCount":2,"unsupportedInstruction\\u0043ount":0,"invalidSsaFunctionCount":0}}'
        valid,code=accepted(encoded)
        self.assertFalse(valid,"Unicode alias hides originally unsafe unsupported count")
        self.assertNotEqual(code,0)

    def test_trailing_duplicate_nested_quality_entire_object_rejected(self):
        raw='{"functions":[{"entryPoint":2147500036}],"quality":{"unsupportedInstructionCount":99,"invalidSsaFunctionCount":0},"quality":{'+Q+'}}'
        valid,code=accepted(raw)
        self.assertFalse(valid,"Duplicate quality parent overwrites unsupported instruction count")
        self.assertNotEqual(code,0)
if __name__=='__main__':unittest.main()
