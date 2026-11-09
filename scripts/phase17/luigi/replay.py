"""Re-execute INVENTED PPC producer operations to reject fabricated event history.

Deterministic same-source reproduction is an integrity cross-check for this
TOY implementation, NOT an independent witness to actual pinned C# provenance.
"""
from __future__ import annotations
from dataclasses import dataclass
import json
from scripts.phase16.luigi.sidecar import TrustedAnchors, verify
from .producer import OriginProducer

@dataclass(frozen=True)
class ReplayVerdict:
    translated_count: int
    event_count: int
    skipped_attempts: int
    source_replayed: bool = True
    producer_attested: bool = False
    authentic_release_eligible: bool = False


def replay(*,source:bytes,map_bytes:bytes,config:bytes,sidecar:bytes,
           metadata:bytes,anchors:TrustedAnchors,outputs:dict[str,bytes]):
    structural = verify(sidecar,metadata,anchors,source_bytes=source,
                        map_bytes=map_bytes,config_bytes=config)
    # Independently re-run the toy control flow rather than trusting an
    # author-provided map of alleged discovery edges.
    expected=OriginProducer(source,map_bytes,config).run()
    if sidecar != expected.sidecar:
        raise ValueError('origin event stream differs from independently replayed toy decoding')
    if metadata != expected.metadata:
        raise ValueError('metadata differs from toy origin emissions')
    if type(outputs) is not dict or set(outputs)!=set(expected.files):
        raise ValueError('missing or unlisted emitted file')
    for name,body in expected.files.items():
        if type(outputs[name]) is not bytes or outputs[name]!=body:
            raise ValueError('emitted file bytes differ from inventoried toy origin')
    return ReplayVerdict(
        translated_count=structural.translated_count,
        event_count=len(json.loads(sidecar)['events']),
        skipped_attempts=structural.map_skipped_count+structural.speculative_descendants_skipped,
    )
