"""Entire W16 provenance suite is newly invented and synthetic."""
from dataclasses import replace
import json
import unittest
from scripts.phase16.luigi.fixtures import ROOT,WALK,SEED,MAP_BYTES,CONFIG_BYTES,fixture,encode
from scripts.phase16.luigi.sidecar import verify,digest


class VersionedSyntheticEvidence(unittest.TestCase):
    def setUp(self):
        self.manifest,self.metadata,self.anchors=fixture()

    def check(self,manifest=None,metadata=None,anchors=None,resealed=True,map_bytes=MAP_BYTES,config_bytes=CONFIG_BYTES):
        m=self.manifest if manifest is None else manifest
        wire=encode(m)
        data=self.metadata if metadata is None else metadata
        trusted=self.anchors if anchors is None else anchors
        if resealed:
            trusted=replace(trusted,sidecar_sha256=digest(wire),
                            metadata_sha256=digest(data))
        return verify(wire,data,trusted,map_bytes=map_bytes,config_bytes=config_bytes)

    def deny(self,fragment,**kw):
        with self.assertRaisesRegex(ValueError,fragment):
            self.check(**kw)

    def test_valid_recursive_and_speculative_map_are_structurally_consistent(self):
        v=self.check()
        self.assertEqual((v.translated_count,v.recursive_count,
                          v.map_skipped_count,v.speculative_descendants_skipped),(5,3,1,1))
        self.assertTrue(v.byte_integrity_pinned)
        self.assertTrue(v.quality_clean)
        self.assertFalse(v.producer_attested)
        self.assertFalse(v.authentic_release_eligible)

    def test_unpinned_manifest_tamper_denied(self):
        wire=encode(self.manifest).replace(b'"version":1',b'"version":2')
        with self.assertRaisesRegex(ValueError,'bytes changed'):
            verify(wire,self.metadata,self.anchors,map_bytes=MAP_BYTES,config_bytes=CONFIG_BYTES)

    def test_resealed_manifest_still_never_authenticates(self):
        m=dict(self.manifest);m["runId"]="1234567890abcdef1234567890abcdef"
        v=self.check(manifest=m,anchors=replace(self.anchors,run_id=m["runId"]))
        self.assertFalse(v.producer_attested)
        self.assertFalse(v.authentic_release_eligible)

    def test_mutated_metadata_without_anchor_update_rejected(self):
        with self.assertRaisesRegex(ValueError,'bytes changed'):
            verify(encode(self.manifest),self.metadata+b' ',self.anchors,map_bytes=MAP_BYTES,config_bytes=CONFIG_BYTES)

    def test_mutated_metadata_after_repin_still_not_bound(self):
        obj=json.loads(self.metadata);obj["functions"][0]["sha256"]="0"*64
        self.deny('metadata binding mismatch',metadata=encode(obj))

    def test_source_identity_swapped_denied(self):
        m=dict(self.manifest);m["sourceSha256"]=digest(b"other invented DOL")
        self.deny('source identity mismatch',manifest=m)
        self.deny('source identity mismatch',anchors=replace(self.anchors,source_sha256=digest(b"other")))

    def test_root_or_run_id_mismatch_rejected(self):
        m=dict(self.manifest);m["root"]=WALK
        self.deny('root identity mismatch',manifest=m)
        self.deny('root identity mismatch',anchors=replace(self.anchors,root=WALK))
        self.deny('run identity',anchors=replace(self.anchors,run_id="0"*32))

    def test_forged_producer_identity_denied(self):
        m=dict(self.manifest);m["producerCommit"]="0"*40
        self.deny('producer commit',manifest=m)
        m=dict(self.manifest);m["producerAttested"]=True
        self.deny('incorrect schema',manifest=m)

    def test_root_walk_can_promote_undispatched_map_seed(self):
        # Public C# walks configured root first. MAP roots are only used as
        # speculative queue seeds IF still unvisited when that queue is drained.
        m=json.loads(encode(self.manifest))
        ix=next(i for i,e in enumerate(m["events"])
                if e["kind"]=="emit" and e["address"]==SEED)
        m["events"].insert(ix,{"kind":"discover","address":SEED,"parent":WALK})
        for idx,event in enumerate(m["events"]):event["seq"]=idx
        v=self.check(manifest=m)
        self.assertEqual(v.recursive_count,4)
        self.assertFalse(v.producer_attested)

    def test_anchor_map_and_config_are_independent(self):
        for field,anchor,reason in (
            ("configSha256","config_sha256","config evidence mismatch"),
            ("mapSha256","map_sha256","MAP evidence mismatch")):
            with self.subTest(field=field):
                m=dict(self.manifest);m[field]=digest(b"other")
                self.deny(reason,manifest=m)
                self.deny("pinned hashes",anchors=replace(self.anchors,**{anchor:digest(b"other")}))

    def test_map_file_tamper_denied_by_pinned_bytes(self):
        self.deny("pinned hashes",map_bytes=MAP_BYTES+b" altered")
        self.deny("pinned hashes",config_bytes=CONFIG_BYTES+b" altered")

    def test_actual_map_inventory_checked_even_if_dishonestly_repinned(self):
        bad_map=MAP_BYTES.replace(b"80004400",b"80004404")
        m=dict(self.manifest)
        m["mapSha256"]=digest(bad_map)
        a=replace(self.anchors,map_sha256=digest(bad_map))
        self.deny("MAP inventory not actually present",manifest=m,anchors=a,map_bytes=bad_map)

    def test_executable_range_forgery_and_outside_address_denied(self):
        m=dict(self.manifest);m["executableRanges"]=[{"start":ROOT,"end":ROOT+4}]
        self.deny('section ranges',manifest=m)
        m=json.loads(encode(self.manifest))
        m["events"][8]["address"]=0x90000000
        self.deny('outside executable',manifest=m)

    def test_duplicate_map_seed_and_unresolved_outcomes_denied(self):
        m=dict(self.manifest);m["mapSeeds"]=[SEED,SEED,0x80004500]
        self.deny('duplicate MAP seeds',manifest=m)
        m=dict(self.manifest);m["events"]=m["events"][:-1]
        self.deny('pending attempts',manifest=m)

    def test_skip_of_required_root_fails_closed(self):
        m=json.loads(encode(self.manifest))
        i=next(i for i,e in enumerate(m["events"]) if e["kind"]=="emit" and e["address"]==ROOT)
        m["events"][i]={"seq":i,"kind":"skip","address":ROOT,"reason":"decode_error"}
        self.deny('non-speculative',manifest=m)

    def test_uncommitted_discovery_parent_denied(self):
        m=json.loads(encode(self.manifest))
        m["events"][4]={"seq":4,"kind":"discover","address":WALK,"parent":ROOT}
        self.deny('uncommitted discovery',manifest=m)

    def test_duplicate_emission_denied(self):
        m=json.loads(encode(self.manifest))
        m["events"].append({"seq":len(m["events"]),"kind":"emit","address":ROOT,"outputSha256":"0"*64})
        self.deny('duplicate',manifest=m)

    def test_unknown_version_event_kind_and_sequence_denied(self):
        m=dict(self.manifest);m["version"]=2
        self.deny('unknown producer-sidecar schema',manifest=m)
        m=json.loads(encode(self.manifest));m["events"][-1]["kind"]="attest"
        self.deny('unrecognized',manifest=m)
        m=json.loads(encode(self.manifest));m["events"][-1]["seq"]=100
        self.deny('sequence',manifest=m)
    def test_output_hash_modified_after_repin_denied(self):
        m=json.loads(encode(self.manifest))
        i=next(i for i,e in enumerate(m["events"]) if e["kind"]=="emit")
        m["events"][i]["outputSha256"]="0"*64
        self.deny('emission hash differs',manifest=m)

    def test_orphan_metadata_function_denied(self):
        obj=json.loads(self.metadata)
        obj["functions"].append({"entryPoint":0x80004700,"relativePath":"orphan.cpp","sha256":"0"*64})
        m=dict(self.manifest)
        data=encode(obj);m["metadataSha256"]=digest(data)
        self.deny('emissions do not match metadata',manifest=m,metadata=data)

    def test_schema_valid_bad_quality_is_not_release_eligible(self):
        obj=json.loads(self.metadata)
        obj["quality"]["unsupportedInstructionCount"]=2
        data=encode(obj);m=dict(self.manifest);m["metadataSha256"]=digest(data)
        result=self.check(manifest=m,metadata=data)
        self.assertFalse(result.quality_clean)
        self.assertFalse(result.authentic_release_eligible)

    def test_metadata_bool_text_duplicate_overflow_addresses_denied(self):
        for addr in (-1,2**32,True,str(ROOT),ROOT):
            with self.subTest(address=addr):
                obj=json.loads(self.metadata)
                obj["functions"][1]["entryPoint"]=addr
                data=encode(obj);m=dict(self.manifest);m["metadataSha256"]=digest(data)
                self.deny('entryPoint|Repeated translation',manifest=m,metadata=data)

    def test_unsafe_output_paths_denied(self):
        for path in ("../private.cpp","/private.cpp","dir/../private.cpp","folder\\evil.cpp",""):
            with self.subTest(path=path):
                obj=json.loads(self.metadata);obj["functions"][0]["relativePath"]=path
                data=encode(obj);m=dict(self.manifest);m["metadataSha256"]=digest(data)
                self.deny('unsafe or missing output',manifest=m,metadata=data)

    def test_duplicate_json_key_after_unicode_decoding_denied(self):
        original=b'"root":2147500032'
        self.assertIn(original,encode(self.manifest))
        wire=encode(self.manifest).replace(original,b'"root":2147500032,"r\\u006fot":2147500032')
        anchors=replace(self.anchors,sidecar_sha256=digest(wire))
        with self.assertRaisesRegex(ValueError,'Duplicate'):
            verify(wire,self.metadata,anchors,map_bytes=MAP_BYTES,config_bytes=CONFIG_BYTES)

    def test_missing_metadata_sha_and_bad_function_digest_denied(self):
        obj=json.loads(self.metadata);del obj["functions"][1]["sha256"]
        data=encode(obj);m=dict(self.manifest);m["metadataSha256"]=digest(data)
        self.deny('missing function output',manifest=m,metadata=data)
        obj=json.loads(self.metadata);obj["functions"][1]["sha256"]="bad"
        data=encode(obj);m=dict(self.manifest);m["metadataSha256"]=digest(data)
        self.deny('invalid sha256',manifest=m,metadata=data)

    def test_extra_unknown_event_key_and_duplicate_discovery_denied(self):
        m=json.loads(encode(self.manifest));m["events"][0]["producerAttested"]=True
        self.deny('incorrect schema',manifest=m)
        m=json.loads(encode(self.manifest))
        m["events"].append({"seq":len(m["events"]),"kind":"discover","address":WALK,"parent":ROOT})
        self.deny('duplicate.*target',manifest=m)

    def test_skipping_committed_work_rejected(self):
        m=json.loads(encode(self.manifest))
        m["events"].append({"seq":len(m["events"]),"kind":"skip","address":SEED,"reason":"lift_error"})
        self.deny('duplicate skip',manifest=m)

    def test_negative_identity_anchors_all_have_correct_syntax(self):
        for field in ("sidecar_sha256","metadata_sha256","source_sha256","config_sha256","map_sha256"):
            with self.subTest(field=field):
                self.deny('invalid sha256',anchors=replace(self.anchors,**{field:"Z"*64}),resealed=False)

if __name__=="__main__":
    unittest.main()
