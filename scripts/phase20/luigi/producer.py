"""Phase20 producer emits REAL compilable PPC-Lite C++ and physical metadata.

Every bit of source PPC is newly invented. A child process may describe
what it wrote but cannot confer W03 authority or attest source origin.
"""
from __future__ import annotations
import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

from .abi import source_inputs,provenance
from .render import render_cpp,render_header


def h(b:bytes)->str:return sha256(b).hexdigest()


def expected_files()->dict[str,bytes]:
    source,map_bytes,config=source_inputs()
    header,cpp=render_header(),render_cpp()
    metadata=provenance()
    metadata["abiHeaderSha256"]=h(header)
    metadata["emittedCppSha256"]=h(cpp)
    metadata["emittedCppBytes"]=len(cpp)
    metadata["abiHeaderBytes"]=len(header)
    return {
        "source.dol":source,
        "inputs.map":map_bytes,
        "config.json":config,
        "toy_leaf_abi.hpp":header,
        "toy_leaf_generated.cpp":cpp,
        "leaf_metadata.json":json.dumps(
            metadata,sort_keys=True,separators=(",",":")).encode("utf-8")
    }


def emit(dest:Path,nonce:str)->dict:
    if type(nonce) is not str or not re.fullmatch(r"[0-9a-f]{32}",nonce):
        raise ValueError("external 128-bit hex challenge required")
    if dest.exists() or dest.is_symlink():
        raise ValueError("new empty directory required")
    dest.mkdir(parents=True,exist_ok=False)
    files=expected_files()
    for name,b in files.items():
        with (dest/name).open("xb") as writer:
            writer.write(b)
    return {
        "format":"nsmb-p20-invented-leaf-emission-v1","version":1,
        "seq":0,"runNonce":nonce,
        "files":{k:{"sha256":h(v),"bytes":len(v)} for k,v in files.items()},
        "producerAttested":False,
        "authenticReleaseEligible":False
    }


def main(argv=None)->int:
    parser=argparse.ArgumentParser()
    parser.add_argument("--directory",required=True)
    parser.add_argument("--nonce",required=True)
    args=parser.parse_args(argv)
    try:
        report=emit(Path(args.directory),args.nonce)
        print(json.dumps(report,sort_keys=True,separators=(",",":")),flush=True)
        return 3 # toy structural STOP, not release success
    except (OSError,ValueError,TypeError):
        print("P20_INVENTED_LEAF_PRODUCER_REJECTED_STOP",file=sys.stderr)
        return 4


if __name__=="__main__":
    raise SystemExit(main())
