"""CLI exit codes never indicate authenticated Nintendo translation."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[3]


class SidecarCliFailClosed(unittest.TestCase):
    def call(self,*argv):
        env=os.environ.copy()
        env.pop("LD_LIBRARY_PATH",None)
        env.pop("LD_PRELOAD",None)
        env["PYTHONDONTWRITEBYTECODE"]="1"
        return subprocess.run([sys.executable,"-B","-m","scripts.phase16.luigi.cli",*map(str,argv)],
                              cwd=ROOT,capture_output=True,text=True,env=env,timeout=12)

    def test_invented_generator_and_check_never_exit_zero(self):
        with tempfile.TemporaryDirectory(prefix="luigi-w16-only-invented-") as tmp:
            d=Path(tmp)/"invented"
            create=self.call("generate-invented","--directory",d)
            self.assertEqual(create.returncode,3,create.stderr)
            self.assertIn("INVENTED_FIXTURE_ONLY",create.stdout)
            args=("check","--sidecar",d/"sidecar.json","--metadata",d/"metadata.json",
                  "--map-file",d/"invented.map","--config-file",d/"invented.config",
                  "--external-anchors",d/"example-anchors-NOT-TRUSTED.json")
            checked=self.call(*args)
            self.assertEqual(checked.returncode,3,checked.stderr)
            report=json.loads(checked.stdout)
            self.assertEqual(report["status"],"STRUCTURAL_ONLY_STOP")
            self.assertFalse(report["producerAttested"])
            self.assertFalse(report["authenticReleaseEligible"])
            self.assertEqual(report["translatedCount"],5)

    def test_cli_tampered_sidecar_denied_even_with_example_anchors(self):
        with tempfile.TemporaryDirectory(prefix="luigi-w16-only-invented-") as tmp:
            d=Path(tmp)/"invented"
            self.assertEqual(self.call("generate-invented","--directory",d).returncode,3)
            path=d/"sidecar.json"
            path.write_bytes(path.read_bytes()+b" ")
            r=self.call("check","--sidecar",path,"--metadata",d/"metadata.json",
                        "--map-file",d/"invented.map","--config-file",d/"invented.config",
                        "--external-anchors",d/"example-anchors-NOT-TRUSTED.json")
            self.assertEqual(r.returncode,4)
            self.assertEqual(r.stdout,"")
            self.assertIn("STRUCTURAL_ERROR_STOP",r.stderr)

    def test_cli_with_corrupted_external_anchors_denied(self):
        with tempfile.TemporaryDirectory(prefix="luigi-w16-only-invented-") as tmp:
            d=Path(tmp)/"invented"
            self.assertEqual(self.call("generate-invented","--directory",d).returncode,3)
            path=d/"example-anchors-NOT-TRUSTED.json"
            data=json.loads(path.read_bytes())
            data["producerAttested"]=True
            path.write_text(json.dumps(data))
            r=self.call("check","--sidecar",d/"sidecar.json","--metadata",d/"metadata.json",
                        "--map-file",d/"invented.map","--config-file",d/"invented.config",
                        "--external-anchors",path)
            self.assertEqual(r.returncode,4)
            self.assertNotIn("authenticReleaseEligible",r.stdout)

    def test_cli_oversized_evidence_denied_without_logging_bytes(self):
        with tempfile.TemporaryDirectory(prefix="luigi-w16-only-invented-") as tmp:
            d=Path(tmp)/"invented"
            self.assertEqual(self.call("generate-invented","--directory",d).returncode,3)
            path=d/"sidecar.json"
            path.write_bytes(b"X"*(2_000_001))
            r=self.call("check","--sidecar",path,"--metadata",d/"metadata.json",
                        "--map-file",d/"invented.map","--config-file",d/"invented.config",
                        "--external-anchors",d/"example-anchors-NOT-TRUSTED.json")
            self.assertEqual(r.returncode,4)
            self.assertNotIn("XXXXXXXX",r.stderr)


if __name__=="__main__":
    unittest.main()
