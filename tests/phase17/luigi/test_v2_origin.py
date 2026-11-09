"""Independent toy origin-v2 ordering spec: NOT the real C# producer."""
from dataclasses import replace
import json
import unittest
from scripts.phase16.luigi.fixtures import encode
from scripts.phase17.luigi.producer import (
    BASE,make_invented_source,invented_map,invented_config
)
from scripts.phase17.luigi.origin_v2 import generate_v2, verify_v2


class DeferredEmissionOrigin(unittest.TestCase):
    def setUp(self):
        self.bundle=generate_v2(make_invented_source(),invented_map(),invented_config())

    def test_realistic_commit_before_final_emission_barrier(self):
        events=json.loads(self.bundle.trace)['events']
        self.assertEqual(events[0]['kind'],'root_declared')
        self.assertEqual(len([e for e in events if e['kind']=='map_seed_declared']),4)
        translated=[i for i,e in enumerate(events) if e['kind']=='translation_committed']
        emitted=[i for i,e in enumerate(events) if e['kind']=='output_emitted']
        self.assertEqual((len(translated),len(emitted)),(6,6))
        self.assertGreater(min(emitted),max(translated))
        self.assertEqual(events[-1]['kind'],'run_completed')
        self.assertEqual(verify_v2(self.bundle),len(events))
        self.assertFalse(self.bundle.producer_attested)
        self.assertFalse(self.bundle.authentic_release_eligible)

    def test_map_seed_reached_by_walk_deduplicates_in_speculative_phase(self):
        events=json.loads(self.bundle.trace)['events']
        promoted=BASE+0xE0
        self.assertTrue(any(e['kind']=='target_discovered' and e['address']==promoted for e in events))
        self.assertTrue(any(e['kind']=='candidate_deduplicated' and e['address']==promoted for e in events))
        self.assertEqual(len([e for e in events if e['kind']=='output_emitted' and e['address']==promoted]),1)

    def test_speculative_failed_descendant_does_not_emit(self):
        events=json.loads(self.bundle.trace)['events']
        failed={e['address'] for e in events if e['kind']=='candidate_skipped'}
        self.assertEqual(failed,{BASE+0x80,BASE+0xC0})
        self.assertFalse(any(e['address'] in failed and e['kind']=='output_emitted' for e in events))

    def test_forged_order_with_recomputed_hash_is_not_toy_replay(self):
        payload=json.loads(self.bundle.trace)
        events=payload['events']
        commits=[i for i,e in enumerate(events) if e['kind']=='translation_committed']
        emitted=[i for i,e in enumerate(events) if e['kind']=='output_emitted']
        events[commits[0]],events[emitted[0]]=events[emitted[0]],events[commits[0]]
        for i,e in enumerate(events):e['seq']=i
        with self.assertRaisesRegex(ValueError,'origin trace'):
            verify_v2(replace(self.bundle,trace=encode(payload)))

    def test_forged_origin_and_extra_attestation_do_not_pass(self):
        p=json.loads(self.bundle.trace)
        p['producerAttested']=True
        with self.assertRaises(ValueError): verify_v2(replace(self.bundle,trace=encode(p)))
        self.assertFalse(self.bundle.authentic_release_eligible)

    def test_modified_source_or_emission_is_denied(self):
        changed=self.bundle.source[:-1]+bytes([self.bundle.source[-1]^1])
        with self.assertRaises(ValueError):verify_v2(replace(self.bundle,source=changed))
        files=dict(self.bundle.outputs)
        k=next(iter(files));files[k]+=b'changed'
        with self.assertRaises(ValueError):verify_v2(replace(self.bundle,outputs=files))

    def test_same_inputs_yield_identical_v2_trace(self):
        second=generate_v2(self.bundle.source,self.bundle.map_bytes,self.bundle.config)
        self.assertEqual(self.bundle.trace,second.trace)
        self.assertEqual(self.bundle.metadata,second.metadata)
        self.assertEqual(self.bundle.outputs,second.outputs)


if __name__=='__main__': unittest.main()

class V2NegativeQueueEdges(unittest.TestCase):
    def test_walk_bad_word_is_fatal_no_partial_completed_stream(self):
        from scripts.phase17.luigi.producer import replace_word
        with self.assertRaisesRegex(ValueError,'walked candidate failed'):
            generate_v2(replace_word(make_invented_source(),BASE,0xFFFFFFFF),
                        invented_map(),invented_config())

    def test_invented_source_must_resolve_synthetic_skips_not_fake_emission(self):
        a=generate_v2(make_invented_source(),invented_map(),invented_config())
        e=json.loads(a.trace)['events']
        committed={x['address'] for x in e if x['kind']=='translation_committed'}
        output={x['address'] for x in e if x['kind']=='output_emitted'}
        self.assertEqual(committed,output)
        self.assertTrue(any(x['kind']=='candidate_deduplicated' for x in e))
        self.assertEqual(e[-1]['emittedCount'],6)
        self.assertEqual(e[-1]['skippedCount'],2)
