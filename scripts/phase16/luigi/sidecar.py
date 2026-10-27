"""Synthetic-only source-bound event-model checker. NOT PRODUCER AUTHENTICATION."""
from __future__ import annotations
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
import re
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from strict_translation_metadata import load_translation_json, parse_translation_metadata, quality_clean, strict_uint32

FORMAT = "nsmb-public-synthetic-provenance"
PINNED_UPSTREAM = "20f0158dd1d96bd94f821adf80ee361e4fbd414e"
SHA = re.compile(r"^[0-9a-f]{64}$")
RUN = re.compile(r"^[0-9a-f]{32}$")
MAX_BYTES = 2_000_000
MAX_EVENTS = 20_000

def digest(content: bytes) -> str:
    return sha256(content).hexdigest()

def check_sha(value, field):
    if type(value) is not str or not SHA.fullmatch(value):
        raise ValueError(f"{field}: invalid sha256 syntax")
    return value

def shape(value, keys, field):
    if type(value) is not dict or set(value) != set(keys):
        raise ValueError(f"{field}: incorrect schema keys")
    return value

def u32(value, field):
    return strict_uint32(value, field=field)

@dataclass(frozen=True)
class TrustedAnchors:
    # Pinned by an INDEPENDENT trusted party; passing self-copied values is no proof.
    sidecar_sha256: str
    metadata_sha256: str
    source_sha256: str
    config_sha256: str
    map_sha256: str
    executable_ranges: tuple[tuple[int, int], ...]
    upstream_commit: str
    root: int
    run_id: str

@dataclass(frozen=True)
class StructuralVerdict:
    translated_count: int
    recursive_count: int
    map_skipped_count: int
    speculative_descendants_skipped: int
    quality_clean: bool
    byte_integrity_pinned: bool = True
    producer_attested: bool = False
    authentic_release_eligible: bool = False

