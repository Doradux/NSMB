"""Generate/check invented source-driven events. NEVER returns authentic success.

exit 3: synthetic producer replay verified, real C# still NOT authenticated.
exit 4: invented evidence invalid/modified/incomplete.
"""
from __future__ import annotations
import argparse
from dataclasses import asdict,fields
import json
from pathlib import Path
import sys
from scripts.phase16.luigi.fixtures import encode
from scripts.phase16.luigi.sidecar import TrustedAnchors
from .producer import produce_demo
from .replay import replay

MAX_FILE=2_000_000

def read_file(p:Path)->bytes:
    if not p.is_file() or p.is_symlink() or p.stat().st_size>MAX_FILE:
        raise ValueError('missing/oversized/symlink synthetic evidence')
    return p.read_bytes()


def main(argv=None)->int:
    parser=argparse.ArgumentParser(description=__doc__)
    options=parser.add_subparsers(dest='mode',required=True)
    for name in ('generate-demo','check-demo'):
        action=options.add_parser(name)
        action.add_argument('--directory',required=True)
    args=parser.parse_args(argv)
    folder=Path(args.directory)
    try:
        if args.mode=='generate-demo':
            # Exclusive new directory: never overwrite real input/user files.
            folder.mkdir(parents=True,exist_ok=False)
            result=produce_demo()
            docs={'source.dol':result.source,'inputs.map':result.map_bytes,
                  'config.json':result.config,'sidecar.json':result.sidecar,
                  'metadata.json':result.metadata,
                  'example-anchors-NOT-TRUSTED.json':encode(asdict(result.anchors))}
            for name,body in docs.items():
                (folder/name).write_bytes(body)
            out=folder/'outputs'
            out.mkdir()
            for name,body in result.files.items():
                (out/name).write_bytes(body)
            print('INVENTED_ORIGIN_ONLY: example anchors untrusted; REAL_C_SHARP_PRODUCER=NO')
            return 3
        anchors_obj=json.loads(read_file(folder/'example-anchors-NOT-TRUSTED.json'))
        if (type(anchors_obj) is not dict
                or set(anchors_obj)!={x.name for x in fields(TrustedAnchors)}):
            raise ValueError('invalid external anchor witness')
        ranges=anchors_obj['executable_ranges']
        if type(ranges) is not list or any(type(x) is not list or len(x)!=2 for x in ranges):
            raise ValueError('bad range witness')
        anchors_obj['executable_ranges']=tuple(tuple(x) for x in ranges)
        source=read_file(folder/'source.dol')
        map_bytes=read_file(folder/'inputs.map')
        config=read_file(folder/'config.json')
        sidecar=read_file(folder/'sidecar.json')
        metadata=read_file(folder/'metadata.json')
        # Filename set is calculated from the ACTUAL decoded toy source,
        # not from untrusted metadata paths supplied by the caller.
        from .producer import OriginProducer
        expected=OriginProducer(source,map_bytes,config).run()
        out=folder/'outputs'
        if not out.is_dir() or out.is_symlink():
            raise ValueError('output folder missing/symlinked')
        actual={name:read_file(out/name) for name in expected.files}
        if set(p.name for p in out.iterdir()) != set(expected.files):
            raise ValueError('extra output artifact')
        verdict=replay(source=source,map_bytes=map_bytes,config=config,
                       sidecar=sidecar,metadata=metadata,
                       anchors=TrustedAnchors(**anchors_obj),outputs=actual)
        print(json.dumps({'status':'TOY_REPLAY_ONLY_STOP',
                          'translatedCount':verdict.translated_count,
                          'eventCount':verdict.event_count,
                          'skippedAttempts':verdict.skipped_attempts,
                          'producerAttested':False,'authenticReleaseEligible':False},sort_keys=True))
        return 3
    except (OSError,ValueError,TypeError,UnicodeError,json.JSONDecodeError):
        print('SYNTHETIC_EVIDENCE_REJECTED_STOP: no original or private bytes logged',file=sys.stderr)
        return 4

if __name__=='__main__':
    sys.exit(main())
