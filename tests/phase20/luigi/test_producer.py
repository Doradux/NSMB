"""Source-to-emitted C++ witness negative tests; all input invented."""
import json
from hashlib import sha256
from pathlib import Path
import subprocess,sys,tempfile,unittest

from scripts.phase20.luigi.producer import expected_files
from scripts.phase20.luigi.witness import verify
ROOT=Path(__file__).resolve().parents[3]
def h(b):return sha256(b).hexdigest()


class OriginWitness(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='luigi-p20-origin-')
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'package'
        self.nonce='f'*32
        p=subprocess.run([sys.executable,'-B','-m','scripts.phase20.luigi.producer',
             '--directory',str(self.root),'--nonce',self.nonce],
             cwd=ROOT,capture_output=True,timeout=9)
        self.assertEqual(p.returncode,3,p.stderr)
        self.event=p.stdout
        self.expected=expected_files()
        self.cppsha=h(self.expected['toy_leaf_generated.cpp'])

    def check(self,event=None,nonce=None,sha=None):
        return verify(self.root,self.event if event is None else event,
          self.nonce if nonce is None else nonce,
          self.cppsha if sha is None else sha)

    def test_child_emits_source_pinned_six_files(self):
        r=self.check()
        self.assertEqual(r['fileCount'],6)
        self.assertEqual(r['cppSha256'],self.cppsha)
        self.assertFalse(r['producerAttested'])

    def test_checked_in_generated_cpp_exact_reproduction(self):
        for n in ('toy_leaf_abi.hpp','toy_leaf_generated.cpp','leaf_metadata.json'):
            self.assertEqual((ROOT/'scripts/phase20/luigi'/n).read_bytes(),self.expected[n])
        m=json.loads(self.expected['leaf_metadata.json'])
        self.assertEqual(m['functionGraph']['0000'],[32,224])

    def test_incomplete_emission_and_duplicate_json_denied(self):
        for raw in (self.event[:-1],self.event[:-7],
                    self.event+b'{}\n',
                    self.event.replace(b'"seq":0',b'"seq":0,"s\\u0065q":0',1)):
            with self.subTest(size=len(raw)):
                with self.assertRaises(ValueError):self.check(event=raw)

    def test_fake_authority_and_nonce_replay_denied(self):
        with self.assertRaisesRegex(ValueError,'replayed'):
            self.check(nonce='0'*32)
        e=json.loads(self.event);e['producerAttested']=True
        with self.assertRaisesRegex(ValueError,'forged'):
            self.check(event=(json.dumps(e)+'\n').encode())

    def test_post_emission_cpp_modification_plus_rehash_denied(self):
        p=self.root/'toy_leaf_generated.cpp'
        p.write_bytes(p.read_bytes().replace(b'value+=',b'value-='))
        e=json.loads(self.event)
        e['files'][p.name]={'sha256':h(p.read_bytes()),'bytes':p.stat().st_size}
        with self.assertRaisesRegex(ValueError,'retranslation'):
            self.check(event=(json.dumps(e)+'\n').encode())

    def test_forged_source_and_rehashed_event_denied(self):
        p=self.root/'source.dol'
        b=bytearray(p.read_bytes());b[-1]^=1;p.write_bytes(b)
        e=json.loads(self.event)
        e['files'][p.name]={'sha256':h(b),'bytes':len(b)}
        with self.assertRaisesRegex(ValueError,'retranslation'):
            self.check(event=(json.dumps(e)+'\n').encode())

    def test_extra_symlink_missing_files_denied(self):
        p=self.root/'untracked.cpp';p.write_bytes(b'forged')
        with self.assertRaises(ValueError):self.check()
        p.unlink()
        p=self.root/'toy_leaf_generated.cpp'
        p.unlink()
        with self.assertRaises(ValueError):self.check()
        p.symlink_to(ROOT/'scripts/phase20/luigi/toy_leaf_generated.cpp')
        with self.assertRaises(ValueError):self.check()

    def test_wrong_external_cpp_sha_denied(self):
        with self.assertRaisesRegex(ValueError,'pinned'):
            self.check(sha='0'*64)

    def test_invalid_schema_version_or_inventory_denied(self):
        for change in ({'version':2},{'extraGrant':True},{'format':'forged'}):
            e=json.loads(self.event);e.update(change)
            with self.assertRaises(ValueError):
                self.check(event=(json.dumps(e)+'\n').encode())
        e=json.loads(self.event);del e['files']['source.dol']
        with self.assertRaises(ValueError):
            self.check(event=(json.dumps(e)+'\n').encode())

    def test_existing_dir_rejected_without_overwrite(self):
        p=subprocess.run([sys.executable,'-B','-m','scripts.phase20.luigi.producer',
             '--directory',str(self.root),'--nonce',self.nonce],
             cwd=ROOT,capture_output=True,timeout=9)
        self.assertEqual(p.returncode,4)
        self.assertEqual(p.stdout,b'')


if __name__=='__main__':unittest.main()