def verify(sidecar_bytes: bytes, metadata_bytes: bytes, anchors: TrustedAnchors, *, map_bytes: bytes, config_bytes: bytes) -> StructuralVerdict:
    if any(type(b) is not bytes for b in (sidecar_bytes,metadata_bytes,map_bytes,config_bytes)):
        raise ValueError("raw bytes required")
    if max(map(len,(sidecar_bytes,metadata_bytes,map_bytes,config_bytes))) > MAX_BYTES:
        raise ValueError("evidence size exceeds bound")
    for name in ("sidecar_sha256","metadata_sha256","source_sha256","config_sha256","map_sha256"):
        check_sha(getattr(anchors,name),"anchor "+name)
    if type(anchors.run_id) is not str or not RUN.fullmatch(anchors.run_id):
        raise ValueError("anchor run ID invalid")
    if type(anchors.upstream_commit) is not str or not re.fullmatch(r"[0-9a-f]{40}",anchors.upstream_commit):
        raise ValueError("anchor commit invalid")
    root_expected=u32(anchors.root,"anchor root")
    if digest(sidecar_bytes)!=anchors.sidecar_sha256 or digest(metadata_bytes)!=anchors.metadata_sha256:
        raise ValueError("pinned evidence bytes changed")
    if digest(map_bytes)!=anchors.map_sha256 or digest(config_bytes)!=anchors.config_sha256:
        raise ValueError("MAP/config file bytes do not match externally pinned hashes")
    try:
        manifest=load_translation_json(sidecar_bytes.decode("utf-8"))
        metadata=parse_translation_metadata(metadata_bytes.decode("utf-8"))
    except UnicodeError as exc:
        raise ValueError("evidence not UTF-8") from exc
    shape(manifest,("format","version","runId","producerCommit","sourceSha256",
        "configSha256","mapSha256","metadataSha256","root","executableRanges",
        "mapSeeds","events"),"manifest")
    if manifest["format"]!=FORMAT or type(manifest["version"]) is not int or manifest["version"]!=1:
        raise ValueError("unknown producer-sidecar schema/version")
    if manifest["runId"]!=anchors.run_id or manifest["producerCommit"]!=PINNED_UPSTREAM or manifest["producerCommit"]!=anchors.upstream_commit:
        raise ValueError("run identity or producer commit mismatch")
    if check_sha(manifest["sourceSha256"],"source digest")!=anchors.source_sha256:
        raise ValueError("source identity mismatch")
    if check_sha(manifest["metadataSha256"],"metadata digest")!=digest(metadata_bytes):
        raise ValueError("metadata binding mismatch")
    if check_sha(manifest["configSha256"],"config digest")!=anchors.config_sha256:
        raise ValueError("config evidence mismatch")
    if check_sha(manifest["mapSha256"],"MAP digest")!=anchors.map_sha256:
        raise ValueError("MAP evidence mismatch")
    root=u32(manifest["root"],"root")
    if root!=root_expected:raise ValueError("root identity mismatch")
    bounds=manifest["executableRanges"]
    if type(bounds) is not list or not 1<=len(bounds)<=18:
        raise ValueError("invalid executable section list")
    sections=[]
    for part in bounds:
        shape(part,("start","end"),"section")
        low=u32(part["start"],"section start"); high=u32(part["end"],"section end")
        if low>=high:raise ValueError("bad executable section range")
        sections.append((low,high))
    sections.sort()
    if tuple(sections)!=anchors.executable_ranges:
        raise ValueError("declared section ranges differ from independent witness")
    if any(y[0]<x[1] for x,y in zip(sections,sections[1:])):
        raise ValueError("overlapping declared executable sections")
    def inside(address):
        return any(lo<=address<hi for lo,hi in sections)
    if not inside(root):raise ValueError("root outside executable range")
    seeds=manifest["mapSeeds"]
    if type(seeds) is not list or len(seeds)>MAX_EVENTS:
        raise ValueError("invalid MAP seed inventory")
    for address in seeds:
        u32(address,"seed")
        if not inside(address):raise ValueError("seed outside executable range")
    if len(seeds)!=len(set(seeds)):raise ValueError("duplicate MAP seeds")
    # Bind the claimed inventory to actual supplied PUBLIC SYNTHETIC MAP bytes.
    # This remains a strict subset; a real producer would require an
    # instrumented FunctionMap.Parse event stream with its exact canonical rules.
    try:
        source_map=map_bytes.decode("utf-8")
    except UnicodeError as exc:
        raise ValueError("MAP input is not UTF-8") from exc
    real_seeds=[]
    for line in source_map.split("\n"):
        line=line.strip(" \t\r")
        if not line or line.startswith("#"):
            continue
        parts=line.split(" ",1)
        address=parts[0].split("\t",1)[0]
        if not re.fullmatch(r"[0-9a-fA-F]{1,8}",address):
            raise ValueError("MAP input syntax invalid")
        real_seeds.append(int(address,16))
    if real_seeds!=seeds:
        raise ValueError("MAP inventory not actually present in pinned MAP file")
    events=manifest["events"]
    if type(events) is not list or not 1<=len(events)<=MAX_EVENTS:
        raise ValueError("missing/oversized event stream")
    kinds={"seq","kind","address"}
    root_kind=shape(events[0],kinds,"root event")
    if root_kind["kind"]!="root" or root_kind["address"]!=root or type(root_kind["seq"]) is not int or root_kind["seq"]!=0:
        raise ValueError("first producer event must be configured root")
    for i,seed in enumerate(seeds,1):
        if len(events)<=i:raise ValueError("missing MAP declaration event")
        obj=shape(events[i],kinds,"MAP event")
        if type(obj["seq"]) is not int or obj["seq"]!=i or obj["kind"]!="map_seed" or obj["address"]!=seed:
            raise ValueError("seed event differs from MAP inventory")
    # Root takes precedence if MAP also names it. All other MAP seeds start
    # speculative. Descendants inherit the parent's exact provenance tier.
    tier={root:"walk"}
    tier.update({seed:"speculative" for seed in seeds if seed!=root})
    outcome={}
    recursive_count=0
    skips=set()
    for i,e in enumerate(events[len(seeds)+1:],len(seeds)+1):
        if type(e) is not dict or type(e.get("seq")) is not int or e["seq"]!=i:
            raise ValueError("invalid event sequence or type")
        kind=e.get("kind")
        address=u32(e.get("address"),"event address")
        if not inside(address):raise ValueError("event outside executable range")
        if kind=="discover":
            shape(e,("seq","kind","address","parent"),"discovery")
            parent=u32(e["parent"],"discovery parent")
            if outcome.get(parent)!="emit":
                raise ValueError("uncommitted discovery parent")
            if address in tier:
                # MAP entries are only speculative seed *candidates*. If
                # discovered by the required root walk before their own
                # attempt, C# visited.Add() suppresses speculative enqueue.
                # Reject any late, already-committed, cyclic or counterfeit
                # promotion. An unproven speculative edge is NOT sufficient.
                if (address not in seeds or address==root
                        or address in outcome or tier[address]!="speculative"
                        or tier[parent]!="walk"):
                    raise ValueError("duplicate or unjustified promotion target")
                tier[address]="walk"
            else:
                tier[address]=tier[parent]
            recursive_count+=1
        elif kind=="emit":
            shape(e,("seq","kind","address","outputSha256"),"emission")
            check_sha(e["outputSha256"],"emission output hash")
            if address not in tier or address in outcome:
                raise ValueError("emission without pending source or duplicate")
            outcome[address]="emit"
        elif kind=="skip":
            shape(e,("seq","kind","address","reason"),"failed speculative attempt")
            if address not in tier or address in outcome or tier[address]!="speculative":
                raise ValueError("non-speculative or duplicate skip")
            if type(e["reason"]) is not str or e["reason"] not in ("decode_error","lift_error"):
                raise ValueError("missing/invalid failure class")
            outcome[address]="skip";skips.add(address)
        else:
            raise ValueError("unrecognized producer event")
    if set(tier)!=set(outcome):
        raise ValueError("pending attempts with no outcome")
    emitted={key for key,value in outcome.items() if value=="emit"}
    if root not in emitted or emitted!=set(metadata["addresses"]):
        raise ValueError("producer emissions do not match metadata")
    hashes={}
    paths=set()
    for row in metadata["functions"]:
        if "sha256" not in row or "relativePath" not in row:
            raise ValueError("missing function output digest and path")
        h=check_sha(row["sha256"],"output digest")
        path=row["relativePath"]
        if type(path) is not str or not path or path.startswith("/") or "\\" in path or any(x in ("",".","..") for x in path.split("/")):
            raise ValueError("unsafe or missing output path")
        if path.casefold() in paths:
            raise ValueError("output path collision")
        paths.add(path.casefold())
        hashes[row["entryPoint"]]=h
    for event in events:
        if event["kind"]=="emit" and hashes[event["address"]]!=event["outputSha256"]:
            raise ValueError("emission hash differs from metadata output")
    # Not a real C# producer instrumented run; hashes are *integrity only*.
    return StructuralVerdict(
        translated_count=len(emitted),
        recursive_count=recursive_count,
        map_skipped_count=len(skips.intersection(seeds)),
        speculative_descendants_skipped=len(skips.difference(seeds)),
        quality_clean=quality_clean(metadata),
        producer_attested=False,
        authentic_release_eligible=False,
    )
