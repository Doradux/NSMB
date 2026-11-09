"""Forged origin/ordering negatives, entirely synthetic fixture evidence."""
from dataclasses import replace
import json
import unittest
from scripts.phase16.luigi.fixtures import encode
from scripts.phase16.luigi.sidecar import digest,verify
from scripts.phase17.luigi.producer import (
    BASE,OriginProducer,produce_demo,replace_word,
)
from scripts.phase17.luigi.replay import replay

class ForgedProducerEvidence(unittest.TestCase):
    def setUp(self):
        self.b=produce_demo()
        self.events=json.loads(self.b.sidecar)

    def repin(self,side,meta=None,source=None):
        meta=self.b.metadata if meta is None else meta
        source=self.b.source if source is None else source
        side['sourceSha256']=digest(source)
        side['metadataSha256']=digest(meta)
        raw=encode(side)
        anchors=replace(self.b.anchors,sidecar_sha256=digest(raw),
                        source_sha256=digest(source),metadata_sha256=digest(meta),
                        run_id=side['runId'])
        return dict(sidecar=raw,metadata=meta,source=source,map_bytes=self.b.map_bytes,
                    config=self.b.config,anchors=anchors,outputs=self.b.files)

    def test_reorder_two_commits_with_resequenced_fields_is_rejected(self):
        side=json.loads(self.b.sidecar)
        events=side['events']
        events[8],events[9]=events[9],events[8]
        for i,event in enumerate(events):event['seq']=i
        with self.assertRaises(ValueError):replay(**self.repin(side))

    def test_missing_recursive_edge_rejected(self):
        side=json.loads(self.b.sidecar)
        side['events']=[x for x in side['events'] if not (
            x['kind']=='discover' and x['address']==BASE+0x060)]
        for i,x in enumerate(side['events']):x['seq']=i
        with self.assertRaisesRegex(ValueError,'queued|emission|pending|source|discovery'):
            replay(**self.repin(side))

    def test_duplicate_emit_rejected(self):
        side=json.loads(self.b.sidecar)
        duplicate=dict(next(x for x in side['events'] if x['kind']=='emit'))
        duplicate['seq']=len(side['events'])
        side['events'].append(duplicate)
        with self.assertRaises(ValueError):replay(**self.repin(side))

    def test_source_sha_repin_without_causal_replay_is_not_enough(self):
        src=replace_word(self.b.source,BASE+0x020,0xFFFFFFFF)
        side=json.loads(self.b.sidecar)
        # Even a syntactically valid MANIFEST+PIN cannot certify the source.
        consistent=self.repin(side,source=src)
        v=verify(consistent['sidecar'],consistent['metadata'],consistent['anchors'],
                 source_bytes=src,map_bytes=self.b.map_bytes,config_bytes=self.b.config)
        self.assertFalse(v.producer_attested)
        with self.assertRaises(ValueError):replay(**consistent)

    def test_renaming_source_producer_to_authentic_commit_does_not_attest(self):
        side=json.loads(self.b.sidecar)
        # Existing schema pins the modeled C# Git SHA, not a C# process identity.
        self.assertEqual(side['producerCommit'],self.b.anchors.upstream_commit)
        v=replay(**self.repin(side))
        self.assertFalse(v.producer_attested)
        self.assertFalse(v.authentic_release_eligible)
        side['producerAttested']=True
        with self.assertRaises(ValueError):replay(**self.repin(side))

    def test_falsely_claimed_event_parent_rejected(self):
        side=json.loads(self.b.sidecar)
        discovered=next(x for x in side['events'] if x['kind']=='discover')
        discovered['parent']=BASE+0x0A0
        with self.assertRaises(ValueError):replay(**self.repin(side))

    def test_fabricated_complete_output_metadata_rejected(self):
        side=json.loads(self.b.sidecar)
        metadata=json.loads(self.b.metadata)
        # Forge a plausible hash and matching emit record, repin everything.
        first=metadata['functions'][0]
        first['sha256']=digest(b'not the bytes decoded from PPC')
        for event in side['events']:
            if event['kind']=='emit' and event['address']==first['entryPoint']:
                event['outputSha256']=first['sha256']
        arguments=self.repin(side,meta=encode(metadata))
        # Phase16 confirms only structural consistency, so its pass is not trust.
        v=verify(arguments['sidecar'],arguments['metadata'],arguments['anchors'],
                 source_bytes=self.b.source,map_bytes=self.b.map_bytes,
                 config_bytes=self.b.config)
        self.assertFalse(v.authentic_release_eligible)
        with self.assertRaisesRegex(ValueError,'origin event stream differs'):
            replay(**arguments)

    def test_incorrect_map_claim_or_seed_skip_rejected(self):
        side=json.loads(self.b.sidecar)
        side['mapSeeds'].pop()
        with self.assertRaises(ValueError):replay(**self.repin(side))
        side=json.loads(self.b.sidecar)
        bad=next(x for x in side['events'] if x['kind']=='skip')
        bad['reason']='authenticated-skip'
        with self.assertRaises(ValueError):replay(**self.repin(side))

    def test_unsupported_origin_verdict_never_becomes_release_true(self):
        # Full synthetic graph and byte witnesses are not a trusted observer.
        v=replay(source=self.b.source,map_bytes=self.b.map_bytes,
                 config=self.b.config,sidecar=self.b.sidecar,
                 metadata=self.b.metadata,anchors=self.b.anchors,outputs=self.b.files)
        self.assertEqual((v.producer_attested,v.authentic_release_eligible),(False,False))

if __name__=='__main__':unittest.main()
