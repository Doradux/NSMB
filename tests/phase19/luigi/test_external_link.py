"""Read-only hash-and-ABI linkage of Mario's genuinely NEW Wasm artifact.

Does not represent a guest clock invocation. Peach's functional proof is
a distinct obligation and must match exact physical Wasm bytes.
"""
from __future__ import annotations
from hashlib import sha256
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from scripts.phase19.luigi.external import verify_public_wasm_link

ROOT=Path(__file__).resolve().parents[3]
MARIO=Path('/tmp/nsmb-p19-mario-build2-rcF03H')
HEAD='62553f2c73a3bea271f1a7b75519737180c99a74'
WASM='0d0e68d38ee36840fb86a177dfc930988dc9c8c61c2595e5e3c9eda11bc8e8d1'


class PublicBuiltArtifact(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not (MARIO/'phase18_artifact_manifest.json').is_file():
            raise unittest.SkipTest('Mario temporary source Wasm artifact no longer retained')
        # NOT current Luigi HEAD: Mario compiled from exact 62553f2.
        # Export source files from that immutable Git commit by git show,
        # never mutate main, peer worktrees, or checked-out public files.
        cls.source_tmp=tempfile.TemporaryDirectory(prefix='luigi-p19-source-archive-')
        cls.source=Path(cls.source_tmp.name)
        source_list=json.loads((MARIO/'phase18_artifact_manifest.json').read_text())['files']
        for relative in source_list:
            result=subprocess.run(['git','show',HEAD+':'+relative],cwd=ROOT,
                                  capture_output=True,check=True,timeout=10)
            path=cls.source/relative
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_bytes(result.stdout)

    @classmethod
    def tearDownClass(cls):
        cls.source_tmp.cleanup()

    def copy_artifact(self):
        tmp=tempfile.TemporaryDirectory(prefix='luigi-p19-external-artifact-')
        self.addCleanup(tmp.cleanup)
        folder=Path(tmp.name)/'artifact'
        shutil.copytree(MARIO,folder,symlinks=True)
        return folder

    def test_real_mario_new_public_wasm_source_hash_and_import_export_abi(self):
        result=verify_public_wasm_link(self.source,MARIO,
            expected_git_sha=HEAD,expected_wasm_sha=WASM)
        self.assertEqual(result['wasmSha256'],WASM)
        self.assertEqual(result['sourceFileCount'],12)
        self.assertFalse(result['guestCpuClockActuallyInvoked'])
        self.assertFalse(result['producerAttested'])

    def test_different_compiled_sha_with_valid_original_manifest_denied(self):
        with self.assertRaisesRegex(ValueError,'Wasm/MJS'):
            verify_public_wasm_link(self.source,MARIO,
                expected_git_sha=HEAD,expected_wasm_sha='0'*64)

    def test_post_build_wasm_swap_with_matching_self_manifest_still_denied(self):
        path=self.copy_artifact()
        wasm=path/'frame_loop.wasm'
        b=bytearray(wasm.read_bytes());b[100]^=1
        wasm.write_bytes(b)
        manifest=path/'phase18_artifact_manifest.json'
        data=json.loads(manifest.read_bytes())
        data['outputs']['frame_loop.wasm']=sha256(b).hexdigest()
        manifest.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,'independently pinned digest'):
            verify_public_wasm_link(self.source,path,expected_git_sha=HEAD,expected_wasm_sha=WASM)

    def test_mjs_swap_refused_even_though_wasm_identical(self):
        path=self.copy_artifact()
        script=path/'frame_loop.mjs'
        script.write_bytes(script.read_bytes()+b'//code changed')
        with self.assertRaisesRegex(ValueError,'physical bytes'):
            verify_public_wasm_link(self.source,path,expected_git_sha=HEAD,expected_wasm_sha=WASM)

    def test_unknown_abi_import_or_export_claim_denied(self):
        path=self.copy_artifact()
        manifest=path/'phase18_artifact_manifest.json'
        data=json.loads(manifest.read_text())
        data['imports'].append({'module':'env','name':'arbitrary_hle','kind':'function'})
        manifest.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,'ABI imports/exports'):
            verify_public_wasm_link(self.source,path,expected_git_sha=HEAD,expected_wasm_sha=WASM)

    def test_symlink_artifact_denied(self):
        path=self.copy_artifact()
        wasm=path/'frame_loop.wasm'
        wasm.unlink()
        wasm.symlink_to(MARIO/'frame_loop.wasm')
        with self.assertRaisesRegex(ValueError,'symlink'):
            verify_public_wasm_link(self.source,path,expected_git_sha=HEAD,expected_wasm_sha=WASM)

    def test_invalid_sha_git_or_manifest_version_denied(self):
        with self.assertRaisesRegex(ValueError,'SHA arguments'):
            verify_public_wasm_link(self.source,MARIO,expected_git_sha='abc',expected_wasm_sha=WASM)
        path=self.copy_artifact()
        manifest=path/'phase18_artifact_manifest.json'
        data=json.loads(manifest.read_text());data['schema']='future-untrusted-v8'
        manifest.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,'schema|supported'):
            verify_public_wasm_link(self.source,path,expected_git_sha=HEAD,expected_wasm_sha=WASM)


if __name__=='__main__':unittest.main()
