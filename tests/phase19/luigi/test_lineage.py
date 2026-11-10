"""Real new Docker Emscripten Wasm built from only invented PPC toy C++."""
from __future__ import annotations
from hashlib import sha256
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from scripts.phase19.luigi.model import source_inputs,reference_run,render_cpp
from scripts.phase19.luigi.pipeline import create_package
from scripts.phase19.luigi.lineage import verify_package,FILES,VECTORS

ROOT=Path(__file__).resolve().parents[3]
def digest(data):return sha256(data).hexdigest()


class PhysicalArtifactLineage(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix="luigi-phase19-tests-")
        cls.folder=Path(cls.temp.name)/"base"
        cls.report=create_package(cls.folder)
        cls.manifest_sha=cls.report["manifestSha256"]
        cls.nonce=cls.report["runNonce"]
        cls.wasm_sha=cls.report["wasmSha256"]

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def copy(self):
        t=tempfile.TemporaryDirectory(prefix="luigi-phase19-mutant-")
        self.addCleanup(t.cleanup)
        root=Path(t.name)/"mutated"
        shutil.copytree(self.folder,root,symlinks=True)
        return root

    def verify(self,path=None,manifest_sha=None,nonce=None,wasm_sha=None):
        return verify_package(path or self.folder,
            manifest_sha or self.manifest_sha,
            expected_nonce=nonce or self.nonce,
            expected_wasm_sha=wasm_sha or self.wasm_sha)

    def repin(self,path):
        return digest((path/"manifest.json").read_bytes())

    def rehash(self,path,relative):
        m=json.loads((path/"manifest.json").read_bytes())
        actual=(path/relative).read_bytes()
        m["files"][relative]={"sha256":digest(actual),"bytes":len(actual)}
        (path/"manifest.json").write_text(json.dumps(m,sort_keys=True,
                                      separators=(",",":")))

    def test_full_multifile_executable_wasm_verified(self):
        result=self.verify()
        self.assertEqual(result["status"],"INVENTED_MULTIFILE_CHAIN_VERIFIED_STOP")
        self.assertEqual(result["fileCount"],len(FILES))
        self.assertFalse(result["producerAttested"])
        self.assertFalse(result["authenticReleaseEligible"])
        self.assertEqual(len(VECTORS),24)

    def test_guest_oracle_three_guests_and_skipped_leaf(self):
        s,m,c=source_inputs()
        self.assertEqual(reference_run(s,m,c,0,100),118)
        self.assertEqual(reference_run(s,m,c,0x40,100),110)
        self.assertEqual(reference_run(s,m,c,0x20,100),102)
        self.assertEqual(reference_run(s,m,c,0xA0,100),0xFFFFFFFF)
        self.assertEqual(reference_run(s,m,c,0x300,100),0xFFFFFFFF)

    def test_cpp_is_real_code_compiled_not_comments_only(self):
        b=(self.folder/"generated/invented_guest.cpp").read_bytes()
        self.assertEqual(b,render_cpp(*source_inputs()))
        self.assertIn(b'extern "C" uint32_t nsmb_toy_execute',b)
        self.assertTrue((self.folder/"native/toy_native").is_file())
        self.assertTrue((self.folder/"wasm/invented_guest.wasm").is_file())

    def test_missing_external_manifest_commitment_rejected(self):
        with self.assertRaisesRegex(ValueError,"manifest"):
            verify_package(self.folder,"0"*64)
        with self.assertRaisesRegex(ValueError,"external manifest"):
            verify_package(self.folder,"invalid")

    def test_wrong_external_wasm_digest_denied_even_with_intact_manifest(self):
        with self.assertRaisesRegex(ValueError,"compiled wasm differs"):
            self.verify(wasm_sha="0"*64)

    def test_nonce_replay_denied_with_new_external_challenge(self):
        with self.assertRaisesRegex(ValueError,"replay"):
            self.verify(nonce="1"*32)

    def test_forged_producer_authority_with_rehashed_manifest_denied(self):
        path=self.copy()
        m=json.loads((path/"manifest.json").read_bytes())
        m["provenance"]["producerAttested"]=True
        (path/"manifest.json").write_text(json.dumps(m))
        with self.assertRaisesRegex(ValueError,"forged authentic"):
            self.verify(path,manifest_sha=self.repin(path))

    def test_missing_cpp_or_extra_file_denied(self):
        path=self.copy()
        (path/"generated/invented_guest.cpp").unlink()
        with self.assertRaises(ValueError):self.verify(path)
        shutil.copy2(self.folder/"generated/invented_guest.cpp",
                     path/"generated/invented_guest.cpp")
        (path/"generated/extra.cpp").write_bytes(b"uninvited")
        with self.assertRaisesRegex(ValueError,"unexpected"):
            self.verify(path)

    def test_cpp_symlink_and_parent_folder_symlink_denied(self):
        path=self.copy()
        cpp=path/"generated/invented_guest.cpp"
        cpp.unlink()
        cpp.symlink_to(self.folder/"generated/invented_guest.cpp")
        with self.assertRaisesRegex(ValueError,"symlink"):
            self.verify(path)
        cpp.unlink()
        shutil.copy2(self.folder/"generated/invented_guest.cpp",cpp)
        shutil.rmtree(path/"generated")
        (path/"generated").symlink_to(self.folder/"generated",target_is_directory=True)
        with self.assertRaisesRegex(ValueError,"symlink"):
            self.verify(path)

    def test_forged_cpp_even_if_manifest_rehashed_denied(self):
        path=self.copy()
        cpp=path/"generated/invented_guest.cpp"
        cpp.write_bytes(cpp.read_bytes().replace(b'+static_cast<uint32_t>(imm)',b'-static_cast<uint32_t>(imm)'))
        self.rehash(path,"generated/invented_guest.cpp")
        with self.assertRaisesRegex(ValueError,r"generated|compiled C\+\+|emitted"):
            self.verify(path,manifest_sha=self.repin(path))

    def test_wasm_tamper_denied(self):
        path=self.copy()
        wasm=path/"wasm/invented_guest.wasm"
        body=bytearray(wasm.read_bytes());body[60]^=0x40;wasm.write_bytes(body)
        self.rehash(path,"wasm/invented_guest.wasm")
        with self.assertRaisesRegex(ValueError,"compiled wasm differs"):
            self.verify(path,manifest_sha=self.repin(path))

    def test_swap_with_different_real_wasm_denied(self):
        mario=Path('/tmp/nsmb-p19-mario-build2-rcF03H/frame_loop.wasm')
        if not mario.is_file():self.skipTest('Mario temporary artifact not retained')
        path=self.copy()
        (path/"wasm/invented_guest.wasm").write_bytes(mario.read_bytes())
        self.rehash(path,"wasm/invented_guest.wasm")
        with self.assertRaisesRegex(ValueError,"compiled wasm differs"):
            self.verify(path,manifest_sha=self.repin(path))

    def test_changed_native_binary_even_if_self_repinned_denied(self):
        path=self.copy()
        native=path/"native/toy_native"
        # A different executable cannot become authentic by changing JSON.
        native.write_bytes(Path("/bin/true").read_bytes())
        native.chmod(0o755)
        self.rehash(path,"native/toy_native")
        with self.assertRaisesRegex(ValueError,"native executable"):
            self.verify(path,manifest_sha=self.repin(path))

    def test_corrupted_metadata_event_denied(self):
        path=self.copy()
        origin=path/"cpp_origin.json"
        origin.write_bytes(origin.read_bytes()[:-1])
        self.rehash(path,"cpp_origin.json")
        with self.assertRaisesRegex(ValueError,"completed event"):
            self.verify(path,manifest_sha=self.repin(path))

    def test_manifest_added_unrecognized_field_denied_even_with_repin(self):
        path=self.copy()
        m=json.loads((path/"manifest.json").read_bytes())
        m["producerAttested"]=True
        (path/"manifest.json").write_text(json.dumps(m))
        with self.assertRaisesRegex(ValueError,"unsupported lineage"):
            self.verify(path,manifest_sha=self.repin(path))

    def test_compiler_image_fraud_denied_even_with_repin(self):
        path=self.copy()
        m=json.loads((path/"manifest.json").read_bytes())
        m["compiler"]["imageDigest"]="sha256:"+"1"*64
        (path/"manifest.json").write_text(json.dumps(m))
        with self.assertRaisesRegex(ValueError,"compiler"):
            self.verify(path,manifest_sha=self.repin(path))

    def test_wrong_git_version_schema_denied(self):
        path=self.copy()
        m=json.loads((path/"manifest.json").read_bytes())
        m["git"]["head"]="unknown"
        (path/"manifest.json").write_text(json.dumps(m))
        with self.assertRaisesRegex(ValueError,"Git"):
            self.verify(path,manifest_sha=self.repin(path))
        m["git"]["head"]="f"*40
        m["version"]=2
        (path/"manifest.json").write_text(json.dumps(m))
        with self.assertRaisesRegex(ValueError,"unsupported lineage"):
            self.verify(path,manifest_sha=self.repin(path))

    def test_manifest_duplicate_unicode_json_key_denied(self):
        path=self.copy()
        manifest=path/"manifest.json"
        b=manifest.read_bytes()
        self.assertIn(b'"version":1',b)
        manifest.write_bytes(b.replace(b'"version":1',
            b'"version":1,"v\\u0065rsion":1',1))
        with self.assertRaises(ValueError):
            self.verify(path,manifest_sha=self.repin(path))

    def test_forged_source_and_all_self_repinned_hashes_denied(self):
        path=self.copy()
        source=path/"inputs/source.dol"
        b=bytearray(source.read_bytes());b[-1]^=1
        source.write_bytes(bytes(b))
        newsha=digest(b)
        self.rehash(path,"inputs/source.dol")
        pins=path/"pins.json"
        record=json.loads(pins.read_bytes());record["sourceSha256"]=newsha
        pins.write_text(json.dumps(record))
        self.rehash(path,"pins.json")
        origin=path/"cpp_origin.json"
        event=json.loads(origin.read_bytes());event["sourceSha256"]=newsha
        origin.write_text(json.dumps(event)+"\n")
        self.rehash(path,"cpp_origin.json")
        with self.assertRaisesRegex(ValueError,"invented-only|invented source"):
            self.verify(path,manifest_sha=self.repin(path))

    def test_output_cpp_truncated_event_denied(self):
        path=self.copy()
        origin=path/"cpp_origin.json"
        origin.write_bytes(origin.read_bytes()[:-4])
        self.rehash(path,"cpp_origin.json")
        with self.assertRaises(ValueError):
            self.verify(path,manifest_sha=self.repin(path))

    def test_duplicate_generated_cpp_event_json_key_denied(self):
        path=self.copy()
        origin=path/"cpp_origin.json"
        payload=origin.read_bytes()
        self.assertIn(b'"seq":0',payload)
        origin.write_bytes(payload.replace(b'"seq":0',
            b'"seq":0,"s\\u0065q":0',1))
        self.rehash(path,"cpp_origin.json")
        with self.assertRaises(ValueError):
            self.verify(path,manifest_sha=self.repin(path))

    def test_node_report_self_forged_denied(self):
        path=self.copy()
        node=path/"node.json"
        payload=json.loads(node.read_bytes())
        payload["caseCount"]=23
        node.write_text(json.dumps(payload))
        self.rehash(path,"node.json")
        with self.assertRaisesRegex(ValueError,"Node Wasm artifact"):
            self.verify(path,manifest_sha=self.repin(path))

    def test_wasm_abi_imports_forgery_denied(self):
        path=self.copy()
        m=json.loads((path/"manifest.json").read_bytes())
        m["abi"]["imports"]=["env.secretGuestPointer"]
        (path/"manifest.json").write_text(json.dumps(m))
        with self.assertRaisesRegex(ValueError,"ABI"):
            self.verify(path,manifest_sha=self.repin(path))

    def test_reused_producer_nonce_with_retied_event_is_denied(self):
        path=self.copy()
        newnonce="1"*32
        origin=path/"cpp_origin.json"
        event=json.loads(origin.read_bytes());event["runNonce"]=newnonce
        origin.write_text(json.dumps(event)+"\n")
        self.rehash(path,"cpp_origin.json")
        m=json.loads((path/"manifest.json").read_bytes());m["runNonce"]=newnonce
        (path/"manifest.json").write_text(json.dumps(m))
        with self.assertRaisesRegex(ValueError,"replay"):
            self.verify(path,manifest_sha=self.repin(path))

    def test_modified_source_code_pin_denied(self):
        path=self.copy()
        m=json.loads((path/"manifest.json").read_bytes())
        m["producerCodePins"]["toyEmitter"]="0"*64
        (path/"manifest.json").write_text(json.dumps(m))
        with self.assertRaisesRegex(ValueError,"producer/verifier"):
            self.verify(path,manifest_sha=self.repin(path))

    def test_extra_nested_hidden_file_denied(self):
        path=self.copy()
        (path/"inputs/.hidden").write_text("ignored input")
        with self.assertRaisesRegex(ValueError,"unexpected"):
            self.verify(path)

    def test_independent_second_compiler_rebuild_is_identical(self):
        from scripts.phase19.luigi.rebuild_check import rebuild_and_compare
        result=rebuild_and_compare(self.folder,self.wasm_sha)
        self.assertEqual(result["sha256"],self.wasm_sha)
        self.assertFalse(result["authenticReleaseEligible"])
