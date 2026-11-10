"""Created C++ -> fresh real WASM toy chain, never a Wii/real W03 service."""
import argparse,json,sys
from pathlib import Path
from .pipeline import create_package,verify_package


def main(argv=None)->int:
    p=argparse.ArgumentParser()
    subs=p.add_subparsers(dest="command",required=True)
    new=subs.add_parser("create")
    new.add_argument("--directory",required=True)
    check=subs.add_parser("verify")
    check.add_argument("--directory",required=True)
    check.add_argument("--manifest-sha",required=True)
    check.add_argument("--expected-nonce",required=True)
    check.add_argument("--wasm-sha",required=True)
    args=p.parse_args(argv)
    try:
        if args.command=="create":
            result=create_package(Path(args.directory))
        else:
            result=verify_package(Path(args.directory),args.manifest_sha,
                   args.expected_nonce,args.wasm_sha)
        print(json.dumps(result,sort_keys=True))
        return 3
    except (ValueError,TypeError,OSError,KeyError):
        print("P20_INVENTED_CPP_WASM_REJECTED_STOP",file=sys.stderr)
        return 4


if __name__=="__main__":raise SystemExit(main())
