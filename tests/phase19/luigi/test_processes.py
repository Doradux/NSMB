"""Subprocess and independent witness lifecycle checks for invented PPC."""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import io
import json
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

from scripts.phase19.luigi.model import source_inputs,render_cpp
from scripts.phase19.luigi.cpp_producer import emit
from scripts.phase19.luigi.cpp_witness import verify_cpp_emission
from scripts.phase18.luigi.witness import observe

ROOT=Path(__file__).resolve().parents[3]


class IndependentToyProcess(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="luigi-p19-evt-")
        self.addCleanup(self.temp.cleanup)
        self.folder=Path(self.temp.name)
        self.source,self.map,self.config=source_inputs()
        self.nonce="fedcba9876543210fedcba9876543210"

    def test_real_cpp_emit_event_in_separate_python_process(self):
        for name,body in (("source",self.source),("map",self.map),("config",self.config)):
            (self.folder/name).write_bytes(body)
        p=subprocess.run([sys.executable,"-B","-m",
            "scripts.phase19.luigi.cpp_producer","--source",str(self.folder/"source"),
            "--map",str(self.folder/"map"),"--config",str(self.folder/"config"),
            "--outdir",str(self.folder/"output"),"--nonce",self.nonce],
            cwd=ROOT,capture_output=True,timeout=12)
        self.assertEqual(p.returncode,3,p.stderr)
        check=verify_cpp_emission(p.stdout,self.folder/"output",
            self.source,self.map,self.config,self.nonce)
        self.assertFalse(check["producerAttested"])
        self.assertEqual(check["cppSha256"],
            sha256(render_cpp(self.source,self.map,self.config)).hexdigest())

    def test_truncated_or_forged_stream_event_rejected(self):
        event=io.StringIO()
        with redirect_stdout(event):
            emit(self.source,self.map,self.config,self.folder/"out",self.nonce)
        wire=event.getvalue().encode()
        for candidate in (wire[:-1],wire[:-7],wire+b"{}\n",wire.replace(
                b'"seq":0',b'"seq":0,"s\\u0065q":0',1),
                wire.replace(b'"producerAttested":false',b'"producerAttested":true',1)):
            with self.subTest(length=len(candidate)):
                with self.assertRaises(ValueError):
                    verify_cpp_emission(candidate,self.folder/"out",
                        self.source,self.map,self.config,self.nonce)

    def test_wrong_challenge_and_changed_post_emission_bytes_denied(self):
        capture=io.StringIO()
        with redirect_stdout(capture):
            emit(self.source,self.map,self.config,self.folder/"out",self.nonce)
        wire=capture.getvalue().encode()
        with self.assertRaises(ValueError):
            verify_cpp_emission(wire,self.folder/"out",
                self.source,self.map,self.config,"0"*32)
        path=self.folder/"out/invented_guest.cpp"
        path.write_bytes(path.read_bytes()+b"// forged")
        with self.assertRaises(ValueError):
            verify_cpp_emission(wire,self.folder/"out",
                self.source,self.map,self.config,self.nonce)

    def test_noninvented_data_rejected_before_file_write(self):
        changed=bytearray(self.source);changed[-1]^=0x80
        with self.assertRaisesRegex(ValueError,"invented"):
            emit(bytes(changed),self.map,self.config,self.folder/"bad",self.nonce)
        self.assertFalse((self.folder/"bad").exists())

    def test_existing_destination_refuses_overwrite(self):
        (self.folder/"out").mkdir()
        with self.assertRaises(OSError):
            emit(self.source,self.map,self.config,self.folder/"out",self.nonce)

    def test_four_independent_concurrent_producer_observer_processes(self):
        src,map_bytes,config=self.source,self.map,self.config
        pins={"sourceSha256":sha256(src).hexdigest(),
              "mapSha256":sha256(map_bytes).hexdigest(),
              "configSha256":sha256(config).hexdigest(),
              "observerCodeSha256":sha256(
                  (ROOT/"scripts/phase18/luigi/producer_stream.py").read_bytes()).hexdigest()}
        def worker(i):
            nonce=f"{i+1:032x}"
            report=observe(src,map_bytes,config,pins,nonce,timeout_seconds=15)
            if report["eventCount"]!=34 or report["producerAttested"]:
                raise AssertionError("toy observed with wrong nonce/attestation")
            return report["status"],nonce
        with ThreadPoolExecutor(max_workers=4) as pool:
            values=list(pool.map(worker,range(4)))
        self.assertEqual(len(set(n for _,n in values)),4)
        self.assertTrue(all(status=="TOY_OBSERVED_REPLAY_STOP" for status,_ in values))

    def test_deterministic_250_single_bit_source_variants_refuse_emission(self):
        import random
        rand=random.Random(191119)
        source=bytearray(self.source)
        for i in range(250):
            b=source[:]
            at=rand.randrange(len(b))
            b[at]^=1<<rand.randrange(8)
            with self.assertRaises(ValueError):
                emit(bytes(b),self.map,self.config,self.folder/f"bad-{i}",self.nonce)
        self.assertFalse(any(self.folder.iterdir()))


if __name__=="__main__":unittest.main()
