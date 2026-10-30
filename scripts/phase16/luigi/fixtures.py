"""All bytes/addresses here are newly invented. NEVER read ROM/DOL/REL."""
from __future__ import annotations
from dataclasses import replace
import json
import struct
from .sidecar import TrustedAnchors, FORMAT, PINNED_UPSTREAM, digest

ROOT=0x80004000
WALK=0x80004100
SEED=0x80004200
FROM_SEED=0x80004300
SKIP=0x80004400
SEMI=0x80004500
FAIL_DESCENDANT=0x80004600
BOUNDS=((0x80004000,0x80005000),)
RUN_ID="abcdeffedcba0123456789abcdef0123"
# Invented DOL-layout container: header and 4KiB of deterministic DATA,
# NOT original PPC or any Nintendo executable bytes; never executed.
SOURCE_ARRAY=bytearray(0x1100)
struct.pack_into(">I",SOURCE_ARRAY,0,0x100)
struct.pack_into(">I",SOURCE_ARRAY,0x48,0x80004000)
struct.pack_into(">I",SOURCE_ARRAY,0x90,0x1000)
struct.pack_into(">I",SOURCE_ARRAY,0xE0,0x80004000)
SOURCE_ARRAY[0x100:0x1100]=bytes(range(256))*16
SOURCE_BYTES=bytes(SOURCE_ARRAY)
SOURCE=digest(SOURCE_BYTES)
CONFIG_BYTES=b"synthetic config version1; not a game profile"
MAP_BYTES=(f"{SEED:08X} invented-seed\n{SKIP:08X} invented-skip\n{SEMI:08X} invented-semi\n").encode("ascii")
CONFIG=digest(CONFIG_BYTES)
MAP=digest(MAP_BYTES)


def encode(obj):
    return (json.dumps(obj,sort_keys=True,separators=(",",":"),ensure_ascii=True)+"\n").encode("ascii")


def fixture():
    emitted=(ROOT,WALK,SEED,FROM_SEED,SEMI)
    output={address:digest(b"synthetic public generated function"+address.to_bytes(4,"big")) for address in emitted}
    metadata=encode({"functions":[{"entryPoint":addr,"relativePath":f"synthetic_{addr:08x}.cpp","sha256":output[addr]} for addr in emitted],
                     "quality":{"unsupportedInstructionCount":0,"invalidSsaFunctionCount":0}})
    events=[]
    def event(kind,address,**extra):
        events.append({"seq":len(events),"kind":kind,"address":address,**extra})
    event("root",ROOT)
    for address in (SEED,SKIP,SEMI):event("map_seed",address)
    event("emit",ROOT,outputSha256=output[ROOT])
    event("discover",WALK,parent=ROOT)
    event("emit",WALK,outputSha256=output[WALK])
    event("emit",SEED,outputSha256=output[SEED])
    event("discover",FROM_SEED,parent=SEED)
    event("emit",FROM_SEED,outputSha256=output[FROM_SEED])
    event("skip",SKIP,reason="decode_error")
    event("emit",SEMI,outputSha256=output[SEMI])
    event("discover",FAIL_DESCENDANT,parent=SEMI)
    event("skip",FAIL_DESCENDANT,reason="lift_error")
    manifest={"format":FORMAT,"version":1,"runId":RUN_ID,"producerCommit":PINNED_UPSTREAM,
              "sourceSha256":SOURCE,"configSha256":CONFIG,"mapSha256":MAP,
              "metadataSha256":digest(metadata),"root":ROOT,
              "executableRanges":[{"start":start,"end":end} for start,end in BOUNDS],
              "mapSeeds":[SEED,SKIP,SEMI],"events":events}
    wire=encode(manifest)
    anchors=TrustedAnchors(sidecar_sha256=digest(wire),metadata_sha256=digest(metadata),
        source_sha256=SOURCE,config_sha256=CONFIG,map_sha256=MAP,
        executable_ranges=BOUNDS,upstream_commit=PINNED_UPSTREAM,root=ROOT,run_id=RUN_ID)
    return manifest,metadata,anchors


def reseal(manifest,metadata,anchor,**changed):
    """Only for adversarial TESTS: reseal with a dishonest independently pinned value.

    NO REAL TRUST ROOT. Recomputed hashes must never magically authenticate.
    """
    wire=encode(manifest)
    return wire,replace(anchor,sidecar_sha256=digest(wire),**changed)
