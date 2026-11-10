"""Phase19 end-to-end toy producer -> witness -> C++ -> native/Wasm.

Three actual separate executables: Phase18 producer child under a
separate Phase18 witness, Phase19 C++ emitter child, g++ compiler and
Docker Emscripten compiler. All inputs PUBLICLY INVENTED. Always STOP.
"""
from __future__ import annotations
from hashlib import sha256
import json
import os
import selectors
import time
from types import SimpleNamespace
from pathlib import Path
import secrets
import subprocess
import sys

from scripts.phase17.luigi.producer import OriginProducer
from .cpp_witness import verify_cpp_emission
from .lineage import IMAGE,FILES,VECTORS,document,h,verify_package,PIN_FILES
from .model import source_inputs


ROOT=Path(__file__).resolve().parents[3]
SOURCES=PIN_FILES


def child(command,*,timeout=45):
    """Bound BOTH stdout/stderr while the child is still alive.

    A post-run capture_output length check is too late: an untrusted
    producer could exhaust memory or block on stderr before it exits.
    """
    env=os.environ.copy()
    env.pop("LD_LIBRARY_PATH",None);env.pop("LD_PRELOAD",None)
    env["PYTHONDONTWRITEBYTECODE"]="1"
    proc=subprocess.Popen(command,cwd=ROOT,env=env,stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE)
    streams={}
    deadline=time.monotonic()+timeout
    try:
        assert proc.stdout is not None and proc.stderr is not None
        with selectors.DefaultSelector() as selector:
            for stream in (proc.stdout,proc.stderr):
                streams[stream]=bytearray()
                selector.register(stream,selectors.EVENT_READ)
            while selector.get_map():
                left=deadline-time.monotonic()
                if left<=0:
                    raise ValueError("child execution deadline exceeded")
                ready=selector.select(left)
                if not ready:
                    raise ValueError("child pipe deadline exceeded")
                for key,_ in ready:
                    data=os.read(key.fileobj.fileno(),4096)
                    if not data:
                        selector.unregister(key.fileobj)
                        continue
                    streams[key.fileobj].extend(data)
                    if len(streams[key.fileobj])>500_000:
                        raise ValueError("bounded subprocess output exceeded")
        left=deadline-time.monotonic()
        if left<=0:
            raise ValueError("child failed to terminate by deadline")
        proc.wait(timeout=left)
        if proc.returncode not in (0,3):
            raise ValueError("invented producer/compiler/verifier returned a failure")
        return SimpleNamespace(returncode=proc.returncode,
              stdout=bytes(streams[proc.stdout]),
              stderr=bytes(streams[proc.stderr]))
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=10)
        if proc.stdout:proc.stdout.close()
        if proc.stderr:proc.stderr.close()


