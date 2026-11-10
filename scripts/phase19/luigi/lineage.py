"""Fail-closed MULTIFILE toy lineage, never an authentic producer attestor.

A self-signed digest proves nothing; caller provides separate manifest SHA
and this checker verifies all physical bytes plus dynamic Wasm behavior.
"""
from __future__ import annotations
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
import os
import tempfile

from scripts.strict_translation_metadata import load_translation_json
from scripts.phase17.luigi.producer import OriginProducer
from .model import source_inputs,render_cpp,reference_run
from .cpp_witness import verify_cpp_emission

FORMAT="nsmb-invented-artifact-lineage"
IMAGE="sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a"
FILES=("inputs/source.dol","inputs/inputs.map","inputs/config.json",
       "generated/invented_guest.cpp","native/toy_native",
       "wasm/invented_guest.wasm","witness.json","cpp_origin.json","node.json",
       "pins.json")
MAX_FILE=5_000_000
ROOT=Path(__file__).resolve().parents[3]
PIN_FILES={
 "toyModel":"scripts/phase19/luigi/model.py",
 "toyEmitter":"scripts/phase19/luigi/cpp_producer.py",
 "cppVerifier":"scripts/phase19/luigi/cpp_witness.py",
 "lineageVerifier":"scripts/phase19/luigi/lineage.py",
 "wasmVerifier":"scripts/phase19/luigi/verify_wasm.mjs",
 "phase18Producer":"scripts/phase18/luigi/producer_stream.py",
 "phase18Witness":"scripts/phase18/luigi/witness.py"
}
VECTORS=tuple({"entry":offset,"initial":value,
               "expected":reference_run(*source_inputs(),offset,value)}
              for offset in (0,32,64,160,224,768) for value in (0,1,100,1000))


def h(data:bytes)->str:return sha256(data).hexdigest()


def read_safe(root:Path,rel:str)->bytes:
    if rel not in FILES and rel!="manifest.json":
        raise ValueError("unknown or unsafe manifest relative path")
    p=root/rel
    # Check EACH path component, not merely final leaf: parent symlinks
    # can redirect an apparently ordinary filename out of the package.
    if root.is_symlink() or any((root/Path(*Path(rel).parts[:i])).is_symlink()
                                for i in range(1,len(Path(rel).parts)+1)):
        raise ValueError("symlink in evidence path")
    if p.is_symlink() or not p.is_file():
        raise ValueError("symlink/missing emitted artifact")
    if p.stat().st_size>MAX_FILE:
        raise ValueError("oversized emitted artifact")
    return p.read_bytes()


def strict_json(body:bytes):
    try:return load_translation_json(body.decode("utf-8"))
    except (ValueError,UnicodeError) as exc:
        raise ValueError("invalid evidence JSON") from exc


def document(root:Path,nonce:str,git_sha:str,tree_sha:str,toolpins:dict,abi:dict)->dict:
    source,map_bytes,config=(read_safe(root,k) for k in FILES[:3])
    if (source,map_bytes,config)!=source_inputs():
        raise ValueError("toy document must refer to exclusively invented bytes")
    report=strict_json(read_safe(root,"witness.json"))
    if report.get("status")!="TOY_OBSERVED_REPLAY_STOP" or report.get("eventCount")!=34:
        raise ValueError("Phase18 independent process report not valid toy status")
    check=verify_cpp_emission(read_safe(root,"cpp_origin.json"),
                              root/"generated",source,map_bytes,config,nonce)
    if check["producerAttested"]:
        raise ValueError("invalid producer claim")
    hashes={}
    for rel in FILES:
        body=read_safe(root,rel)
        hashes[rel]={"sha256":h(body),"bytes":len(body)}
    return {
        "format":FORMAT,"version":1,
        "runNonce":nonce,
        "sourceRunId":OriginProducer(source,map_bytes,config).run_id,
        "git":{"head":git_sha,"tree":tree_sha},
        "upstreamCsPin":"20f0158dd1d96bd94f821adf80ee361e4fbd414e",
        "producerCodePins":toolpins,
        "files":hashes,
        "compiler":{
            "imageDigest":IMAGE,"toolchain":"emscripten/emsdk 6.0.13 cached offline",
            "network":"none","sourceMount":"read-only","outputMount":"temporary writable",
            "nativeFlags":["-std=c++17","-O2","-Wall","-Wextra","-Werror","-pedantic"],
            "wasmFlags":["-std=c++17","-O2","-s","STANDALONE_WASM=1","--no-entry",
                         "-Wl,--export=nsmb_toy_execute",
                         "-Wl,--export=nsmb_toy_function_count",
                         "-Wl,--export=nsmb_toy_source_tag"]},
        "abi":abi,
        "provenance":{"toyReplay":True,"producerAttested":False,
                      "authenticReleaseEligible":False,
                      "externalTrustedWitnessPresent":False}}


