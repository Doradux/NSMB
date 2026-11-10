"""A DIFFERENT PROCESS emits actually compilable invented PPC toy C++.

No upstream C# translator and no original Wii input. Emit an observed
line only after writing C++ bytes into a freshly created output folder.
"""
from __future__ import annotations
import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

from .model import render_cpp,source_inputs


def emit(source:bytes,map_bytes:bytes,config:bytes,out:Path,nonce:str):
    if type(nonce) is not str or not re.fullmatch('[0-9a-f]{32}',nonce):
        raise ValueError("nonce must be an external hexadecimal 128-bit challenge")
    if (source,map_bytes,config)!=source_inputs():
        raise ValueError("only Luigi's 100% invented source fixture is allowed")
    out.mkdir(parents=True,exist_ok=False)
    generated=render_cpp(source,map_bytes,config)
    path=out/"invented_guest.cpp"
    with path.open("xb") as file:file.write(generated)
    e={"version":1,"kind":"generated_cpp_emitted","seq":0,"runNonce":nonce,
       "relativePath":"invented_guest.cpp",
       "sourceSha256":sha256(source).hexdigest(),
       "mapSha256":sha256(map_bytes).hexdigest(),
       "configSha256":sha256(config).hexdigest(),
       "cppSha256":sha256(generated).hexdigest(),
       "cppBytes":len(generated),"producerAttested":False}
    print(json.dumps(e,sort_keys=True,separators=(',',':')),flush=True)
    return 3


def main(argv=None):
    p=argparse.ArgumentParser()
    for key in ("source","map","config","outdir","nonce"):
        p.add_argument('--'+key,required=True)
    args=p.parse_args(argv)
    try:
        files=[Path(getattr(args,k)) for k in ("source","map","config")]
        if any(not path.is_file() or path.is_symlink() or path.stat().st_size>20_000
               for path in files):
            raise ValueError("not a bounded invented fixture")
        return emit(*(p.read_bytes() for p in files),Path(args.outdir),args.nonce)
    except (ValueError,OSError,UnicodeError):
        print("INVENTED_CPP_PRODUCER_REJECTED_STOP",file=sys.stderr)
        return 4


if __name__=="__main__":
    raise SystemExit(main())
