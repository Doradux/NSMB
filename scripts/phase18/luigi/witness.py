"""Independent toy observer PROCESS; stream capture + source/outputs replay.

All source bytes MUST be newly invented. Neither this process nor a SHA
copied from the untrusted producer creates authentic C# or Wii attestation.
"""
from __future__ import annotations
from hashlib import sha256
from pathlib import Path
import argparse
import json
import os
import selectors
import time
import re
import subprocess
import sys
import tempfile

from scripts.phase16.luigi.fixtures import encode
from scripts.strict_translation_metadata import load_translation_json
from scripts.phase16.luigi.sidecar import digest
from scripts.phase17.luigi.origin_v2 import generate_v2

HEX64=re.compile(r"^[0-9a-f]{64}$")
HEX32=re.compile(r"^[0-9a-f]{32}$")
MAX_EVENTS=1000
MAX_BYTES=2_000_000
MAX_LINE=100_000


def read_bounded_event_stream(child,nonce:str,deadline_seconds:float):
    """Read a hostile child pipe WITHOUT unbounded readline, stderr deadlocks,
    or an unbounded wait for a missing newline.
    """
    assert child.stdout is not None
    deadline=time.monotonic()+deadline_seconds
    pending=bytearray()
    rows=[]
    total=0
    with selectors.DefaultSelector() as selector:
        selector.register(child.stdout,selectors.EVENT_READ)
        while True:
            remaining=deadline-time.monotonic()
            if remaining<=0:
                raise ValueError("toy producer event stream deadline exceeded")
            if not selector.select(remaining):
                raise ValueError("toy producer event stream deadline exceeded")
            part=os.read(child.stdout.fileno(),4096)
            if not part:break
            total+=len(part)
            if total>MAX_BYTES:
                raise ValueError("toy event stream exceeds total byte bound")
            pending.extend(part)
            while True:
                end=pending.find(b"\n")
                if end<0:break
                if end>MAX_LINE or len(rows)>=MAX_EVENTS:
                    raise ValueError("trace event exceeded limits")
                line=bytes(pending[:end+1])
                del pending[:end+1]
                try:
                    row=load_translation_json(line.decode("utf-8"))
                except (UnicodeError,json.JSONDecodeError,ValueError) as exc:
                    raise ValueError("invalid child event encoding") from exc
                if (type(row) is not dict or row.get("runNonce")!=nonce or
                        type(row.get("seq")) is not int or row["seq"]!=len(rows)):
                    raise ValueError("inconsistent event nonce or order")
                rows.append(row)
            if len(pending)>MAX_LINE:
                raise ValueError("unterminated or oversized event line")
    if pending:
        raise ValueError("unterminated final event line")
    child.wait(timeout=max(0.1,deadline-time.monotonic()))
    return rows