def verify_package(root:Path,expected_manifest_sha:str,*,check_runtime:bool=True,
                   expected_nonce:str|None=None,expected_wasm_sha:str|None=None)->dict:
    if type(expected_manifest_sha) is not str or not re.fullmatch("[0-9a-f]{64}",expected_manifest_sha):
        raise ValueError("external manifest commitment missing or invalid")
    raw=read_safe(root,"manifest.json")
    if h(raw)!=expected_manifest_sha:
        raise ValueError("manifest differs from independently supplied digest")
    data=strict_json(raw)
    if type(data) is not dict or set(data)!={
        "format","version","runNonce","sourceRunId","git","upstreamCsPin",
        "producerCodePins","files","compiler","abi","provenance"
    } or data["format"]!=FORMAT or type(data["version"]) is not int or data["version"]!=1:
        raise ValueError("unsupported lineage manifest")
    if type(data["runNonce"]) is not str or not re.fullmatch("[0-9a-f]{32}",data["runNonce"]):
        raise ValueError("invalid witness challenge")
    if expected_nonce is not None and (type(expected_nonce) is not str
                                       or data["runNonce"]!=expected_nonce):
        raise ValueError("source-run challenge replay against external observer")
    if expected_wasm_sha is not None and (type(expected_wasm_sha) is not str
            or not re.fullmatch("[0-9a-f]{64}",expected_wasm_sha)
            or h(read_safe(root,"wasm/invented_guest.wasm"))!=expected_wasm_sha):
        raise ValueError("compiled wasm differs from separately pinned build artifact")
    trust=data["provenance"]
    if type(trust) is not dict or trust!={"toyReplay":True,"producerAttested":False,
            "authenticReleaseEligible":False,"externalTrustedWitnessPresent":False}:
        raise ValueError("forged authentic producer authority")
    if data["upstreamCsPin"]!="20f0158dd1d96bd94f821adf80ee361e4fbd414e":
        raise ValueError("public C# source pin mismatched")
    if type(data["git"]) is not dict or set(data["git"])!={"head","tree"} or any(
        type(x) is not str or not re.fullmatch("[0-9a-f]{40}",x)
        for x in data["git"].values()):
        raise ValueError("invalid source Git identity")
    if (type(data["producerCodePins"]) is not dict or
            data["producerCodePins"]!={key:h((ROOT/path).read_bytes())
                for key,path in PIN_FILES.items()}):
        raise ValueError("checked producer/verifier source differs from byte pins")
    if type(data["files"]) is not dict or set(data["files"])!=set(FILES):
        raise ValueError("incomplete artifact inventory")
    if any((root/part).is_symlink() for part in ("inputs","generated","native","wasm")):
        raise ValueError("symlink in parent artifact directory")
    all_paths={p.relative_to(root).as_posix() for p in root.rglob("*")
               if p.is_file() or p.is_symlink()}
    if all_paths!=set(FILES)|{"manifest.json"}:
        raise ValueError("unexpected or missing artifact file in physical package")
    for key in FILES:
        entry=data["files"][key]
        if type(entry) is not dict or set(entry)!={"sha256","bytes"}:
            raise ValueError("artifact descriptor malformed")
        body=read_safe(root,key)
        if type(entry["bytes"]) is not int or entry["bytes"]!=len(body) or entry["sha256"]!=h(body):
            raise ValueError("file digest/size disagrees with actual artifact bytes")
    source,map_bytes,config=[read_safe(root,k) for k in FILES[:3]]
    pins=strict_json(read_safe(root,"pins.json"))
    if pins!={"sourceSha256":h(source),"mapSha256":h(map_bytes),
            "configSha256":h(config),
            "observerCodeSha256":h((ROOT/PIN_FILES["phase18Producer"]).read_bytes())}:
        raise ValueError("precommitted toy input/producer byte pins differ")
    if (source,map_bytes,config)!=source_inputs():
        raise ValueError("invented-only source external pin failed")
    if data["sourceRunId"]!=OriginProducer(source,map_bytes,config).run_id:
        raise ValueError("source run identifier mismatch")
    if read_safe(root,"generated/invented_guest.cpp")!=render_cpp(source,map_bytes,config):
        raise ValueError("forged compiled C++ source despite self-rehashed manifest")
    origin=read_safe(root,"cpp_origin.json")
    verify_cpp_emission(origin,root/"generated",source,map_bytes,config,data["runNonce"])
    witness=strict_json(read_safe(root,"witness.json"))
    if witness!={"status":"TOY_OBSERVED_REPLAY_STOP","eventCount":34,
                 "sourceByteIntegrity":True,"producerAttested":False,
                 "authenticReleaseEligible":False}:
        raise ValueError("toy external observer not verified")
    compiler=data["compiler"]
    if (type(compiler) is not dict or compiler.get("imageDigest")!=IMAGE
            or compiler.get("network")!="none" or compiler.get("sourceMount")!="read-only"
            or compiler.get("outputMount")!="temporary writable"
            or compiler.get("wasmFlags")!=["-std=c++17","-O2","-s","STANDALONE_WASM=1",
                "--no-entry","-Wl,--export=nsmb_toy_execute",
                "-Wl,--export=nsmb_toy_function_count",
                "-Wl,--export=nsmb_toy_source_tag"]):
        raise ValueError("unverified compiler sandbox claims")
    node_report=strict_json(read_safe(root,"node.json"))
    if node_report.get("wasmSha256")!=h(read_safe(root,"wasm/invented_guest.wasm")) or node_report.get("caseCount")!=len(VECTORS):
        raise ValueError("Node Wasm artifact test disagrees with digest and cases")
    if (node_report.get("producerAttested") is not False
            or node_report.get("authenticReleaseEligible") is not False
            or node_report.get("importCount")!=0):
        raise ValueError("untrusted ABI or attestation")
    if data["abi"]!={"imports":[],"exports":node_report["exportNames"],
                     "caseCount":len(VECTORS)}:
        raise ValueError("ABI contract differs from actual Node proof")
    if check_runtime:
        program=Path(__file__).with_name("verify_wasm.mjs")
        env=os.environ.copy()
        env.pop("LD_LIBRARY_PATH",None);env.pop("LD_PRELOAD",None)
        native=root/"native/toy_native"
        for test in VECTORS:
            result=subprocess.run([str(native),str(test["entry"]),str(test["initial"])],
                env=env,capture_output=True,timeout=5)
            if result.returncode!=0 or result.stdout.strip()!=str(test["expected"]).encode():
                raise ValueError("physical native executable differs from invented PPC oracle")
        with tempfile.TemporaryDirectory(prefix="luigi-wasm-verify-") as tmp:
            c=Path(tmp)/"commitment.json"
            c.write_text(json.dumps({"expectedSha":h(read_safe(root,FILES[5])),
                "sourceSha":h(source),"inputs":VECTORS}),encoding="utf-8")
            proc=subprocess.run(["node",str(program),"--wasm",
                str(root/FILES[5]),"--test-commit",str(c)],
                capture_output=True,text=True,timeout=20,env=env)
        if proc.returncode!=3:
            raise ValueError("dynamic standalone Wasm verification failed")
        result=json.loads(proc.stdout)
        if result!=node_report:
            raise ValueError("dynamic Wasm report differs from pinned report")
    return {"status":"INVENTED_MULTIFILE_CHAIN_VERIFIED_STOP",
            "manifestSha256":h(raw),"fileCount":len(FILES),
            "wasmSha256":h(read_safe(root,FILES[5])),
            "producerAttested":False,"authenticReleaseEligible":False}
