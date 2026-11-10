"""Byte-pinned invented source -> generated leaf C++ -> native & NEW Wasm.

All file paths under fresh /tmp only. Uses already cached offline Docker
Emscripten, no sudo/pulls/network. NEVER claims private W03 admission.
"""
from __future__ import annotations
from hashlib import sha256
import json
from pathlib import Path
import re
import secrets
import subprocess
import sys

from scripts.phase19.luigi.pipeline import child
from .abi import provenance,source_inputs
from .producer import expected_files
from .witness import verify
from .vectors import vectors

IMAGE="sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a"
FMT="nsmb-p20-ppc-lite-cpp-standalone-lineage-v1"
ROOT=Path(__file__).resolve().parents[3]
COMPILER_FLAGS=["-std=c++17","-O2","-s","STANDALONE_WASM=1",
                "--no-entry","-Wl,--export=nsmb_p20_leaf_probe",
                "-Wl,--export=nsmb_p20_leaf_source_tag"]
NATIVE_FLAGS=["-std=c++17","-O2","-Wall","-Wextra",
              "-Werror","-pedantic","-DNSMB_P20_TOY_MAIN"]
ARTIFACTS=(
    "leaf/source.dol","leaf/inputs.map","leaf/config.json",
    "leaf/toy_leaf_abi.hpp","leaf/toy_leaf_generated.cpp",
    "leaf/leaf_metadata.json","origin.jsonl","native/leaf_native",
    "wasm/leaf.wasm","vectors.json","node.json"
)


def sha(data:bytes)->str:return sha256(data).hexdigest()


def safe(root:Path,name:str)->bytes:
    if name not in ARTIFACTS and name!="manifest.json":
        raise ValueError("artifact path not allowlisted")
    parts=Path(name).parts
    if root.is_symlink() or any(
            (root/Path(*parts[:i])).is_symlink() for i in range(1,len(parts)+1)):
        raise ValueError("symlink artifact ancestor denied")
    p=root/name
    if not p.is_file() or p.stat().st_size>5_000_000:
        raise ValueError("missing/oversized artifact")
    return p.read_bytes()


def source_test_commit(source:bytes,wasm:bytes)->dict:
    return {"sourceSha":sha(source),"expectedWasmSha":sha(wasm),
            "vectors":vectors()}


def invoke_node(wasm:Path,source:bytes)->dict:
    import tempfile
    with tempfile.TemporaryDirectory(prefix="luigi-p20-node-") as tmp:
        commit=Path(tmp)/"oracle.json"
        commit.write_text(json.dumps(source_test_commit(source,wasm.read_bytes()),
                                     sort_keys=True),encoding="utf8")
        result=child(["node",str(ROOT/"scripts/phase20/luigi/verify_wasm.mjs"),
                      "--wasm",str(wasm),"--commit",str(commit)],timeout=25)
    if result.returncode!=3:
        raise ValueError("dynamic standalone Wasm did not report structural STOP")
    result=json.loads(result.stdout)
    if (result.get("producerAttested") is not False
            or result.get("authenticReleaseEligible") is not False):
        raise ValueError("forged release")
    return result


def native_oracle(binary:Path)->int:
    result_count=0
    for entry in vectors():
        args=entry["args"]
        result=child([str(binary),*(str(x) for x in args)],timeout=6)
        got=[int(x) for x in result.stdout.split()]
        if got!=entry["expect"]:
            raise ValueError("real native translated leaf != byte-derived oracle")
        result_count+=1
    return result_count