def create_package(destination:Path,*,docker=True)->dict:
    # Only newly created scratch workspaces beneath /tmp are permitted.
    dest=Path(destination)
    if not dest.is_absolute() or not dest.resolve().is_relative_to(Path("/tmp")):
        raise ValueError("output must be a fresh absolute scratch directory in /tmp")
    if dest.exists() or dest.is_symlink() or any(
        part.is_symlink() for part in [dest.parent,dest.parent.parent]):
        raise ValueError("output path exists or follows symlink")
    dest.mkdir(parents=True,exist_ok=False)
    for sub in ("inputs","native","wasm"):
        (dest/sub).mkdir()
    source,map_bytes,config=source_inputs()
    for name,body in (("source.dol",source),("inputs.map",map_bytes),
                      ("config.json",config)):
        (dest/"inputs"/name).write_bytes(body)
    challenge=secrets.token_hex(16)
    pins={
        "sourceSha256":h(source),"mapSha256":h(map_bytes),
        "configSha256":h(config),
        "observerCodeSha256":h((ROOT/SOURCES["phase18Producer"]).read_bytes())
    }
    (dest/"pins.json").write_text(json.dumps(pins,sort_keys=True),encoding="utf-8")
    command=[sys.executable,"-B","-m","scripts.phase18.luigi.witness"]
    for field,file in (("source","source.dol"),("map","inputs.map"),
                       ("config","config.json")):
        command+=["--"+field,str(dest/"inputs"/file)]
    command+=["--pins",str(dest/"pins.json"),"--nonce",challenge]
    proof=child(command,timeout=25)
    if proof.returncode!=3:raise ValueError("witness did not deny authentic release")
    observer_report=json.loads(proof.stdout)
    if observer_report["producerAttested"] or observer_report["authenticReleaseEligible"]:
        raise ValueError("forged upstream attestation")
    (dest/"witness.json").write_bytes(
        json.dumps(observer_report,sort_keys=True,separators=(",",":")).encode())
    emitted=child([sys.executable,"-B","-m","scripts.phase19.luigi.cpp_producer",
        "--source",str(dest/"inputs/source.dol"),
        "--map",str(dest/"inputs/inputs.map"),
        "--config",str(dest/"inputs/config.json"),
        "--outdir",str(dest/"generated"),"--nonce",challenge])
    if emitted.returncode!=3:
        raise ValueError("C++ producer cannot claim authentic permission")
    (dest/"cpp_origin.json").write_bytes(emitted.stdout)
    verify_cpp_emission(emitted.stdout,dest/"generated",source,map_bytes,config,challenge)
    native=dest/"native/toy_native"
    gpp=child(["g++","-std=c++17","-O2","-Wall","-Wextra","-Werror",
        "-pedantic","-DNSMB_TOY_NATIVE_MAIN",
        str(dest/"generated/invented_guest.cpp"),"-o",str(native)],timeout=60)
    for test in VECTORS:
        check=child([str(native),str(test["entry"]),str(test["initial"])],timeout=6)
        if check.stdout.strip()!=str(test["expected"]).encode():
            raise ValueError("native output differs from invented PPC oracle")
    if not docker:
        raise ValueError("BLOCKED-ENV: no actual wasm compiler was run")
    command=["docker","run","--rm","--pull","never","--network","none",
        "--cpus=2","--memory=4g",
        "-v",f"{dest/'generated'}:/input:ro",
        "-v",f"{dest/'wasm'}:/output:rw","-w","/input",IMAGE,
        "em++","-std=c++17","-O2","-s","STANDALONE_WASM=1",
        "--no-entry","-Wl,--export=nsmb_toy_execute",
        "-Wl,--export=nsmb_toy_function_count",
        "-Wl,--export=nsmb_toy_source_tag",
        "/input/invented_guest.cpp","-o","/output/invented_guest.wasm"]
    child(command,timeout=105)
    wasm=dest/"wasm/invented_guest.wasm"
    if wasm.is_symlink() or not wasm.is_file():
        raise ValueError("no physical compiled Wasm file")
    with __import__("tempfile").TemporaryDirectory(prefix="luigi-node-proof-") as tmp:
        commitment=Path(tmp)/"commitment.json"
        commitment.write_text(json.dumps({"expectedSha":h(wasm.read_bytes()),
            "sourceSha":h(source),"inputs":VECTORS}),encoding="utf-8")
        node=child(["node",str(ROOT/SOURCES["wasmVerifier"]),
            "--wasm",str(wasm),"--test-commit",str(commitment)],timeout=25)
    if node.returncode!=3:raise ValueError("native toy wasm passed release erroneously")
    node_report=json.loads(node.stdout)
    (dest/"node.json").write_bytes(json.dumps(
        node_report,sort_keys=True,separators=(",",":")).encode())
    head=child(["git","rev-parse","HEAD"]).stdout.decode().strip()
    tree=child(["git","rev-parse","HEAD^{tree}"]).stdout.decode().strip()
    codepins={name:h((ROOT/path).read_bytes()) for name,path in SOURCES.items()}
    abi={"imports":[],"exports":node_report["exportNames"],
         "caseCount":len(VECTORS)}
    manifest=document(dest,challenge,head,tree,codepins,abi)
    (dest/"manifest.json").write_bytes(json.dumps(
        manifest,sort_keys=True,separators=(",",":")).encode())
    # File identity checked AGAIN from physical bytes, beyond self-report.
    validated=verify_package(dest,h((dest/"manifest.json").read_bytes()),
                             expected_nonce=challenge,expected_wasm_sha=h(wasm.read_bytes()))
    return {"package":str(dest),"runNonce":challenge,**validated}
