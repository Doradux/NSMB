"""Black-box invented-source v2 CLI contract. No real Nintendo or C#."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[3]


class DeferredOriginCli(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='nsmb-luigi-v2-')
        self.addCleanup(self.temp.cleanup)
        self.path=Path(self.temp.name)/'output'

    def cli(self,mode):
        env=os.environ.copy()
        env.pop('LD_LIBRARY_PATH',None)
        env.pop('LD_PRELOAD',None)
        env['PYTHONDONTWRITEBYTECODE']='1'
        return subprocess.run([sys.executable,'-B','-m','scripts.phase17.luigi.cli',
                               mode,'--directory',str(self.path)],
                              cwd=ROOT,env=env,capture_output=True,text=True,timeout=10)

    def test_generate_verify_deferred_version_never_authenticates(self):
        a=self.cli('generate-origin-v2')
        self.assertEqual(a.returncode,3,a.stderr)
        self.assertIn('INVENTED_V2_',a.stdout)
        b=self.cli('check-origin-v2')
        self.assertEqual(b.returncode,3,b.stderr)
        result=json.loads(b.stdout)
        self.assertEqual(result['status'],'TOY_V2_REPLAY_ONLY_STOP')
        self.assertFalse(result['producerAttested'])
        self.assertFalse(result['authenticReleaseEligible'])
        self.assertGreater(result['eventCount'],17)

    def test_forged_complete_trace_reordered_denied(self):
        self.assertEqual(self.cli('generate-origin-v2').returncode,3)
        p=self.path/'origin-v2.json'
        m=json.loads(p.read_bytes())
        e=m['events']
        a=next(i for i,x in enumerate(e) if x['kind']=='translation_committed')
        b=next(i for i,x in enumerate(e) if x['kind']=='output_emitted')
        e[a],e[b]=e[b],e[a]
        for i,x in enumerate(e):x['seq']=i
        p.write_text(json.dumps(m),encoding='utf-8')
        bad=self.cli('check-origin-v2')
        self.assertEqual(bad.returncode,4)
        self.assertEqual(bad.stdout,'')

    def test_source_and_output_byte_mutations_denied(self):
        self.assertEqual(self.cli('generate-origin-v2').returncode,3)
        source=self.path/'source.dol'
        data=source.read_bytes()
        source.write_bytes(data[:-1]+bytes([data[-1]^1]))
        self.assertEqual(self.cli('check-origin-v2').returncode,4)
        source.write_bytes(data)
        f=next((self.path/'outputs-v2').iterdir())
        f.write_bytes(f.read_bytes()+b' altered')
        self.assertEqual(self.cli('check-origin-v2').returncode,4)

    def test_extra_file_and_output_symlink_denied(self):
        self.assertEqual(self.cli('generate-origin-v2').returncode,3)
        output=self.path/'outputs-v2'
        extra=output/'surprise.cpp'
        extra.write_text('not inventoried')
        self.assertEqual(self.cli('check-origin-v2').returncode,4)
        extra.unlink()
        file=next(output.iterdir())
        file.unlink()
        file.symlink_to(self.path/'metadata-v2.json')
        self.assertEqual(self.cli('check-origin-v2').returncode,4)

    def test_v2_no_overwrite_existing_folder(self):
        self.assertEqual(self.cli('generate-origin-v2').returncode,3)
        a=self.cli('generate-origin-v2')
        self.assertEqual(a.returncode,4)
        self.assertTrue((self.path/'origin-v2.json').exists())


if __name__=='__main__':unittest.main()
