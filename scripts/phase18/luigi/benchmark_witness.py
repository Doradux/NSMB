"""Deterministic invented-input observer stress + measured process cost.

No original Nintendo assets, no long-running background tasks, no trust keys.
Counts mutation cases separately from unittest methods.
"""
from __future__ import annotations
from dataclasses import replace
from pathlib import Path
import argparse
import random
import statistics
import time

from scripts.phase16.luigi.sidecar import digest
from scripts.phase17.luigi.producer import BASE,NOP,make_invented_source,invented_map,invented_config,replace_word
from scripts.phase17.luigi.origin_v2 import generate_v2
from scripts.phase18.luigi.witness import observe

PRODUCER=Path(__file__).with_name("producer_stream.py")
NONCE="a"*32


def pins(source,map_bytes,config):
    return {"sourceSha256":digest(source),"mapSha256":digest(map_bytes),
            "configSha256":digest(config),
            "observerCodeSha256":digest(PRODUCER.read_bytes())}


def run(seed=1809001,rounds=300,process_runs=12):
    if not (0<=rounds<=10_000 and 1<=process_runs<=100):
        raise ValueError("bounded benchmark inputs required")
    rng=random.Random(seed)
    source=make_invented_source()
    map_bytes=invented_map()
    config=invented_config()
    expected=pins(source,map_bytes,config)
    rejected=0
    for i in range(rounds):
        changed=bytearray(source)
        index=rng.randrange(len(changed))
        changed[index]^=1<<rng.randrange(8)
        try:
            observe(bytes(changed),map_bytes,config,expected,NONCE)
        except ValueError:
            rejected+=1
        else:
            raise AssertionError("source mutation passed independent pin")
    process_times=[]
    replay_times=[]
    for _ in range(process_runs):
        t=time.perf_counter()
        x=observe(source,map_bytes,config,expected,NONCE)
        process_times.append((time.perf_counter()-t)*1000)
        if x["authenticReleaseEligible"] or x["producerAttested"]:
            raise AssertionError("toy must never attest")
        t=time.perf_counter()
        generate_v2(source,map_bytes,config)
        replay_times.append((time.perf_counter()-t)*1000)
    rejected_event_attacks=0
    for i in range(min(30,process_runs*2)):
        kw=({"abort_after":17},{"early_output":True},
            {"omit_output":True},{"duplicate_key":True})[i%4]
        try:
            observe(source,map_bytes,config,expected,NONCE,**kw)
        except ValueError:
            rejected_event_attacks+=1
        else:
            raise AssertionError("forged event run accepted")
    return {
        "seed":seed,
        "sourceBitFlipRejections":rejected,
        "eventInjectionRejections":rejected_event_attacks,
        "measuredProcessRuns":process_runs,
        "observerProcessMedianMs":round(statistics.median(process_times),3),
        "observerProcessMaxMs":round(max(process_times),3),
        "pureReplayMedianMs":round(statistics.median(replay_times),3),
        "producerAttested":False,
        "authenticReleaseEligible":False,
    }


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--rounds",type=int,default=300)
    p.add_argument("--process-runs",type=int,default=12)
    p.add_argument("--seed",type=int,default=1809001)
    a=p.parse_args()
    import json
    print(json.dumps(run(a.seed,a.rounds,a.process_runs),sort_keys=True))


if __name__=="__main__":
    main()
