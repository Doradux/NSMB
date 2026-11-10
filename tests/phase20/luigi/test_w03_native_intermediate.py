"""Real W03 private ticket ARM + clock COMMIT fed by invented leaf output.

NOT yet Phase20 ServiceId+quota or leaf invocation inside W03 scheduler.
"""
from pathlib import Path
import os,subprocess,tempfile,unittest

ROOT=Path(__file__).resolve().parents[3]
FILES=[
 "tests/phase20/luigi/leaf_w03_bridge_native.cpp",
 "scripts/phase20/luigi/toy_leaf_generated.cpp",
 "web-runtime/frame-host/frame_loop.cpp",
 "web-runtime/frame-host/guest_cpu.cpp",
 "web-runtime/frame-host/translator_abi_fixture.cpp",
 "web-runtime/src/guest_memory.cpp",
 "web-runtime/interop/synthetic_guest.cpp",
 "web-runtime/interop/device_policy.cpp",
 "web-runtime/runtime-services/input_snapshot.cpp"
]


class NativeW03Intermediate(unittest.TestCase):
    def test_native_w03_private_ticket_and_leaf_with_sanitizers(self):
        with tempfile.TemporaryDirectory(prefix="luigi-p20-real-w03-") as t:
            binary=Path(t)/"w03"
            env=os.environ.copy();env.pop("LD_LIBRARY_PATH",None)
            env.pop("LD_PRELOAD",None)
            cmd=["g++","-std=c++17","-O1","-g","-Wall","-Wextra",
                 "-Werror","-pedantic","-fsanitize=address,undefined",
                 "-fno-omit-frame-pointer","-DNSMB_PHASE18_CLOCK_TEST",
                 *[str(ROOT/p) for p in FILES],"-o",str(binary)]
            compiled=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=48)
            self.assertEqual(compiled.returncode,0,compiled.stderr[-3500:])
            env["ASAN_OPTIONS"]="detect_leaks=1:halt_on_error=1"
            env["UBSAN_OPTIONS"]="halt_on_error=1:print_stacktrace=1"
            r=subprocess.run([str(binary)],env=env,capture_output=True,text=True,timeout=25)
            self.assertEqual(r.returncode,0,r.stderr[-1600:])
            self.assertIn("128 real W03 resets",r.stdout)
            self.assertIn("TOTAL_CHECKS 18",r.stdout)
            self.assertEqual(r.stderr,"")


if __name__=="__main__":unittest.main()
