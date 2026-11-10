"""Second isolated offline compiler run proves toy Wasm byte reproducibility.

Same Docker image is used both times; this is deterministic compilation,
NOT independently signed C# source or trusted Nintendo provenance.
"""
from __future__ import annotations
from hashlib import sha256
from pathlib import Path
import tempfile
from scripts.phase19.luigi.pipeline import child
from .pipeline import COMPILER_FLAGS,IMAGE,safe
from .producer import expected_files


def rebuild_and_compare(pkg:Path,expected_wasm_sha:str)->dict:
    header=expected_files()["toy_leaf_abi.hpp"]
    cpp=expected_files()["toy_leaf_generated.cpp"]
    if safe(pkg,"leaf/toy_leaf_abi.hpp")!=header or safe(
        pkg,"leaf/toy_leaf_generated.cpp")!=cpp:
        raise ValueError("original source-to-C++ bytes not reproducible")
    actual=safe(pkg,"wasm/leaf.wasm")
    if sha256(actual).hexdigest()!=expected_wasm_sha:
        raise ValueError("independently pinned original wasm SHA mismatch")
    with tempfile.TemporaryDirectory(prefix="luigi-p20-rebuild-") as t:
        root=Path(t)
        (root/"input").mkdir()
        (root/"output").mkdir()
        (root/"input/toy_leaf_abi.hpp").write_bytes(header)
        (root/"input/toy_leaf_generated.cpp").write_bytes(cpp)
        child(["docker","run","--rm","--pull","never","--network","none",
               "--cpus=2","--memory=4g",
               "-v",f"{root/'input'}:/input:ro",
               "-v",f"{root/'output'}:/output:rw","-w","/input",IMAGE,
               "em++",*COMPILER_FLAGS,"/input/toy_leaf_generated.cpp",
               "-o","/output/leaf.wasm"],timeout=105)
        new=(root/"output/leaf.wasm").read_bytes()
    if new!=actual:
        raise ValueError("second independent Docker compile differs byte-for-byte")
    return {"status":"P20_SECOND_DOCKER_TOY_WASM_SAME_SHA_STOP",
        "wasmSha256":expected_wasm_sha,"bytes":len(actual),
        "producerAttested":False,"authenticReleaseEligible":False,
        "realW03SchedulerInvoked":False}
