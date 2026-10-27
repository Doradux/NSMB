"""Synthetic proof-of-consistency runner, never an authentic Wii release gate.

Exit 3: checks pass, but producer source is NOT authenticated (STOP).
Exit 4: structural/integrity failure (STOP).
No zero exit is emitted, by design.
"""
from __future__ import annotations

import argparse
from dataclasses import fields
import json
from pathlib import Path
import sys
from .fixtures import fixture,encode,MAP_BYTES,CONFIG_BYTES,SOURCE_BYTES
from .sidecar import TrustedAnchors,verify,MAX_BYTES


def file_bytes(path):
    p=Path(path)
    if not p.is_file() or p.stat().st_size>MAX_BYTES:
        raise ValueError("missing/oversized evidence file")
    return p.read_bytes()


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest="action",required=True)
    fx=sub.add_parser("generate-invented")
    fx.add_argument("--directory",required=True)
    audit=sub.add_parser("check")
    audit.add_argument("--sidecar",required=True)
    audit.add_argument("--metadata",required=True)
    audit.add_argument("--map-file",required=True)
    audit.add_argument("--config-file",required=True)
    audit.add_argument("--invented-source",required=True,help="ONLY invented DOL-format synthetic bytes, NOT an original Wii DOL")
    audit.add_argument("--external-anchors",required=True,
        help="supplied from an independent trust channel; self-copied values prove nothing")
    opts=parser.parse_args(argv)
    try:
        if opts.action=="generate-invented":
            d=Path(opts.directory)
            d.mkdir(parents=True,exist_ok=False)
            manifest,metadata,anchor=fixture()
            (d/"sidecar.json").write_bytes(encode(manifest))
            (d/"metadata.json").write_bytes(metadata)
            (d/"invented.map").write_bytes(MAP_BYTES)
            (d/"invented.config").write_bytes(CONFIG_BYTES)
            (d/"invented-source.dol").write_bytes(SOURCE_BYTES)
            from dataclasses import asdict
            (d/"example-anchors-NOT-TRUSTED.json").write_bytes(encode(asdict(anchor)))
            print("INVENTED_FIXTURE_ONLY; example anchors do NOT prove producer authenticity")
            return 3
        anchors=json.loads(file_bytes(opts.external_anchors))
        expected={field.name for field in fields(TrustedAnchors)}
        if type(anchors) is not dict or set(anchors)!=expected:
            raise ValueError("external anchors schema")
        ranges=anchors["executable_ranges"]
        if type(ranges) is not list or any(type(row) is not list or len(row)!=2 for row in ranges):
            raise ValueError("external ranges schema")
        anchors["executable_ranges"]=tuple(tuple(row) for row in ranges)
        v=verify(file_bytes(opts.sidecar),file_bytes(opts.metadata),TrustedAnchors(**anchors),
                 map_bytes=file_bytes(opts.map_file),config_bytes=file_bytes(opts.config_file),
                 source_bytes=file_bytes(opts.invented_source))
        print(json.dumps({"status":"STRUCTURAL_ONLY_STOP","translatedCount":v.translated_count,
                          "recursiveCount":v.recursive_count,
                          "skippedMapSeeds":v.map_skipped_count,
                          "skippedSpeculativeDescendants":v.speculative_descendants_skipped,
                          "qualityClean":v.quality_clean,"producerAttested":False,
                          "authenticReleaseEligible":False},sort_keys=True))
        return 3
    except (ValueError, OSError, TypeError, UnicodeError, json.JSONDecodeError):
        print("STRUCTURAL_ERROR_STOP: evidence rejected (no private input values logged)",file=sys.stderr)
        return 4


if __name__=="__main__":
    sys.exit(main())
