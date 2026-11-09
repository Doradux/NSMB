"""Exact public pinned C# source patch test; work only in temp copies."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest

from scripts.phase18.luigi.make_patch import PROGRAM,SINK,PIN,make_patch

ROOT=Path(__file__).resolve().parents[3]
PUBLIC=Path(os.environ.get('NSMB_PUBLIC_TRANSLATOR_CHECKOUT',
                           '/home/marcos/NSMB/upstream-nsmbw'))
PATCH=ROOT/'docs/phase18/provenance/PublicTranslatorCausalTrace.patch'

class PublicTranslatorPatch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not (PUBLIC/PROGRAM).is_file():
            raise RuntimeError('required public translator checkout not found')
        pin=subprocess.run(['git','-C',str(PUBLIC),'rev-parse','HEAD'],
                           capture_output=True,text=True,check=True)
        if pin.stdout.strip()!=PIN:
            raise RuntimeError('public checkout SHA mismatch; no source substituted')
        cls.source=(PUBLIC/PROGRAM).read_text()
        cls.contents=PATCH.read_text()

    def workspace(self):
        tmp=tempfile.TemporaryDirectory(prefix='luigi-w18-csharp-')
        self.addCleanup(tmp.cleanup)
        root=Path(tmp.name)
        target=root/PROGRAM
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(self.source)
        return root,target

    def git(self,folder,*argv):
        return subprocess.run(['git','apply',*argv,str(PATCH)],cwd=folder,
                              capture_output=True,text=True,timeout=15)

    def test_versioned_patch_is_deterministic_from_exact_public_file(self):
        self.assertEqual(make_patch(self.source),self.contents)

    def test_git_apply_check_and_real_apply_in_temporary_public_copy(self):
        root,target=self.workspace()
        self.assertEqual(self.git(root,'--check').returncode,0)
        result=self.git(root)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertTrue((root/SINK).is_file())
        self.assertEqual(self.git(root,'--reverse','--check').returncode,0)
        self.assertNotEqual(target.read_text(),self.source)

    def test_mutated_original_csharp_anchor_fails_closed(self):
        root,target=self.workspace()
        target.write_text(self.source.replace(
            'queue.Enqueue((startAddr, 0));',
            'queue.Enqueue((startAddr, 99));',1))
        self.assertNotEqual(self.git(root,'--check').returncode,0)

    def test_trace_hooks_are_at_serial_commit_and_late_output_sites(self):
        root,target=self.workspace()
        self.assertEqual(self.git(root).returncode,0)
        text=target.read_text()
        markers=('source_sha256','map_sha256','project_config_sha256',
                 'root_declared','map_seed_declared','map_seed_deduplicated',
                 'map_seed_queued','speculative_attempted','walk_attempted',
                 'speculative_skipped','translation_committed',
                 'target_discovered','bundle_wave_completed','output_emitted',
                 'run_completed')
        for name in markers:
            with self.subTest(name=name):self.assertIn('"'+name+'"',text)
        self.assertLess(text.index('translation_committed'),
                        text.index('target_discovered'))
        self.assertLess(text.index('bundle_wave_completed'),
                        text.index('output_emitted'))
        self.assertLess(text.index('output_emitted'),
                        text.index('run_completed'))
        self.assertIn('FileMode.CreateNew',(root/SINK).read_text())
        self.assertIn('producerAttested = false',(root/SINK).read_text())

    def test_never_change_existing_w01_or_upstream_checkout(self):
        self.assertFalse(any(name in self.contents for name in
            ('scripts/audit_profile.py','scripts/strict_translation_metadata.py')))
        self.assertNotIn('privateKey',self.contents)
        self.assertEqual((PUBLIC/PROGRAM).read_text(),self.source)
        self.assertEqual(PATCH.read_text(),self.contents)

if __name__=='__main__':unittest.main()
