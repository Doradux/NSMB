"""INVENTED source-only PowerPC toy: stream events at queue/commit/emission sites.

This is NOT the upstream C# translator and NEVER proves Nintendo provenance.
Write complete byte bodies to a caller-owned fresh temp directory only.
"""
from __future__ import annotations
from collections import deque
from hashlib import sha256
from pathlib import Path
import argparse
import json
import sys
import time

from scripts.phase16.luigi.fixtures import encode
from scripts.phase16.luigi.sidecar import digest
from scripts.phase17.luigi.producer import OriginProducer, DecodeFailure, MAX_FUNCS


def publish(source: bytes, map_bytes: bytes, config: bytes, destination: Path,
            run_nonce: str, *, abort_after: int = -1, early_output: bool = False,
            omit_output: bool = False, duplicate_key: bool = False,
            huge_event: bool = False, flood_stderr: bool = False) -> int:
    if len(run_nonce)!=32 or any(c not in "0123456789abcdef" for c in run_nonce):
        raise ValueError("toy observer run nonce must be 32 lowercase hexadecimal")
    if destination.exists():
        raise ValueError("invented output directory must not exist")
    if max(len(source),len(map_bytes),len(config))>2_000_000:
        raise ValueError("oversized synthetic fixture")
    toy=OriginProducer(source,map_bytes,config)
    # Negative-only cases: the observer MUST bound these untrusted streams.
    if flood_stderr:
        sys.stderr.buffer.write(b"X"*300_000)
        sys.stderr.buffer.flush()
    if huge_event:
        sys.stdout.buffer.write(b"{" + b"Z"*110_000)
        sys.stdout.buffer.flush()
        raise ValueError("deliberately oversized, unterminated event")
    output=destination
    output.mkdir(parents=True,exist_ok=False)
    seen={toy.root}
    toy.seen=seen
    tier={toy.root:"walk"}
    committed={}
    skipped=set()
    seq=0
    def event(kind,address,**rest):
        nonlocal seq
        row={"version":2,"runNonce":run_nonce,"seq":seq,"kind":kind,
             "address":address,**rest}
        # JSONL is emitted immediately; a different PROCESS observes stdout.
        line=encode(row)
        if duplicate_key and seq==2:
            # ADVERSARIAL ONLY: a JSON Unicode-escaped duplicate of seq.
            line=line.replace(b'"seq":2',b'"seq":2,"s\\u0065q":2',1)
        sys.stdout.buffer.write(line)
        sys.stdout.buffer.flush()
        seq+=1
        if abort_after>=0 and seq>=abort_after:
            raise ValueError("deliberate synthetic producer abort before completion")
    event("source_identity",toy.root,sourceSha256=digest(source),
          mapSha256=digest(map_bytes),configSha256=digest(config))
    event("root_declared",toy.root)
    for address in toy.seeds:event("map_seed_declared",address)
    def walk(queue):
        while queue:
            address=queue.popleft()
            current=tier[address]
            event("candidate_attempted",address,tier=current)
            try:
                words,targets=toy._decode(address)
            except DecodeFailure as exc:
                if current=="walk":
                    raise ValueError("required root walk failed") from exc
                skipped.add(address)
                event("candidate_skipped",address,reason="decode_error")
                continue
            committed[address]=tuple(words)
            if early_output and address==toy.root:
                # ADVERSARIAL ONLY: fictional pre-commit output observation.
                event("output_emitted",address,outputSha256=digest(b"forged early"))
            raw=b"".join(pc.to_bytes(4,"big")+ins.to_bytes(4,"big") for pc,ins in words)
            event("translation_committed",address,decodedSha256=digest(raw))
            for target in targets:
                if target in seen:continue
                seen.add(target)
                if len(seen)>MAX_FUNCS:raise ValueError("too many invented functions")
                tier[target]=current
                queue.append(target)
                event("target_discovered",target,parent=address,tier=current)
    walk(deque([toy.root]))
    for seed in toy.seeds:
        if seed in seen:
            event("candidate_deduplicated",seed,reason="already_visited")
            continue
        seen.add(seed)
        tier[seed]="speculative"
        walk(deque([seed]))
    rows=[]
    for address in sorted(committed):
        code=("// INVENTED PPC deferred output; NOT compiled Nintendo code\n"
              +f"// invented address offset {address-toy.root:04X}\n"
              +"".join(f"// {pc-toy.root:04X} {word:08X}\n"
                       for pc,word in committed[address])).encode("ascii")
        name=f"synthetic_{address:08x}.cpp"
        if not (omit_output and address==toy.root):
            (output/name).write_bytes(code)
        checksum=digest(code)
        rows.append({"entryPoint":address,"relativePath":name,"sha256":checksum})
        event("output_emitted",address,outputSha256=checksum)
    metadata=encode({"functions":rows,
                    "quality":{"unsupportedInstructionCount":0,"invalidSsaFunctionCount":0}})
    (output/"metadata.json").write_bytes(metadata)
    event("run_completed",toy.root,emittedCount=len(rows),
          skippedCount=len(skipped),metadataSha256=digest(metadata))
    return seq


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ("source","map","config","out","nonce"):
        parser.add_argument("--"+name,required=True)
    parser.add_argument("--abort-after",type=int,default=-1,
                        help="synthetic negative test ONLY")
    parser.add_argument("--inject-early-output",action="store_true",
                        help="synthetic adversarial negative ONLY")
    parser.add_argument("--omit-output",action="store_true",
                        help="synthetic adversarial negative ONLY")
    parser.add_argument("--duplicate-json-key",action="store_true",
                        help="synthetic adversarial negative ONLY")
    parser.add_argument("--huge-event",action="store_true")
    parser.add_argument("--flood-stderr",action="store_true")
    parser.add_argument("--hang-seconds",type=float,default=0)
    args=parser.parse_args(argv)
    try:
        for path in (args.source,args.map,args.config):
            if not Path(path).is_file():raise ValueError("missing toy input")
        if args.hang_seconds:
            time.sleep(args.hang_seconds)
        publish(Path(args.source).read_bytes(),Path(args.map).read_bytes(),
                Path(args.config).read_bytes(),Path(args.out),args.nonce,
                abort_after=args.abort_after,
                early_output=args.inject_early_output,omit_output=args.omit_output,
                duplicate_key=args.duplicate_json_key,
                huge_event=args.huge_event,flood_stderr=args.flood_stderr)
        return 3 # synthetic-only STOP, even after run_completed
    except (OSError,ValueError,UnicodeError,RuntimeError):
        print("TOY_PRODUCER_ABORT_STOP",file=sys.stderr)
        return 4

if __name__=="__main__":
    raise SystemExit(main())
