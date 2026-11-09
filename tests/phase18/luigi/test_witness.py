"""Separate-process witness for invented PPC; NEVER Nintendo original."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import unittest

from scripts.phase16.luigi.fixtures import encode
from scripts.phase16.luigi.sidecar import digest
from scripts.phase17.luigi.producer import BASE,make_invented_source,invented_map,invented_config,replace_word,NOP
from scripts.phase18.luigi.witness import observe

ROOT=Path(__file__).resolve().parents[3]
PRODUCER=ROOT/'scripts/phase18/luigi/producer_stream.py'
NONCE='abcdef0123456789abcdef0123456789'

class IndependentToyObserver(unittest.TestCase):
    def setUp(self):
        self.source=make_invented_source()
        self.map=invented_map()
        self.config=invented_config()
        self.pins=self.pinned()

    def pinned(self):
        return {'sourceSha256':digest(self.source),'mapSha256':digest(self.map),
                'configSha256':digest(self.config),
                'observerCodeSha256':digest(PRODUCER.read_bytes())}

    def observation(self,**kw):
        return observe(self.source,self.map,self.config,self.pins,NONCE,**kw)

    def test_stream_success_is_never_authentic(self):
        v=self.observation()
        self.assertEqual((v['eventCount'],v['producerAttested'],
                          v['authenticReleaseEligible']),(34,False,False))

    def test_abort_root_without_completion_denied(self):
        with self.assertRaisesRegex(ValueError,'child ended'):
            self.observation(abort_after=1)

    def test_truncation_mid_run_denied(self):
        with self.assertRaisesRegex(ValueError,'child ended'):
            self.observation(abort_after=17)

    def test_truncation_just_before_completion_denied(self):
        with self.assertRaisesRegex(ValueError,'child ended'):
            self.observation(abort_after=33)

    def test_forged_early_emission_denied(self):
        with self.assertRaisesRegex(ValueError,'event coverage|origin event'):
            self.observation(early_output=True)

    def test_missing_output_file_after_self_reported_completion_denied(self):
        with self.assertRaisesRegex(ValueError,'output inventory'):
            self.observation(omit_output=True)

    def test_source_flip_against_independent_precommit_denied(self):
        bad=bytearray(self.source);bad[0x260]^=1
        with self.assertRaisesRegex(ValueError,'input differs'):
            observe(bytes(bad),self.map,self.config,self.pins,NONCE)

    def test_modified_map_or_config_denied(self):
        with self.assertRaisesRegex(ValueError,'input differs'):
            observe(self.source,self.map+b' ',self.config,self.pins,NONCE)
        with self.assertRaisesRegex(ValueError,'input differs'):
            observe(self.source,self.map,self.config+b' ',self.pins,NONCE)

    def test_fake_binary_pin_denied_before_child_process(self):
        forged={**self.pins,'observerCodeSha256':'f'*64}
        with self.assertRaisesRegex(ValueError,'toy producer code differs'):
            observe(self.source,self.map,self.config,forged,NONCE)

    def test_invalid_nonce_denied(self):
        for value in ('z'*32,'F'*32,'',NONCE+'0',NONCE+'\n'):
            with self.subTest(nonce=value),self.assertRaisesRegex(ValueError,'nonce invalid'):
                observe(self.source,self.map,self.config,self.pins,value)

    def test_attacker_repin_source_still_never_authenticates(self):
        self.source=replace_word(self.source,BASE+0x280,NOP)
        self.pins=self.pinned()
        self.assertFalse(self.observation()['authenticReleaseEligible'])

    def test_distinct_nonce_challenges_replay_independently(self):
        for nonce in ('0'*32,'1'*32,'2'*32):
            with self.subTest(nonce=nonce):
                v=observe(self.source,self.map,self.config,self.pins,nonce)
                self.assertEqual(v['eventCount'],34)
                self.assertFalse(v['producerAttested'])

    def test_unicode_duplicate_json_event_denied(self):
        with self.assertRaisesRegex(ValueError,'invalid child event'):
            self.observation(duplicate_key=True)

    def test_replayed_nonce_is_not_a_signature(self):
        first=self.observation()
        second=self.observation()
        self.assertEqual(first,second)
        self.assertFalse(first['producerAttested'])
        self.assertFalse(second['authenticReleaseEligible'])

    def test_precommitted_source_sha_is_not_game_authorization(self):
        self.assertEqual(len(self.pins['sourceSha256']),64)
        report=self.observation()
        self.assertTrue(report['sourceByteIntegrity'])
        self.assertFalse(report['authenticReleaseEligible'])

    def test_observer_cli_separate_process_exit3_and_4(self):
        with tempfile.TemporaryDirectory(prefix='luigi-p18-cli-') as tmp:
            p=Path(tmp)
            for name,body in (('source.dol',self.source),('inputs.map',self.map),
                              ('config.json',self.config),('pins.json',encode(self.pins))):
                (p/name).write_bytes(body)
            command=[sys.executable,'-B','-m','scripts.phase18.luigi.witness',
                '--source',str(p/'source.dol'),'--map',str(p/'inputs.map'),
                '--config',str(p/'config.json'),'--pins',str(p/'pins.json'),
                '--nonce',NONCE]
            env=os.environ.copy();env['PYTHONDONTWRITEBYTECODE']='1'
            env.pop('LD_LIBRARY_PATH',None);env.pop('LD_PRELOAD',None)
            ok=subprocess.run(command,cwd=ROOT,env=env,text=True,
                              capture_output=True,timeout=20)
            self.assertEqual(ok.returncode,3,ok.stderr)
            self.assertFalse(json.loads(ok.stdout)['authenticReleaseEligible'])
            bad=subprocess.run(command+['--inject-early-output'],cwd=ROOT,env=env,
                               text=True,capture_output=True,timeout=20)
            self.assertEqual(bad.returncode,4,bad.stderr)
            self.assertEqual(bad.stdout,'')

if __name__=='__main__':unittest.main()