def create_package(dest:Path)->dict:
    if not dest.is_absolute() or not dest.resolve().is_relative_to(Path("/tmp")):
        raise ValueError("fresh absolute scratch directory under /tmp required")
    if dest.exists() or dest.is_symlink():
        raise ValueError("do not overwrite an existing artifact")
    dest.mkdir(parents=True,exist_ok=False)
    for name in ("native","wasm"):
        (dest/name).mkdir()
    source,map_bytes,config=source_inputs()
    pin_sha=sha(expected_files()["toy_leaf_generated.cpp"])
    nonce=secrets.token_hex(16)
    producer=child([sys.executable,"-B","-m","scripts.phase20.luigi.producer",
         "--directory",str(dest/"leaf"),"--nonce",nonce],timeout=20)
    if producer.returncode!=3:
        raise ValueError("toy producer must not return authentic success")
    observed=verify(dest/"leaf",producer.stdout,nonce,pin_sha)
    if observed["producerAttested"]:
        raise ValueError("observed fake origin grant")
    (dest/"origin.jsonl").write_bytes(producer.stdout)
    (dest/"vectors.json").write_text(
        json.dumps(vectors(),separators=(",",":")),encoding="utf8")
    native=dest/"native/leaf_native"
    child(["g++",*NATIVE_FLAGS,str(dest/"leaf/toy_leaf_generated.cpp"),
           "-o",str(native)],timeout=60)
    native_oracle(native)
    wasm=dest/"wasm/leaf.wasm"
    cmd=["docker","run","--rm","--pull","never","--network","none",
         "--cpus=2","--memory=4g","-v",f"{dest/'leaf'}:/input:ro",
         "-v",f"{dest/'wasm'}:/output:rw","-w","/input",IMAGE,
         "em++",*COMPILER_FLAGS,"/input/toy_leaf_generated.cpp",
         "-o","/output/leaf.wasm"]
    child(cmd,timeout=105)
    proof=invoke_node(wasm,source)
    (dest/"node.json").write_text(
        json.dumps(proof,sort_keys=True,separators=(",",":")),encoding="utf8")
    head=child(["git","rev-parse","HEAD"]).stdout.decode().strip()
    tree=child(["git","rev-parse","HEAD^{tree}"]).stdout.decode().strip()
    manifest={
        "format":FMT,"version":1,"runNonce":nonce,
        "git":{"head":head,"tree":tree},
        "source":provenance(),
        "files":{name:{"sha256":sha(safe(dest,name)),"bytes":len(safe(dest,name))}
                 for name in ARTIFACTS},
        "compiler":{"imageDigest":IMAGE,"sourceMount":"read-only",
                    "network":"none","wasmFlags":COMPILER_FLAGS,
                    "nativeFlags":NATIVE_FLAGS},
        "abi":{"imports":0,"exports":proof["abiExports"],
               "vectors":proof["vectors"],"checks":proof["checks"]},
        "producerAttested":False,"authenticReleaseEligible":False,
        "realW03SchedulerInvoked":False
    }
    (dest/"manifest.json").write_text(json.dumps(
        manifest,sort_keys=True,separators=(",",":")),encoding="utf8")
    out=verify_package(dest,sha((dest/"manifest.json").read_bytes()),
                       nonce,sha(wasm.read_bytes()))
    return {"directory":str(dest),"runNonce":nonce,**out}


