"""Phase20 actual NEW Docker standalone Wasm file provenance and malicious swaps."""
from hashlib import sha256
import json,os,shutil,subprocess,tempfile,unittest
from pathlib import Path

from scripts.phase20.luigi.pipeline import create_package,verify_package,source_test_commit
from scripts.phase20.luigi.rebuild import rebuild_and_compare
from scripts.phase20.luigi.abi import source_inputs

ROOT=Path(__file__).resolve().parents[3]
def h(b):return sha256(b).hexdigest()


class PhysicalNewWasm(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix='luigi-p20-real-wasm-')
        cls.pkg=Path(cls.tmp.name)/'packet'
        cls.report=create_package(cls.pkg)
        cls.sha=cls.report['manifestSha256']
        cls.nonce=cls.report['runNonce']
        cls.wasm=cls.report['wasmSha256']

    @classmethod
    def tearDownClass(cls):cls.tmp.cleanup()

    def copy(self):
        t=tempfile.TemporaryDirectory(prefix='luigi-p20-adversarial-')
        self.addCleanup(t.cleanup)
        p=Path(t.name)/'artifact'
        shutil.copytree(self.pkg,p,symlinks=True)
        return p

    def repin(self,p):
        return h((p/'manifest.json').read_bytes())

    def rehash(self,p,name):
        m=json.loads((p/'manifest.json').read_bytes())
        data=(p/name).read_bytes()
        m['files'][name]={'sha256':h(data),'bytes':len(data)}
        (p/'manifest.json').write_text(json.dumps(m))

    def verify(self,p=None,sha=None,nonce=None,wasm=None):
        return verify_package(p or self.pkg,sha or self.sha,
                              nonce or self.nonce,wasm or self.wasm)

    def test_real_new_docker_and_native_node_run_source_vectors(self):
        r=self.verify()
        self.assertEqual(r['status'],'P20_INVENTED_CXX_TO_WASM_VERIFIED_STOP')
        self.assertEqual(r['nativeOracleVectors'],36)
        self.assertEqual(r['wasmOracleChecks'],180)
        self.assertEqual(r['fileCount'],11)
        self.assertFalse(r['producerAttested'])
        self.assertFalse(r['realW03SchedulerInvoked'])

    def test_actual_new_wasm_reproduces_byte_identical_second_compiler(self):
        result=rebuild_and_compare(self.pkg,self.wasm)
        self.assertEqual(result['wasmSha256'],self.wasm)
        self.assertFalse(result['authenticReleaseEligible'])

    def test_real_chromium_executes_same_physical_wasm_and_oracle(self):
        from scripts.phase20.luigi.pipeline import source_test_commit
        with tempfile.TemporaryDirectory(prefix='luigi-p20-browser-') as tmp:
            commit=Path(tmp)/'commit.json'
            commit.write_text(json.dumps(source_test_commit(
                source_inputs()[0],(self.pkg/'wasm/leaf.wasm').read_bytes())))
            env=os.environ.copy()
            env.pop('LD_LIBRARY_PATH',None);env.pop('LD_PRELOAD',None)
            env['NSMB_BROWSER']='/home/marcos/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome'
            env['NSMB_BROWSER_NO_SANDBOX']='1'
            p=subprocess.run(['node',str(ROOT/'scripts/phase20/luigi/verify_browser.mjs'),
                 '--wasm',str(self.pkg/'wasm/leaf.wasm'),'--commit',str(commit)],
                 env=env,capture_output=True,text=True,timeout=52)
        self.assertEqual(p.returncode,0,p.stderr[-1800:])
        result=json.loads(p.stdout)
        self.assertEqual(result['sha'],self.wasm)
        self.assertEqual(result['checks'],180)
        self.assertFalse(result['realW03SchedulerInvoked'])

    def test_wrong_externally_pinned_manifest_or_nonce_denied(self):
        with self.assertRaisesRegex(ValueError,'manifest independently'):
            self.verify(sha='0'*64)
        with self.assertRaisesRegex(ValueError,'nonce replay'):
            self.verify(nonce='0'*32)

    def test_wrong_independent_wasm_sha_denied(self):
        with self.assertRaisesRegex(ValueError,'independent expected'):
            self.verify(wasm='1'*64)

    def test_self_rehashed_compiled_cpp_tamper_denied(self):
        p=self.copy()
        cpp=p/'leaf/toy_leaf_generated.cpp'
        cpp.write_bytes(cpp.read_bytes().replace(b'value+=',b'value-='))
        self.rehash(p,'leaf/toy_leaf_generated.cpp')
        with self.assertRaisesRegex(ValueError,r'C\+\+|byte replay'):
            self.verify(p,sha=self.repin(p))

    def test_modified_source_even_with_rehash_denied(self):
        p=self.copy()
        source=p/'leaf/source.dol';b=bytearray(source.read_bytes());b[-1]^=1
        source.write_bytes(b)
        self.rehash(p,'leaf/source.dol')
        with self.assertRaisesRegex(ValueError,'source-to-emitted'):
            self.verify(p,sha=self.repin(p))

    def test_post_build_wasm_swap_with_self_rehashed_claim_denied(self):
        p=self.copy()
        wasm=p/'wasm/leaf.wasm';b=bytearray(wasm.read_bytes());b[60]^=1
        wasm.write_bytes(b)
        self.rehash(p,'wasm/leaf.wasm')
        with self.assertRaisesRegex(ValueError,'independent expected'):
            self.verify(p,sha=self.repin(p))

    def test_native_binary_swap_denied_even_if_rehashed(self):
        p=self.copy()
        binary=p/'native/leaf_native';binary.write_bytes(Path('/bin/true').read_bytes())
        binary.chmod(0o755)
        self.rehash(p,'native/leaf_native')
        with self.assertRaisesRegex(ValueError,'real native'):
            self.verify(p,sha=self.repin(p))

    def test_forged_authentic_flag_and_schema_rejected(self):
        p=self.copy()
        m=json.loads((p/'manifest.json').read_bytes())
        m['authenticReleaseEligible']=True
        (p/'manifest.json').write_text(json.dumps(m))
        with self.assertRaisesRegex(ValueError,'forged W03'):
            self.verify(p,sha=self.repin(p))
        m['authenticReleaseEligible']=False;m['version']=2
        (p/'manifest.json').write_text(json.dumps(m))
        with self.assertRaisesRegex(ValueError,'schema'):
            self.verify(p,sha=self.repin(p))

    def test_symlink_directory_extra_file_missing_file_denied(self):
        p=self.copy()
        (p/'leaf/new.cpp').write_bytes(b'forged')
        with self.assertRaisesRegex(ValueError,'extra/missing'):
            self.verify(p)
        (p/'leaf/new.cpp').unlink()
        (p/'leaf/toy_leaf_abi.hpp').unlink()
        with self.assertRaises(ValueError):self.verify(p)
        shutil.rmtree(p/'leaf')
        (p/'leaf').symlink_to(self.pkg/'leaf',target_is_directory=True)
        with self.assertRaisesRegex(ValueError,'symlink'):
            self.verify(p)

    def test_forged_node_or_browser_js_pin_denied(self):
        original=json.loads((self.pkg/'manifest.json').read_text())
        for key in ('scripts/phase20/luigi/verify_wasm.mjs',
                    'scripts/phase20/luigi/verify_browser.mjs'):
            p=self.copy()
            m=json.loads((p/'manifest.json').read_text())
            self.assertEqual(m['codePins'][key],original['codePins'][key])
            m['codePins'][key]='0'*64
            (p/'manifest.json').write_text(json.dumps(m))
            with self.assertRaisesRegex(ValueError,'producer/JS/oracle'):
                self.verify(p,sha=self.repin(p))

    def test_forged_abi_or_compiler_image_denied(self):
        p=self.copy()
        m=json.loads((p/'manifest.json').read_bytes())
        m['abi']['imports']=1
        (p/'manifest.json').write_text(json.dumps(m))
        with self.assertRaisesRegex(ValueError,'ABI'):
            self.verify(p,sha=self.repin(p))
        m['abi']['imports']=0;m['compiler']['imageDigest']='sha256:'+'f'*64
        (p/'manifest.json').write_text(json.dumps(m))
        with self.assertRaisesRegex(ValueError,'Docker build'):
            self.verify(p,sha=self.repin(p))


if __name__=='__main__':unittest.main()
