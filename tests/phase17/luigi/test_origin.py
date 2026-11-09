"""Adversarial tests for at-origin toy producer, no Nintendo assets."""
from dataclasses import replace
import json
import struct
import unittest
from scripts.phase16.luigi.fixtures import encode
from scripts.phase16.luigi.sidecar import digest,verify
from scripts.phase17.luigi.producer import (
    BASE,END,BLR,NOP,OriginProducer,bl,make_invented_source,
    replace_word,invented_map,invented_config,produce_demo,
)
from scripts.phase17.luigi.replay import replay


def rerun(source=None,map_bytes=None,config=None):
    return OriginProducer(source if source is not None else make_invented_source(),
                          map_bytes if map_bytes is not None else invented_map(),
                          config if config is not None else invented_config()).run()


def inspect(bundle):
    return replay(source=bundle.source,map_bytes=bundle.map_bytes,
                  config=bundle.config,sidecar=bundle.sidecar,
                  metadata=bundle.metadata,anchors=bundle.anchors,
                  outputs=bundle.files)


class InventedPpcOrigin(unittest.TestCase):
    def setUp(self):
        self.b=produce_demo()
        self.events=json.loads(self.b.sidecar)['events']

    def test_positive_events_are_emitted_at_origin(self):
        v=inspect(self.b)
        self.assertEqual((v.translated_count,v.event_count,v.skipped_attempts),(6,17,2))
        self.assertFalse(v.producer_attested)
        self.assertFalse(v.authentic_release_eligible)
        self.assertEqual(self.events[0]['kind'],'root')
        self.assertEqual([x['kind'] for x in self.events[1:5]],['map_seed']*4)
        self.assertEqual(len([e for e in self.events if e['kind']=='emit']),6)
        self.assertEqual(len([e for e in self.events if e['kind']=='discover']),4)

    def test_skip_speculative_root_and_descendant_differ(self):
        skipped=[x['address'] for x in self.events if x['kind']=='skip']
        self.assertEqual(skipped,[BASE+0x80,BASE+0xC0])
        self.assertNotIn(BASE,skipped)

    def test_map_seed_discovered_before_speculative_attempt(self):
        promoted=BASE+0xE0
        x=[e for e in self.events if e['address']==promoted]
        self.assertEqual([e['kind'] for e in x],['map_seed','discover','emit'])
        self.assertEqual(x[1]['parent'],BASE)
        self.assertEqual(len([e for e in x if e['kind']=='emit']),1)

    def test_deterministic_event_order_and_stable_run_id(self):
        other=rerun()
        self.assertEqual(other.sidecar,self.b.sidecar)
        self.assertEqual(other.metadata,self.b.metadata)
        self.assertEqual(other.files,self.b.files)
        self.assertEqual(other.anchors.run_id,self.b.anchors.run_id)

    def test_run_id_is_not_signature(self):
        source=replace_word(self.b.source,BASE+0x020,NOP)
        # Keep a BLR after modified no-op, so producer may terminate.
        source=replace_word(source,BASE+0x024,BLR)
        changed=rerun(source=source)
        self.assertNotEqual(changed.anchors.run_id,self.b.anchors.run_id)
        self.assertFalse(inspect(changed).producer_attested)

    def test_toy_ppc_calls_encoded_by_real_aa_branch_fields(self):
        self.assertEqual(bl(BASE,BASE+0x20),0x48000021)
        self.assertEqual(bl(BASE+0x20,BASE),0x4BFFFFE1)
        with self.assertRaises(ValueError): bl(BASE,BASE+1)
        with self.assertRaises(ValueError): bl(BASE,BASE+(1<<25))

    def test_fatal_undecodable_required_walk(self):
        source=replace_word(self.b.source,BASE,0xFFFFFFFF)
        with self.assertRaisesRegex(ValueError,'required root-walk'):
            rerun(source=source)

    def test_speculative_unsupported_opcode_soft_skip(self):
        source=replace_word(self.b.source,BASE+0x040,0xFFFFFFFF)
        changed=rerun(source=source)
        self.assertIn(BASE+0x040,[e['address'] for e in json.loads(changed.sidecar)['events'] if e['kind']=='skip'])
        self.assertEqual(inspect(changed).translated_count,4)

    def test_missing_terminator_required_walk_denied(self):
        source=replace_word(self.b.source,BASE+8,NOP)
        with self.assertRaisesRegex(ValueError,'root-walk'):
            rerun(source=source)

    def test_map_duplicate_and_uncanonical_order_fail_closed(self):
        with self.assertRaisesRegex(ValueError,'unique ascending'):
            rerun(map_bytes=invented_map()+f'{BASE+0x040:08X} repeated\n'.encode())
        entries=invented_map().splitlines()
        with self.assertRaisesRegex(ValueError,'unique ascending'):
            rerun(map_bytes=b'\n'.join(entries[::-1])+b'\n')

    def test_reusing_producer_instance_must_fail_before_new_events(self):
        producer=OriginProducer(make_invented_source(),invented_map(),invented_config())
        producer.run()
        count=len(producer.events)
        with self.assertRaisesRegex(ValueError,'already completed'):
            producer.run()
        self.assertEqual(len(producer.events),count)

    def test_duplicate_json_config_keys_rejected_before_decoding(self):
        raw=invented_config().decode().rstrip()[:-1]+',"root":2147500032}'
        with self.assertRaisesRegex(ValueError,'invalid invented config'):
            rerun(config=raw.encode())

    def test_map_address_with_plus_or_non_hex_rejected(self):
        for bad in (b'+0000040 fabricated\n',b'ZZZZZZZZ fabricated\n'):
            with self.subTest(bad=bad):
                with self.assertRaisesRegex(ValueError,'bad toy MAP'):
                    rerun(map_bytes=bad)

    def test_map_seed_outside_executable_denied(self):
        with self.assertRaisesRegex(ValueError,'outside executable'):
            rerun(map_bytes=f'{END:08X} outside\n'.encode())

    def test_missing_root_or_wrong_model_config_denied(self):
        with self.assertRaisesRegex(ValueError,'header entry'):
            rerun(config=invented_config(BASE+4))
        obj=json.loads(invented_config());obj['model']='nintendo-authentic'
        with self.assertRaisesRegex(ValueError,'unsupported invented'):
            rerun(config=encode(obj))

    def test_sha_identifies_only_bytes_not_actual_csharp_emitter(self):
        self.assertEqual(len(self.b.anchors.sidecar_sha256),64)
        self.assertFalse(inspect(self.b).authentic_release_eligible)
        self.assertEqual(json.loads(self.b.sidecar)['producerCommit'],self.b.anchors.upstream_commit)
        # That field is a MODELED PIN. Python is the real toy producer.

    def test_actual_emitted_file_bytes_match_metadata(self):
        meta=json.loads(self.b.metadata)
        for entry in meta['functions']:
            self.assertEqual(digest(self.b.files[entry['relativePath']]),entry['sha256'])
            self.assertIn(b'INVENTED',self.b.files[entry['relativePath']])

    def test_replay_rejects_missing_extraneous_modified_output(self):
        for modification in ('missing','extra','modified'):
            with self.subTest(modification=modification):
                files=dict(self.b.files)
                first=next(iter(files))
                if modification=='missing':del files[first]
                elif modification=='extra':files['added.cpp']=b'synthetic'
                else:files[first]+=b' silent tamper'
                with self.assertRaisesRegex(ValueError,'emitted file'):
                    replay(source=self.b.source,map_bytes=self.b.map_bytes,
                           config=self.b.config,sidecar=self.b.sidecar,
                           metadata=self.b.metadata,anchors=self.b.anchors,outputs=files)

    def test_replay_rejects_forged_validly_rehashed_metadata(self):
        # Genuine Phase16 structurally consistent but self-forged output SHA:
        # the later Phase17 replay MUST reject its claimed source-of-origin.
        m=json.loads(self.b.metadata)
        events=json.loads(self.b.sidecar)
        first=m['functions'][0];fake_hash=digest(b'fabricated downstream output')
        first['sha256']=fake_hash
        for ev in events['events']:
            if ev['kind']=='emit' and ev['address']==first['entryPoint']:
                ev['outputSha256']=fake_hash
        meta=encode(m);events['metadataSha256']=digest(meta)
        side=encode(events)
        anchors=replace(self.b.anchors,sidecar_sha256=digest(side),metadata_sha256=digest(meta))
        # Contract is structurally consistent, proving this is not C# attestation.
        v=verify(side,meta,anchors,source_bytes=self.b.source,
                 map_bytes=self.b.map_bytes,config_bytes=self.b.config)
        self.assertTrue(v.byte_integrity_pinned)
        self.assertFalse(v.producer_attested)
        with self.assertRaisesRegex(ValueError,'origin event stream differs'):
            replay(source=self.b.source,map_bytes=self.b.map_bytes,config=self.b.config,
                   sidecar=side,metadata=meta,anchors=anchors,outputs=self.b.files)
