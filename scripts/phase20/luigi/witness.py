"""Separate observer reproduces actual Phase20 source+generated C++ bytes.

This proves *deterministic invented toy* source lineage, not independently
signed original game or real C# producer. Nonce and SHA supplied by
caller are comparisons, not authority.
"""
from __future__ import annotations
from hashlib import sha256
import json
from pathlib import Path
import re
from scripts.strict_translation_metadata import load_translation_json
from .producer import expected_files

MAX_EVENT=24000


def h(body:bytes)->str:return sha256(body).hexdigest()


def strict(body:bytes):
    try:return load_translation_json(body.decode("utf-8"))
    except (ValueError,UnicodeError) as exc:
        raise ValueError("malformed or duplicate-key observer event") from exc


def verify(dest:Path,event:bytes,expected_nonce:str,
           expected_cpp_sha:str)->dict:
    if not isinstance(event,bytes) or len(event)>MAX_EVENT or not event.endswith(b"\n"):
        raise ValueError("incomplete oversized event stream")
    wire=strict(event)
    if type(wire) is not dict or set(wire)!={
        "format","version","seq","runNonce","files",
        "producerAttested","authenticReleaseEligible"
    } or wire["format"]!="nsmb-p20-invented-leaf-emission-v1":
        raise ValueError("noncanonical event schema")
    if type(wire["version"]) is not int or wire["version"]!=1 or (
        type(wire["seq"]) is not int or wire["seq"]!=0):
        raise ValueError("event version/sequence")
    if type(expected_nonce) is not str or not re.fullmatch("[0-9a-f]{32}",expected_nonce):
        raise ValueError("independent challenge syntax")
    if wire["runNonce"]!=expected_nonce:
        raise ValueError("replayed or forged challenge")
    if wire["producerAttested"] is not False or wire["authenticReleaseEligible"] is not False:
        raise ValueError("forged producer authority")
    generated=expected_files()
    cpp=generated["toy_leaf_generated.cpp"]
    if type(expected_cpp_sha) is not str or h(cpp)!=expected_cpp_sha:
        raise ValueError("independently pinned CPP source mismatch")
    if not dest.is_dir() or dest.is_symlink():
        raise ValueError("unsafe emitted directory")
    actual={p.name for p in dest.iterdir()}
    if actual!=set(generated):
        raise ValueError("unexpected/missing output file")
    if type(wire["files"]) is not dict or set(wire["files"])!=set(generated):
        raise ValueError("emission inventory differs")
    for name,expected in generated.items():
        path=dest/name
        if path.is_symlink() or not path.is_file() or path.stat().st_size>100_000:
            raise ValueError("symlink/oversized output")
        body=path.read_bytes()
        if body!=expected:
            raise ValueError("output differs from invented PPC retranslation")
        if wire["files"][name]!={"sha256":h(expected),"bytes":len(expected)}:
            raise ValueError("emission digest/size claim falsified")
    return {
        "status":"P20_INVENTED_SOURCE_TO_CPP_VERIFIED_STOP",
        "sourceSha256":h(generated["source.dol"]),
        "cppSha256":h(cpp),"headerSha256":h(generated["toy_leaf_abi.hpp"]),
        "fileCount":len(generated),"producerAttested":False,
        "authenticReleaseEligible":False
    }
