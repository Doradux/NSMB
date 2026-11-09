"""Black-box CLI tests: all outputs synthetic, no authentic exit 0."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[3]

class InventedOriginCli(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='luigi-phase17-toy-')
        self.addCleanup(self.tmp.cleanup)
        self.folder=Path(self.tmp.name)/'generated'

    def run_cli(self,mode,folder=None):
        env=os.environ.copy()
        env.pop('LD_LIBRARY_PATH',None)
        env.pop('LD_PRELOAD',None)
        env['PYTHONDONTWRITEBYTECODE']='1'
        return subprocess.run([sys.executable,'-B','-m',
           'scripts.phase17.luigi.cli',mode,'--directory',
           str(folder or self.folder)],cwd=ROOT,capture_output=True,
           text=True,env=env,timeout=15)

    def populate(self):
        generated=self.run_cli('generate-demo')
        self.assertEqual(generated.returncode,3,generated.stderr)
        self.assertIn('INVENTED_ORIGIN_ONLY',generated.stdout)

    def test_generation_and_check_cannot_claim_authentic_release(self):
        self.populate()
        checked=self.run_cli('check-demo')
        self.assertEqual(checked.returncode,3,checked.stderr)
        report=json.loads(checked.stdout)
        self.assertEqual(report['status'],'TOY_REPLAY_ONLY_STOP')
        self.assertEqual((report['translatedCount'],report['eventCount'],report['skippedAttempts']),(6,17,2))
        self.assertFalse(report['producerAttested'])
        self.assertFalse(report['authenticReleaseEligible'])

    def test_deterministic_rerun_two_fresh_processes(self):
        self.populate()
        second=Path(self.tmp.name)/'second'
        self.assertEqual(self.run_cli('generate-demo',second).returncode,3)
        for name in ('source.dol','inputs.map','config.json','metadata.json','sidecar.json'):
            self.assertEqual((self.folder/name).read_bytes(),(second/name).read_bytes())

    def test_output_mutation_and_missing_file_fail_closed(self):
        self.populate()
        first=next((self.folder/'outputs').iterdir())
        first.write_bytes(first.read_bytes()+b'fake source')
        failed=self.run_cli('check-demo')
        self.assertEqual(failed.returncode,4)
        self.assertEqual(failed.stdout,'')
        first.unlink()
        self.assertEqual(self.run_cli('check-demo').returncode,4)

    def test_source_mutation_denied_without_leaking_content(self):
        self.populate()
        path=self.folder/'source.dol'
        original=path.read_bytes()
        path.write_bytes(original[:-1]+bytes([original[-1]^1]))
        result=self.run_cli('check-demo')
        self.assertEqual(result.returncode,4)
        self.assertEqual(result.stdout,'')
        self.assertIn('SYNTHETIC_EVIDENCE_REJECTED_STOP',result.stderr)

    def test_map_and_config_mutations_rejected(self):
        for name in ('inputs.map','config.json'):
            with self.subTest(name=name):
                self.populate()
                path=self.folder/name
                path.write_bytes(path.read_bytes()+b'\n')
                self.assertEqual(self.run_cli('check-demo').returncode,4)
                import shutil
                shutil.rmtree(self.folder)

    def test_forged_anchor_claim_is_rejected(self):
        self.populate()
        path=self.folder/'example-anchors-NOT-TRUSTED.json'
        data=json.loads(path.read_bytes())
        data['producerAttested']=True
        path.write_text(json.dumps(data),encoding='utf-8')
        self.assertEqual(self.run_cli('check-demo').returncode,4)

    def test_missing_or_extra_output_artifact_denied(self):
        self.populate()
        (self.folder/'outputs'/'unexpected.cpp').write_text('invented extra')
        self.assertEqual(self.run_cli('check-demo').returncode,4)
        (self.folder/'outputs'/'unexpected.cpp').unlink()
        self.assertEqual(self.run_cli('check-demo').returncode,3)

    def test_symlinked_output_artifact_denied(self):
        self.populate()
        first=next((self.folder/'outputs').iterdir())
        first.unlink()
        first.symlink_to(self.folder/'sidecar.json')
        self.assertEqual(self.run_cli('check-demo').returncode,4)

    def test_generation_will_not_overwrite_existing_directory(self):
        self.populate()
        old=(self.folder/'source.dol').read_bytes()
        result=self.run_cli('generate-demo')
        self.assertEqual(result.returncode,4)
        self.assertEqual((self.folder/'source.dol').read_bytes(),old)

    def test_absent_directory_is_rejected_without_creation(self):
        self.assertEqual(self.run_cli('check-demo').returncode,4)
        self.assertFalse(self.folder.exists())

if __name__=='__main__':
    unittest.main()
