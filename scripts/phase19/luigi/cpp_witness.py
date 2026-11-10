"""Parent-side verification of C++ emission by an independent child.

A digest copied from a child JSON line is never sufficient. This
replays invented PPC bytes and compares the entire emitted C++ file.
"""
from __future__ import annotations
from hashlib import sha256
import json
from pathlib import Path

from scripts.strict_translation_metadata import load_translation_json
from .model import render_cpp,source_inputs


def verify_cpp_emission(event_line:bytes,generated_folder:Path,source:bytes,
                        map_bytes:bytes,config:bytes,nonce:str)->dict:
    if any(type(b) is not bytes for b in (event_line,source,map_bytes,config)):
        raise ValueError("raw bytes required")
    if len(event_line)>8192 or not event_line.endswith(b"\n"):
        raise ValueError("bounded completed event line required")
    try:
        evidence=load_translation_json(event_line.decode("utf-8"))
    except (UnicodeError,ValueError,json.JSONDecodeError) as exc:
        raise ValueError("invalid JSON emission record") from exc
    if type(evidence) is not dict or set(evidence)!={
        "version","kind","seq","runNonce","relativePath",
        "sourceSha256","mapSha256","configSha256","cppSha256",
        "cppBytes","producerAttested"
    }: raise ValueError("noncanonical C++ origin event")
    if (type(evidence["version"]) is not int or evidence["version"]!=1
            or evidence["kind"]!="generated_cpp_emitted"
            or type(evidence["seq"]) is not int or evidence["seq"]!=0
            or evidence["runNonce"]!=nonce or evidence["producerAttested"] is not False
            or evidence["relativePath"]!="invented_guest.cpp"):
        raise ValueError("untrusted origin event fields")
    if (source,map_bytes,config)!=source_inputs():
        raise ValueError("unsupported noninvented source")
    for key,body in (
        ("sourceSha256",source),("mapSha256",map_bytes),("configSha256",config)
    ):
        if evidence[key]!=sha256(body).hexdigest():
            raise ValueError("origin inputs differ from independently pinned files")
    if not generated_folder.is_dir() or generated_folder.is_symlink():
        raise ValueError("unsafe C++ emitter output directory")
    children=list(generated_folder.iterdir())
    if len(children)!=1 or children[0].name!="invented_guest.cpp":
        raise ValueError("extra or missing emitted C++")
    path=children[0]
    if path.is_symlink() or not path.is_file() or path.stat().st_size>200_000:
        raise ValueError("unsafe emitted C++ path")
    expected=render_cpp(source,map_bytes,config)
    actual=path.read_bytes()
    if actual!=expected:
        raise ValueError("emitted C++ differs from source replay")
    if (evidence["cppSha256"]!=sha256(actual).hexdigest()
            or type(evidence["cppBytes"]) is not int
            or evidence["cppBytes"]!=len(actual)):
        raise ValueError("emitted byte identity mismatch")
    return {"cppSha256":sha256(actual).hexdigest(),
            "sourceSha256":sha256(source).hexdigest(),
            "producerAttested":False,"authenticReleaseEligible":False}
