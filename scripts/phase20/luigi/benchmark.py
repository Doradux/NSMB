"""Measured deterministic P20 three-guest invented leaf + physical pipeline.

Iterations are NOT counted as unittest methods. No Nintendo source, no
production private W03 service quota, no external producer attestation.
"""
from __future__ import annotations
import argparse
from hashlib import sha256
import json
from pathlib import Path
import random
import statistics
import tempfile
import time

from .abi import LeafInput,evaluate
from .pipeline import create_package,verify_package
from .witness import verify


def ms(values):
    return {"runs":len(values),"minMs":round(min(values),3),
       "medianMs":round(statistics.median(values),3),
       "maxMs":round(max(values),3)}


def benchmark(repetitions=8,mutations=300):
    rng=random.Random(20201110)
    with tempfile.TemporaryDirectory(prefix="luigi-p20-bench-") as t:
        pkg=Path(t)/"package"
        start=time.perf_counter()
        proof=create_package(pkg)
        build_ms=round((time.perf_counter()-start)*1000,3)
        verifies=[]
        for _ in range(repetitions):
            start=time.perf_counter()
            result=verify_package(pkg,proof["manifestSha256"],
                proof["runNonce"],proof["wasmSha256"])
            if result["authenticReleaseEligible"]:
                raise AssertionError("forged producer trust")
            verifies.append((time.perf_counter()-start)*1000)
        oracle=[]
        for entry in (0,0x20,0x40):
            for val in range(60):
                start=time.perf_counter()
                ans=evaluate(LeafInput(entry_offset=entry,gpr3=val*7))
                if not ans.computed:raise AssertionError("invented guest unexpectedly rejected")
                oracle.append((time.perf_counter()-start)*1000)
        cpp=pkg/"leaf/toy_leaf_generated.cpp"
        raw=cpp.read_bytes()
        emitter=(pkg/"origin.jsonl").read_bytes()
        rejected=0
        for _ in range(mutations):
            modified=bytearray(raw)
            n=rng.randrange(len(modified))
            modified[n]^=1<<rng.randrange(8)
            cpp.write_bytes(modified)
            try:
                verify(pkg/"leaf",emitter,proof["runNonce"],
                       sha256(raw).hexdigest())
            except ValueError:
                rejected+=1
            else:raise AssertionError("mutated emitted C++ passed independent replay")
        cpp.write_bytes(raw)
        verify_package(pkg,proof["manifestSha256"],proof["runNonce"],
                       proof["wasmSha256"])
        return {"source":"entirely invented PPC-Lite",
                "freshOfflineDockerBuildWithIndependentWitnessMs":build_ms,
                "fileCount":result["fileCount"],
                "nativeOracleVectors":result["nativeOracleVectors"],
                "nodeStandaloneWasmChecks":result["wasmOracleChecks"],
                "verifier":ms(verifies),"threeGuestOracle":ms(oracle),
                "fuzzSeed":20201110,"mutatedCppBytesDenied":rejected,
                "mutationAttempts":mutations,"wasmSha256":proof["wasmSha256"],
                "producerAttested":False,"authenticReleaseEligible":False,
                "realW03PrivateServiceQuota":False}


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--repetitions",type=int,default=8)
    p.add_argument("--mutations",type=int,default=300)
    args=p.parse_args()
    if not 1<=args.repetitions<=20 or not 1<=args.mutations<=1000:
        raise SystemExit(64)
    print(json.dumps(benchmark(args.repetitions,args.mutations),sort_keys=True))
    raise SystemExit(3)


if __name__=="__main__":main()
