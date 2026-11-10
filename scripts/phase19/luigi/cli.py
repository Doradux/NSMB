"""Opt-in public invented source->C++->new Wasm lineage command.

Exit 3 = consistent SYNTHETIC only (never real Wii release).
Exit 4 = rejected evidence. Exit 78 = Docker cached-toolchain blocked.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

from .lineage import verify_package
from .pipeline import create_package


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest="action",required=True)
    create=sub.add_parser("create")
    create.add_argument("--directory",required=True)
    check=sub.add_parser("verify")
    check.add_argument("--directory",required=True)
    check.add_argument("--manifest-sha",required=True)
    check.add_argument("--expected-nonce",required=True)
    check.add_argument("--wasm-sha",required=True)
    args=p.parse_args(argv)
    try:
        if args.action=="create":
            result=create_package(Path(args.directory))
        else:
            result=verify_package(Path(args.directory),args.manifest_sha,
                expected_nonce=args.expected_nonce,expected_wasm_sha=args.wasm_sha)
        print(json.dumps(result,sort_keys=True))
        return 3
    except (OSError,ValueError,TypeError,KeyError,PermissionError) as exc:
        print("INVENTED_ARTIFACT_CHAIN_REJECTED_STOP",file=sys.stderr)
        return 4


if __name__=="__main__":
    raise SystemExit(main())
