"""Independent second Docker compilation of invented C++: byte-for-byte match.

Not a trusted compiler signer: both builds share the same cached image
and environment. But a self-rehashed stranger Wasm cannot claim to
originate from the source without matching the reproducible build.
"""
from __future__ import annotations
from hashlib import sha256
import os
from pathlib import Path
import subprocess
import tempfile

from .lineage import IMAGE,read_safe
from .model import source_inputs,render_cpp


def rebuild_and_compare(package:Path,expected_sha:str)->dict:
    source,map_bytes,config=(read_safe(package,x) for x in
          ("inputs/source.dol","inputs/inputs.map","inputs/config.json"))
    if (source,map_bytes,config)!=source_inputs():
        raise ValueError("noninvented source refused")
    cpp=read_safe(package,"generated/invented_guest.cpp")
    if cpp!=render_cpp(source,map_bytes,config):
        raise ValueError("untrusted C++ bytes do not match invented source")
    previous=read_safe(package,"wasm/invented_guest.wasm")
    actual=sha256(previous).hexdigest()
    if actual!=expected_sha:
        raise ValueError("prior artifact SHA differs from separate commitment")
    with tempfile.TemporaryDirectory(prefix="luigi-rebuild-independent-") as temp:
        dir=Path(temp)
        src=dir/"source";out=dir/"output"
        src.mkdir();out.mkdir()
        (src/"invented_guest.cpp").write_bytes(cpp)
        cmd=["docker","run","--rm","--pull","never","--network","none",
             "--cpus=2","--memory=4g",
             "-v",f"{src}:/input:ro","-v",f"{out}:/output:rw","-w","/input",IMAGE,
             "em++","-std=c++17","-O2","-s","STANDALONE_WASM=1",
             "--no-entry","-Wl,--export=nsmb_toy_execute",
             "-Wl,--export=nsmb_toy_function_count",
             "-Wl,--export=nsmb_toy_source_tag",
             "/input/invented_guest.cpp","-o","/output/invented_guest.wasm"]
        env=os.environ.copy();env.pop("LD_LIBRARY_PATH",None);env.pop("LD_PRELOAD",None)
        p=subprocess.run(cmd,capture_output=True,timeout=105,env=env)
        if p.returncode!=0:
            raise ValueError("fresh independent Docker compiler was blocked")
        regenerated=(out/"invented_guest.wasm").read_bytes()
        if regenerated!=previous:
            raise ValueError("compiled binary differs from independently rebuilt source")
    return {"status":"SECOND_INVENTED_WASM_REBUILD_MATCH_STOP",
            "sha256":actual,"bytes":len(previous),
            "producerAttested":False,"authenticReleaseEligible":False}
