"""Phase20 invented PPC leaf ABI: g++ tests on generated C++ bytes, not JSON."""
from __future__ import annotations
from pathlib import Path
import subprocess
import tempfile
import unittest

from scripts.phase20.luigi.abi import LeafInput,Status,evaluate,provenance


class RealGeneratedPpcLeaf(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from scripts.phase20.luigi.render import render_cpp,render_header
        cls.source_cpp=render_cpp()
        cls.header=render_header()
        cls.temp=tempfile.TemporaryDirectory(prefix="luigi-p20-native-")
        folder=Path(cls.temp.name)
        (folder/"toy_leaf_abi.hpp").write_bytes(cls.header)
        (folder/"toy_leaf.cpp").write_bytes(cls.source_cpp)
        cls.exe=folder/"leaf_probe"
        p=subprocess.run(["g++","-std=c++17","-O2","-Wall","-Wextra",
             "-Werror","-pedantic","-DNSMB_P20_TOY_MAIN",
             str(folder/"toy_leaf.cpp"),"-o",str(cls.exe)],
             capture_output=True,text=True,timeout=30)
        if p.returncode:raise AssertionError(p.stderr)

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def invoke(self,case:LeafInput):
        output=subprocess.run([str(self.exe),str(case.entry_offset),str(case.expected_pc),
           str(case.gpr3),str(case.lr),str(case.stack_sentinel),str(case.max_steps)],
           capture_output=True,text=True,timeout=8)
        self.assertEqual(output.returncode,0,output.stderr)
        status,gpr3,lr,pc,steps=map(int,output.stdout.split())
        return status,gpr3,lr,pc,steps

    def test_generated_cpp_really_matches_source_decoded_graph(self):
        self.assertIn(b"nsmb_p20_leaf_probe",self.source_cpp)
        self.assertIn(b"nsmbw::p20::toy",self.source_cpp)
        self.assertIn(provenance()["sourceSha256"][:8].encode(),self.source_cpp)

    def test_root_nested_and_negative_immediate_r3_lr_pc(self):
        for entry in (0,0x20,0x40,0x60,0xe0):
            for initial in (0,1,100,0xFFFFFFFE):
                with self.subTest(entry=entry,initial=initial):
                    expected=evaluate(LeafInput(entry_offset=entry,gpr3=initial,lr=0xCAFE))
                    self.assertEqual(self.invoke(LeafInput(
                        entry_offset=entry,gpr3=initial,lr=0xCAFE)),
                        (int(expected.status),expected.gpr3,expected.lr,
                         expected.return_pc,expected.steps))

    def test_zero_candidate_on_denial_wrong_pc_unknown_entry_max_steps(self):
        for request in (LeafInput(expected_pc=0x80010004),LeafInput(entry_offset=160),
                        LeafInput(entry_offset=768),LeafInput(max_steps=1),
                        LeafInput(max_steps=0)):
            with self.subTest(request=request):
                status,r3,lr,pc,_=self.invoke(request)
                self.assertNotEqual(status,0)
                self.assertEqual((r3,lr,pc),(0,0,0))

    def test_abi_does_not_export_private_ticket_or_cpu_context(self):
        self.assertNotIn(b"leaseSynthetic(",self.source_cpp)
        self.assertNotIn(b"CpuContext*",self.source_cpp)
        self.assertNotIn(b"armCanonicalClock(",self.source_cpp)
        self.assertNotIn(b"ServiceId::",self.source_cpp)


if __name__=="__main__":unittest.main()
