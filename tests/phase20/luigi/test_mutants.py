"""Three deliberate broken-source C++ mutants must disagree with byte oracle."""
from pathlib import Path
import subprocess,tempfile,unittest
from scripts.phase20.luigi.abi import LeafInput,Status,evaluate
from scripts.phase20.luigi.render import render_cpp,render_header


class NativeSourceMutants(unittest.TestCase):
    def compile(self,old,new):
        source=render_cpp().decode()
        self.assertEqual(source.count(old),1,'source guard changed; review test')
        with tempfile.TemporaryDirectory(prefix='luigi-p20-mutant-') as temp:
            folder=Path(temp)
            (folder/'toy_leaf_abi.hpp').write_bytes(render_header())
            (folder/'toy_leaf_generated.cpp').write_text(source.replace(old,new))
            binary=folder/'mutated'
            c=subprocess.run(['g++','-std=c++17','-O2','-Wall','-Wextra',
                 '-Werror','-pedantic','-DNSMB_P20_TOY_MAIN',
                 str(folder/'toy_leaf_generated.cpp'),'-o',str(binary)],
                 capture_output=True,text=True,timeout=20)
            self.assertEqual(c.returncode,0,c.stderr)
            return {key:self.invoke_binary(binary,*args) for key,args in self.examples.items()}

    @staticmethod
    def invoke_binary(exe,entry,pc,initial,lr,limit):
        r=subprocess.run([str(exe),str(entry),str(pc),str(initial),
            str(lr),'3735928559',str(limit)],capture_output=True,text=True,timeout=5)
        if r.returncode!=0:raise AssertionError(r.stderr)
        return list(map(int,r.stdout.split()))

    examples={
        'wrong_pc':(0,0x80010004,100,0xCAFE,128),
        'signed':(0x60,0x80010000,0,0xCAFE,128),
        'lr':(0,0x80010000,100,0xCAFE,128),
    }

    def test_mutant_wrong_pc_auth_guard_off_is_caught(self):
        mutated=self.compile('if(in.expectedPc!=kExpectedPc)return deny(Status::wrongPc,0u);',
                             'if(false)return deny(Status::wrongPc,0u);')
        self.assertEqual(evaluate(LeafInput(expected_pc=0x80010004)).status,
                         Status.wrongPc)
        self.assertEqual(mutated['wrong_pc'][0],int(Status.ok))
        self.assertNotEqual(mutated['wrong_pc'][0],int(Status.wrongPc))

    def test_mutant_signed_addi_as_unsigned_is_caught(self):
        mutated=self.compile('static_cast<int16_t>(word&65535u)',
                             'static_cast<uint16_t>(word&65535u)')
        self.assertEqual(evaluate(LeafInput(entry_offset=0x60)).gpr3,0xFFFFFFFD)
        self.assertEqual(mutated['signed'][1],65533)
        self.assertNotEqual(mutated['signed'][1],0xFFFFFFFD)

    def test_mutant_destroys_caller_lr_is_caught(self):
        mutated=self.compile('return {Status::ok,value,in.lr,in.expectedPc+4u,steps};',
                             'return {Status::ok,value,0u,in.expectedPc+4u,steps};')
        self.assertEqual(evaluate(LeafInput(lr=0xCAFE)).lr,0xCAFE)
        self.assertEqual(mutated['lr'][2],0)


if __name__=='__main__':unittest.main()
