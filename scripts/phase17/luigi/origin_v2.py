"""Toy-only event stream v2: commit/discover BEFORE deferred final emission.

This mirrors the ORDER of publicly inspected C# stages, not their true
implementation. Source is newly invented PPC and NEVER original Wii.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import json

from scripts.phase16.luigi.fixtures import encode
from scripts.phase16.luigi.sidecar import digest
from .producer import OriginProducer, DecodeFailure, MAX_FUNCS


@dataclass(frozen=True)
class OriginV2:
    source: bytes
    map_bytes: bytes
    config: bytes
    trace: bytes
    metadata: bytes
    outputs: dict[str, bytes]
    producer_attested: bool = False
    authentic_release_eligible: bool = False


def generate_v2(source: bytes, map_bytes: bytes, config: bytes) -> OriginV2:
    toy = OriginProducer(source, map_bytes, config)
    trace: list[dict] = []
    decoded: dict[int, tuple] = {}
    seen = {toy.root}
    # Keep source-boundary checks tied to the SAME queue/discovery state.
    # Otherwise a decoder might consume a previously discovered function.
    toy.seen = seen
    tier = {toy.root: "walk"}
    outcomes: dict[int,str] = {}

    def event(kind,addr,**additional):
        trace.append({"seq":len(trace),"kind":kind,"address":addr,**additional})

    event("root_declared",toy.root)
    for addr in toy.seeds:
        event("map_seed_declared",addr)

    def walk(queue:deque[int]):
        while queue:
            addr=queue.popleft()
            active_tier=tier[addr]
            event("candidate_attempted",addr,tier=active_tier)
            try:
                words,targets=toy._decode(addr)
            except DecodeFailure as error:
                if active_tier=="walk":
                    raise ValueError("toy walked candidate failed (fatal)") from error
                outcomes[addr]="skip"
                event("candidate_skipped",addr,reason="decode_error")
                continue
            decoded[addr]=tuple(words)
            outcomes[addr]="committed"
            # COMMIT precedes discovery in the actual observed C# architecture.
            raw=b"".join(pc.to_bytes(4,"big")+word.to_bytes(4,"big") for pc,word in words)
            event("translation_committed",addr,decodedSha256=digest(raw))
            for target in targets:
                if target in seen:continue
                seen.add(target)
                if len(seen)>MAX_FUNCS:
                    raise ValueError("too many invented translation candidates")
                tier[target]=active_tier
                event("target_discovered",target,parent=addr,tier=active_tier)
                queue.append(target)

    walk(deque([toy.root]))
    for addr in toy.seeds:
        if addr in seen:
            event("candidate_deduplicated",addr,reason="already_visited")
            continue
        seen.add(addr)
        if len(seen)>MAX_FUNCS:
            raise ValueError("too many invented translation candidates")
        tier[addr]="speculative"
        walk(deque([addr]))
    # Deferred output wave: never issue a fictitious early "emit" at commit.
    files={}
    for addr in sorted(decoded):
        words=decoded[addr]
        body=("// INVENTED PPC deferred output; NOT compiled Nintendo code\n"
              +f"// invented address offset {addr-toy.root:04X}\n"
              +"".join(f"// {pc-toy.root:04X} {word:08X}\n"
                       for pc,word in words)).encode("ascii")
        name=f"synthetic_{addr:08x}.cpp"
        files[name]=body
        event("output_emitted",addr,outputSha256=digest(body))
    metadata=encode({"functions":[{"entryPoint":addr,
                                    "relativePath":f"synthetic_{addr:08x}.cpp",
                                    "sha256":digest(files[f"synthetic_{addr:08x}.cpp"])}
                                   for addr in sorted(decoded)],
                     "quality":{"unsupportedInstructionCount":0,
                                "invalidSsaFunctionCount":0}})
    event("run_completed",toy.root,emittedCount=len(decoded),
          skippedCount=sum(value=="skip" for value in outcomes.values()),
          metadataSha256=digest(metadata))
    wire=encode({"format":"nsmb-public-toy-origin-v2",
                 "version":2,"runId":toy.run_id,
                 "model":"invented-ppc-only-not-csharp",
                 "sourceSha256":digest(source),"mapSha256":digest(map_bytes),
                 "configSha256":digest(config),"metadataSha256":digest(metadata),
                 "events":trace})
    return OriginV2(source,map_bytes,config,wire,metadata,files)


def verify_v2(bundle:OriginV2) -> int:
    if type(bundle) is not OriginV2 or bundle.producer_attested or bundle.authentic_release_eligible:
        raise ValueError("invalid or fake toy attestation")
    actual=generate_v2(bundle.source,bundle.map_bytes,bundle.config)
    if bundle.trace!=actual.trace:
        raise ValueError("origin trace not equal to actual toy control-flow replay")
    if bundle.metadata!=actual.metadata:
        raise ValueError("origin metadata not equal to deferred emission")
    if type(bundle.outputs) is not dict or bundle.outputs!=actual.outputs:
        raise ValueError("origin emitted file bytes differ from replay")
    return len(json.loads(actual.trace)["events"])