def verify_package(root:Path,expected_manifest_sha:str,
                   expected_nonce:str,expected_wasm_sha:str)->dict:
    """External compare commitments, then rerun REAL native and Wasm code.

    All commitments are controlled by the caller. This proves invented
    consistency ONLY, never an authenticated producer or W03 grant.
    """
    from scripts.strict_translation_metadata import load_translation_json
    if type(expected_manifest_sha) is not str or not re.fullmatch("[0-9a-f]{64}",expected_manifest_sha):
        raise ValueError("external manifest SHA required")
    if type(expected_nonce) is not str or not re.fullmatch("[0-9a-f]{32}",expected_nonce):
        raise ValueError("external nonce required")
    if type(expected_wasm_sha) is not str or not re.fullmatch("[0-9a-f]{64}",expected_wasm_sha):
        raise ValueError("external wasm SHA required")
    raw=safe(root,"manifest.json")
    if sha(raw)!=expected_manifest_sha:
        raise ValueError("manifest independently pinned SHA differs")
    try:data=load_translation_json(raw.decode("utf8"))
    except (ValueError,UnicodeError) as exc:
        raise ValueError("invalid canonical manifest") from exc
    if type(data) is not dict or set(data)!={
        "format","version","runNonce","git","source","files",
        "compiler","abi","producerAttested","authenticReleaseEligible",
        "realW03SchedulerInvoked"
    } or data["format"]!=FMT or type(data["version"]) is not int or data["version"]!=1:
        raise ValueError("unsupported or forged schema")
    if (data["runNonce"]!=expected_nonce or data["producerAttested"] is not False
            or data["authenticReleaseEligible"] is not False
            or data["realW03SchedulerInvoked"] is not False):
        raise ValueError("nonce replay or forged W03/producer grant")
    if type(data["git"]) is not dict or set(data["git"])!={"head","tree"} or any(
       type(x) is not str or not re.fullmatch("[0-9a-f]{40}",x)
       for x in data["git"].values()):
        raise ValueError("Git source SHA fields invalid")
    if data["source"]!=provenance():
        raise ValueError("invented source metadata differs from independent decoder")
    if type(data["files"]) is not dict or set(data["files"])!=set(ARTIFACTS):
        raise ValueError("manifest physical inventory mismatch")
    for folder in ("leaf","native","wasm"):
        if (root/folder).is_symlink() or not (root/folder).is_dir():
            raise ValueError("symlink or missing artifact parent")
    present={p.relative_to(root).as_posix() for p in root.rglob("*")
             if p.is_file() or p.is_symlink()}
    if present!=set(ARTIFACTS)|{"manifest.json"}:
        raise ValueError("extra/missing physical artifact")
    for name in ARTIFACTS:
        described=data["files"][name]
        if type(described) is not dict or set(described)!={"sha256","bytes"}:
            raise ValueError("invalid file field")
        physical=safe(root,name)
        if (described["sha256"]!=sha(physical)
                or type(described["bytes"]) is not int
                or described["bytes"]!=len(physical)):
            raise ValueError("physical artifact SHA/size mismatch")
    for name,body in expected_files().items():
        if safe(root,"leaf/"+name)!=body:
            raise ValueError("source-to-emitted C++ fails independent byte replay")
    event=safe(root,"origin.jsonl")
    observed=verify(root/"leaf",event,expected_nonce,
                    sha(expected_files()["toy_leaf_generated.cpp"]))
    if observed["producerAttested"]:
        raise ValueError("untrusted origin")
    if (safe(root,"wasm/leaf.wasm")==b"" or
            sha(safe(root,"wasm/leaf.wasm"))!=expected_wasm_sha):
        raise ValueError("physical wasm differs from independent expected digest")
    compiler=data["compiler"]
    if type(compiler) is not dict or compiler!={
        "imageDigest":IMAGE,"sourceMount":"read-only","network":"none",
        "wasmFlags":COMPILER_FLAGS,"nativeFlags":NATIVE_FLAGS
    }:
        raise ValueError("Docker build recipe not the pinned offline compiler")
    expected_vectors=json.dumps(vectors(),separators=(",",":")).encode()
    if safe(root,"vectors.json")!=expected_vectors:
        raise ValueError("source-derived oracle vector payload changed")
    native_count=native_oracle(root/"native/leaf_native")
    rerun_node=invoke_node(root/"wasm/leaf.wasm",source_inputs()[0])
    if safe(root,"node.json")!=json.dumps(
            rerun_node,sort_keys=True,separators=(",",":")).encode():
        raise ValueError("dynamic Node report differs from actual compiled wasm")
    if data["abi"]!={"imports":0,"exports":rerun_node["abiExports"],
                     "vectors":rerun_node["vectors"],"checks":rerun_node["checks"]}:
        raise ValueError("physical ABI imports/exports do not match")
    return {"status":"P20_INVENTED_CXX_TO_WASM_VERIFIED_STOP",
            "manifestSha256":sha(raw),"wasmSha256":expected_wasm_sha,
            "sourceSha256":provenance()["sourceSha256"],
            "nativeOracleVectors":native_count,
            "wasmOracleChecks":rerun_node["checks"],"fileCount":len(ARTIFACTS),
            "producerAttested":False,"authenticReleaseEligible":False,
            "realW03SchedulerInvoked":False}
