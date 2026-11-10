"""Measured (NOT estimated) three-guest synthetic pipeline benchmark."""
from __future__ import annotations
import argparse
from hashlib import sha256
import json
from pathlib import Path
import random
import statistics
import tempfile
import time

from scripts.phase19.luigi.model import source_inputs,reference_run
from scripts.phase19.luigi.cpp_witness import verify_cpp_emission
from .lineage import verify_package
from .pipeline import create_package


def summarize(values):
    if not values:return None
    return {"runs":len(values),"minMs":round(min(values),3),
            "medianMs":round(statistics.median(values),3),
            "maxMs":round(max(values),3)}


def run(verify_rounds=10,fuzz_rounds=200):
    rng=random.Random(191110)
    timings=[]
    with tempfile.TemporaryDirectory(prefix="luigi-p19-bench-") as tmp:
        directory=Path(tmp)/"package"
        start=time.perf_counter()
        built=create_package(directory)
        build_ms=(time.perf_counter()-start)*1000
        for _ in range(verify_rounds):
            t=time.perf_counter()
            answer=verify_package(directory,built["manifestSha256"],
                expected_nonce=built["runNonce"],
                expected_wasm_sha=built["wasmSha256"])
            if answer["authenticReleaseEligible"]:raise AssertionError("unexpected authentic flag")
            timings.append((time.perf_counter()-t)*1000)
        source,map_bytes,config=source_inputs()
        oracle=[]
        for entry in (0,32,64):
            for i in range(60):
                initial=i*7
                t=time.perf_counter()
                value=reference_run(source,map_bytes,config,entry,initial)
                if value==0xffffffff:raise AssertionError("toy guest unexpectedly invalid")
                oracle.append((time.perf_counter()-t)*1000)
        event=(directory/"cpp_origin.json").read_bytes()
        cpp=directory/"generated/invented_guest.cpp"
        original=cpp.read_bytes()
        failed=0
        for i in range(fuzz_rounds):
            mutated=bytearray(original)
            offset=rng.randrange(len(mutated))
            mutated[offset]^=1<<rng.randrange(8)
            cpp.write_bytes(mutated)
            try:
                verify_cpp_emission(event,directory/"generated",
                    source,map_bytes,config,built["runNonce"])
            except ValueError:failed+=1
            else:raise AssertionError("mutated C++ was accepted by exact byte replay")
        cpp.write_bytes(original)
        answer=verify_package(directory,built["manifestSha256"],
            expected_nonce=built["runNonce"],
            expected_wasm_sha=built["wasmSha256"])
        if answer["authenticReleaseEligible"]:raise AssertionError("wrong auth")
        return {"name":"public-invented-only","seed":191110,
                "freshDockerBuildPlusTwoWitnessesMs":round(build_ms,3),
                "verifiedStandaloneWasmSha256":built["wasmSha256"],
                "toyMultifileVerification":summarize(timings),
                "threeGuestOracle":summarize(oracle),
                "fuzzCppByteMutationsRejected":failed,
                "fuzzCppByteMutationsTotal":fuzz_rounds,
                "producerAttested":False,"authenticReleaseEligible":False}


def main(argv=None):
    p=argparse.ArgumentParser()
    p.add_argument("--verify-rounds",type=int,default=10)
    p.add_argument("--fuzz-rounds",type=int,default=200)
    args=p.parse_args(argv)
    if not 1<=args.verify_rounds<=30 or not 1<=args.fuzz_rounds<=2000:
        raise SystemExit(64)
    print(json.dumps(run(args.verify_rounds,args.fuzz_rounds),sort_keys=True))
    raise SystemExit(3) # proof only: NEVER valid Wii release
if __name__=="__main__":main()