def observe(source:bytes,map_bytes:bytes,config:bytes, pins:dict,
            nonce:str, *, abort_after=-1, early_output=False, omit_output=False,
            duplicate_key=False, timeout_seconds:float=15,
            huge_event=False,flood_stderr=False,hang_seconds=0) -> dict:
    if type(pins) is not dict or set(pins)!={
        "sourceSha256","mapSha256","configSha256","observerCodeSha256"}:
        raise ValueError("independent input pin schema")
    if type(nonce) is not str or not HEX32.fullmatch(nonce):
        raise ValueError("nonce invalid")
    for field,value in pins.items():
        if type(value) is not str or not HEX64.fullmatch(value):
            raise ValueError("invalid pin syntax")
    if max(len(source),len(map_bytes),len(config))>MAX_BYTES:
        raise ValueError("input too large")
    for key,body in (("sourceSha256",source),("mapSha256",map_bytes),
                     ("configSha256",config)):
        if digest(body)!=pins[key]:
            raise ValueError("input differs from observer precommit")
    own_producer=Path(__file__).with_name("producer_stream.py")
    if digest(own_producer.read_bytes())!=pins["observerCodeSha256"]:
        raise ValueError("toy producer code differs from independently pinned digest")
    expected=generate_v2(source,map_bytes,config)
    payload=json.loads(expected.trace)
    expected_events=payload["events"]
    observed=[]
    with tempfile.TemporaryDirectory(prefix="luigi-p18-observer-") as scratch:
        dest=Path(scratch)
        for name,body in (("source.dol",source),("inputs.map",map_bytes),
                          ("config.json",config)):
            (dest/name).write_bytes(body)
        out=dest/"observed_outputs"
        args=[sys.executable,"-B","-m","scripts.phase18.luigi.producer_stream",
              "--source",str(dest/"source.dol"),"--map",str(dest/"inputs.map"),
              "--config",str(dest/"config.json"),"--out",str(out),
              "--nonce",nonce]
        if abort_after>=0:args+=["--abort-after",str(abort_after)]
        if early_output:args.append("--inject-early-output")
        if omit_output:args.append("--omit-output")
        if duplicate_key:args.append("--duplicate-json-key")
        if huge_event:args.append("--huge-event")
        if flood_stderr:args.append("--flood-stderr")
        if hang_seconds:args+=["--hang-seconds",str(hang_seconds)]
        env=os.environ.copy()
        env["PYTHONDONTWRITEBYTECODE"]="1"
        env.pop("LD_LIBRARY_PATH",None)
        env.pop("LD_PRELOAD",None)
        # Drain only bounded event bytes; stderr is deliberately discarded,
        # so a malicious producer cannot fill its pipe and deadlock us.
        child=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
            env=env,cwd=Path(__file__).resolve().parents[3],bufsize=0)
        try:
            observed=read_bounded_event_stream(child,nonce,timeout_seconds)
            if child.returncode!=3:
                raise ValueError("child ended without a successful synthetic STOP")
            if not observed or observed[-1].get("kind")!="run_completed":
                raise ValueError("incomplete synthetic event stream")
            if len(observed)!=len(expected_events)+1:
                raise ValueError("event coverage differs from replay")
            # Stream has ONE independent source_identity before v2 toy events.
            identity=observed.pop(0)
            if identity.get("kind")!="source_identity" or any(
                identity.get(k)!=pins[k] for k in
                ("sourceSha256","mapSha256","configSha256")):
                raise ValueError("toy producer source event differs from witness")
            for i,(actual,e) in enumerate(zip(observed,expected_events)):
                check={k:v for k,v in actual.items() if k not in
                       ("version","runNonce","seq")}
                expected_row={k:v for k,v in e.items() if k!="seq"}
                if actual.get("version")!=2 or actual.get("seq")!=i+1 or                    check!=expected_row:
                    raise ValueError(f"source-origin event differs at sequence {i+1}")
            metadata=out/"metadata.json"
            if not metadata.is_file() or metadata.read_bytes()!=expected.metadata:
                raise ValueError("durable toy metadata differs from replay")
            actual_names={p.name for p in out.iterdir()}
            if actual_names!=set(expected.outputs)|{"metadata.json"}:
                raise ValueError("durable toy output inventory mismatch")
            for name,expected_bytes in expected.outputs.items():
                p=out/name
                if p.is_symlink() or p.read_bytes()!=expected_bytes:
                    raise ValueError("durable toy output bytes mismatch")
            return {"status":"TOY_OBSERVED_REPLAY_STOP",
                    "eventCount":len(observed)+1,
                    "sourceByteIntegrity":True,
                    "producerAttested":False,
                    "authenticReleaseEligible":False}
        finally:
            if child.poll() is None:
                child.kill()
                child.wait(timeout=10)
            # A rejected event stream may throw before communicate() closes
            # pipes. Never leak subprocess file descriptors across fuzz runs.
            if child.stdout is not None:
                child.stdout.close()
            if child.stderr is not None:
                child.stderr.close()


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    for key in ("source","map","config","pins","nonce"):
        parser.add_argument("--"+key,required=True)
    parser.add_argument("--abort-after",type=int,default=-1)
    parser.add_argument("--inject-early-output",action="store_true")
    parser.add_argument("--omit-output",action="store_true")
    parser.add_argument("--duplicate-json-key",action="store_true")
    parser.add_argument("--huge-event",action="store_true")
    parser.add_argument("--flood-stderr",action="store_true")
    parser.add_argument("--hang-seconds",type=float,default=0)
    args=parser.parse_args(argv)
    try:
        source=Path(args.source).read_bytes()
        map_bytes=Path(args.map).read_bytes()
        config=Path(args.config).read_bytes()
        pins=json.loads(Path(args.pins).read_bytes())
        report=observe(source,map_bytes,config,pins,args.nonce,
                       abort_after=args.abort_after,
                       early_output=args.inject_early_output,
                       omit_output=args.omit_output,duplicate_key=args.duplicate_json_key,
                       huge_event=args.huge_event,flood_stderr=args.flood_stderr,
                       hang_seconds=args.hang_seconds)
        print(json.dumps(report,sort_keys=True))
        return 3 # NEVER authentic release success
    except (ValueError,OSError,TypeError,RuntimeError,subprocess.TimeoutExpired):
        print("UNTRUSTED_OR_INCOMPLETE_TOY_STOP",file=sys.stderr)
        return 4

if __name__=="__main__":
    raise SystemExit(main())
