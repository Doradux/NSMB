"""Synthetic-only candidate for an upstream translator provenance evidence check.

NOT PRODUCER EVIDENCE: these declarations are invented by the caller. There
is no producer event log or authenticated Wii byte stream in this project.
Consequently this model NEVER returns authentic/production eligibility.
It does not modify W01's stricter MAP==metadata audit policy.
"""
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
from strict_translation_metadata import parse_translation_metadata, quality_clean


@dataclass(frozen=True)
class SyntheticProvenance:
    root_reachable: tuple[int, ...]
    speculative_reachable: tuple[int, ...]
    skipped_map_seeds: tuple[int, ...]
    emitted: tuple[int, ...]
    quality_clean: bool
    producer_attested: bool = False
    authentic_release_eligible: bool = False


def _address(value, what):
    if type(value) is not int or not 0 <= value <= 0xFFFFFFFF:
        raise ValueError(f"{what} requires numeric uint32, not a coerced value")
    return value


def _unique_addresses(values, what):
    if type(values) not in (tuple, list):
        raise ValueError(f"{what} must be explicit addresses list")
    result = tuple(_address(x, what) for x in values)
    if len(set(result)) != len(result):
        raise ValueError(f"duplicate {what}")
    return result


def check_synthetic_provenance(*, root, map_seeds, discovery_edges,
                               skipped_map_seeds, metadata_json):
    """Check consistency of *invented* claims, never authenticity.

    Graph nodes: emitted entryPoints from producer-shaped synthetic metadata.
    Graph edges: caller -> target claimed by the synthetic test fixture.
    Roots: configured startAddr, and speculative MAP seeds. A reached
    function need NOT have a MAP entry; a speculative MAP entry may be skipped.
    Real proof requires instrumented source-bound producer events, NOT this.
    """
    root = _address(root, "root")
    seeds = _unique_addresses(map_seeds, "MAP seed")
    skipped = _unique_addresses(skipped_map_seeds, "skipped seed")
    if type(discovery_edges) not in (tuple, list):
        raise ValueError("discovery edges must be explicit")
    parsed = parse_translation_metadata(metadata_json)  # numeric uint32, schema, uniqueness
    emitted = tuple(parsed["addresses"])
    present = set(emitted)
    seed_set, skipped_set = set(seeds), set(skipped)
    if root not in present:
        raise ValueError("configured root has no translated entry")
    if not skipped_set <= seed_set:
        raise ValueError("skip must belong to a MAP speculative seed")
    if skipped_set & present:
        raise ValueError("skipped MAP seed appears in emitted metadata")
    if seed_set - (present | skipped_set):
        raise ValueError("MAP seed missing both emitted and skip outcome")
    adjacency = defaultdict(set)
    for edge in discovery_edges:
        if type(edge) not in (tuple, list) or len(edge) != 2:
            raise ValueError("discovery edge must be caller,target")
        parent = _address(edge[0], "discovery caller")
        child = _address(edge[1], "discovery target")
        if parent not in present or child not in present:
            raise ValueError("edge endpoint is not in emitted metadata")
        adjacency[parent].add(child)

    def reachable(roots):
        seen = set(roots)
        work = deque(roots)
        while work:
            for nxt in adjacency[work.popleft()]:
                if nxt not in seen:
                    seen.add(nxt)
                    work.append(nxt)
        return seen

    walked = reachable([root])
    speculative = reachable(sorted(seed_set & present)) - walked
    explained = walked | speculative
    if explained != present:
        raise ValueError("orphan translated function without root/MAP path")
    return SyntheticProvenance(
        root_reachable=tuple(sorted(walked)),
        speculative_reachable=tuple(sorted(speculative)),
        skipped_map_seeds=tuple(sorted(skipped)),
        emitted=tuple(sorted(present)),
        quality_clean=quality_clean(parsed),
        # Intentionally NOT derived from self-asserted caller edges:
        producer_attested=False,
        authentic_release_eligible=False,
    )
