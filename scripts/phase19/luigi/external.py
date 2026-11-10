"""Read-only link check for Peach/Mario REAL new synthetic Wasm artifacts.

Separate from Luigi invented .cpp! A static ABI check is NOT evidence
that a browser guest clock call executed. Browser proof must be
independently run by Peach/QA against the same physical SHA.
"""
from __future__ import annotations
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import subprocess

from scripts.strict_translation_metadata import load_translation_json


def digest(body:bytes):return sha256(body).hexdigest()


def safe_read(parent:Path,name:str)->bytes:
    parts=Path(name).parts
    if not parts or any(x in ("","..",".") for x in parts) or Path(name).is_absolute():
        raise ValueError("relative allowlisted artifact/source path only")
    path=parent/name
    if parent.is_symlink() or any((parent/Path(*parts[:i])).is_symlink()
                                for i in range(1,len(parts)+1)):
        raise ValueError("symlink not allowed in source/artifact chain")
    if not path.is_file() or path.stat().st_size>10_000_000:
        raise ValueError("missing or oversized source/artifact")
    return path.read_bytes()


def verify_public_wasm_link(source_root:Path,artifact_root:Path,
                            *,expected_git_sha:str,expected_wasm_sha:str)->dict:
    if any(type(v) is not str or not re.fullmatch("[0-9a-f]{40,64}",v)
           for v in (expected_git_sha,expected_wasm_sha)):
        raise ValueError("separately pinned SHA arguments required")
    if len(expected_git_sha)!=40 or len(expected_wasm_sha)!=64:
        raise ValueError("incorrect Git or Wasm SHA width")
    raw=safe_read(artifact_root,"phase18_artifact_manifest.json")
    try:manifest=load_translation_json(raw.decode("utf-8"))
    except (ValueError,UnicodeError) as exc:raise ValueError("invalid manifest") from exc
    if type(manifest) is not dict or set(manifest)!={
        "schema","head","files","outputs","imports","exports","note"
    } or manifest["schema"]!="nsmb-phase18-synthetic-wasm-artifact-v1":
        raise ValueError("not a supported exact public artifact manifest")
    if manifest["head"]!=expected_git_sha:
        raise ValueError("public source checkout SHA mismatch")
    if (source_root/".git").exists():
        head=subprocess.run(["git","-C",str(source_root),"rev-parse","HEAD"],
             capture_output=True,text=True,timeout=8)
        if head.returncode!=0 or head.stdout.strip()!=expected_git_sha:
            raise ValueError("live checkout HEAD does not match separately pinned Git SHA")
    if type(manifest["files"]) is not dict or not manifest["files"]:
        raise ValueError("no pinned public sources")
    for relative,claimed in manifest["files"].items():
        if type(relative) is not str or type(claimed) is not str:
            raise ValueError("invalid source entry")
        if digest(safe_read(source_root,relative))!=claimed:
            raise ValueError("public source bytes differ from compiled manifest")
    if type(manifest["outputs"]) is not dict or set(manifest["outputs"])!={
        "frame_loop.wasm","frame_loop.mjs"}:
        raise ValueError("output inventory differs")
    wasm=safe_read(artifact_root,"frame_loop.wasm")
    mjs=safe_read(artifact_root,"frame_loop.mjs")
    if (digest(wasm)!=manifest["outputs"]["frame_loop.wasm"]
            or digest(mjs)!=manifest["outputs"]["frame_loop.mjs"]
            or digest(wasm)!=expected_wasm_sha):
        raise ValueError("Wasm/MJS physical bytes mismatch independently pinned digest")
    js=('const fs=require("fs"), b=fs.readFileSync(process.argv[1]);'
        'const m=new WebAssembly.Module(b);'
        'console.log(JSON.stringify({imports:WebAssembly.Module.imports(m),'
        'exports:WebAssembly.Module.exports(m)}));')
    env=os.environ.copy();env.pop("LD_LIBRARY_PATH",None);env.pop("LD_PRELOAD",None)
    child=subprocess.run(["node","-e",js,str(artifact_root/"frame_loop.wasm")],
                         capture_output=True,text=True,env=env,timeout=15)
    if child.returncode!=0:
        raise ValueError("actual Wasm module was not structurally valid")
    abi=json.loads(child.stdout)
    if abi["imports"]!=manifest["imports"] or abi["exports"]!=manifest["exports"]:
        raise ValueError("ABI imports/exports do not match physical Wasm")
    if any(x.get("name","").startswith("nsmbw_internal_test_forge")
           for x in abi["exports"]):
        raise ValueError("forbidden test helper Wasm export")
    return {"status":"PUBLIC_NEW_WASM_SOURCE_STATIC_LINK_STOP",
            "wasmSha256":digest(wasm),"mjsSha256":digest(mjs),
            "sourceGitSha":expected_git_sha,
            "sourceFileCount":len(manifest["files"]),
            "importCount":len(abi["imports"]),"exportCount":len(abi["exports"]),
            "guestCpuClockActuallyInvoked":False,
            "producerAttested":False,"authenticReleaseEligible":False}
