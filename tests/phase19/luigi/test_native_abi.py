"""Native g++ + ASan/UBSan execution of self-authored invented guest C++."""
from __future__ import annotations
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from scripts.phase19.luigi.model import source_inputs,render_cpp,reference_run


class SanitizedInventedCpu(unittest.TestCase):
    def test_real_native_asan_ubsan_compile_and_three_guest_semantics(self):
        s,m,c=source_inputs()
        with tempfile.TemporaryDirectory(prefix="luigi-p19-sanitizers-") as t:
            cpp=Path(t)/"invented_guest.cpp"
            binary=Path(t)/"guest_asan"
            cpp.write_bytes(render_cpp(s,m,c))
            cmd=["g++","-std=c++17","-O1","-g","-Wall","-Wextra","-Werror",
                 "-pedantic","-fsanitize=address,undefined",
                 "-fno-omit-frame-pointer","-DNSMB_TOY_NATIVE_MAIN",
                 str(cpp),"-o",str(binary)]
            env=os.environ.copy()
            env.pop("LD_LIBRARY_PATH",None);env.pop("LD_PRELOAD",None)
            compilation=subprocess.run(cmd,env=env,capture_output=True,text=True,
                                       timeout=35)
            self.assertEqual(compilation.returncode,0,compilation.stderr)
            env["ASAN_OPTIONS"]="detect_leaks=1:halt_on_error=1"
            env["UBSAN_OPTIONS"]="halt_on_error=1:print_stacktrace=1"
            for address in (0,0x20,0x40,0xe0,0xa0,0x300):
                for initial in (0,100):
                    with self.subTest(entry=address,initial=initial):
                        result=subprocess.run([str(binary),str(address),str(initial)],
                             env=env,capture_output=True,text=True,timeout=9)
                        self.assertEqual(result.returncode,0,result.stderr[-1000:])
                        self.assertEqual(result.stdout.strip(),
                             str(reference_run(s,m,c,address,initial)))


if __name__=='__main__':unittest.main()
