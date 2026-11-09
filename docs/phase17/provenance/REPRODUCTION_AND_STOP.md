# Phase17 Luigi — reproduction, acceptance limits, ownership

Only team marcos-hpr, assigned worktree `worktrees/luigi-Phase17`, branch
`agent/luigi/phase17-producer-evidence`, base main
`fe5a34f74afe1f12880fc8eee999fe8e0c9c7d02`.

## What was actually implemented

`producer.py` parses and translates **newly invented** DOL-format PPC words;
no file from the owner's game is read. Producer events arise at queue/decode/
commit/skip operations; a separate replay re-decodes source words and binds
source, MAP, config, metadata, event order, and every output artifact byte.
The examples are PUBLIC SYNTHETIC only, never true Wii HLE or a genuine C#
translator attestation. The illustrative pins and deterministic run ID can
be fabricated by whoever controls the fixture — they are NOT signatures.

## Reproduction from repo root

Use a NEW, empty temp directory; stdout contains **only synthetic** values.
Codes 3/3/4 are expected; the shell should not assume code zero means pass:

    env -u LD_LIBRARY_PATH -u LD_PRELOAD python3 -B -m scripts.phase17.luigi.cli generate-demo --directory /tmp/luigi-phase17-unique
    env -u LD_LIBRARY_PATH -u LD_PRELOAD python3 -B -m scripts.phase17.luigi.cli check-demo --directory /tmp/luigi-phase17-unique
    env -u LD_LIBRARY_PATH -u LD_PRELOAD python3 -B -m unittest discover -s tests/phase17/luigi -p 'test_*.py' -q

After making a one-byte alteration to the invented `source.dol` or to a
`outputs/*.cpp` file, `check-demo` must return **4**; it emits no file
contents. Delete the temp folder after testing. Never put actual Nintendo
assets there. A check returning **3** proves only consistency with the toy
source-decoding logic. This does not certify the C# producer pin.

## Gate matrix

| Claim | Evidence | Status |
|---|---|---|
| Invented PPC BL/BLR bytes decoded deterministically | Toy producer code and unit tests | SYNTHETIC PASS |
| Root, MAP speculative skips, recursive discovery at origin | Ordered event stream during toy queue/process | SYNTHETIC PASS |
| Source, MAP, config, output artifacts match claimed traces | Phase16 structural checks + Phase17 toy replay | SYNTHETIC PASS |
| Actual pinned C# run emitted this stream | No instrumented .NET producer | **STOP** |
| Raw owner DOL matches release profile | Known prior SHA mismatch, no private access | **STOP** |
| Source/metadata authenticity anchor independently trusted | Example pin file produced by toy itself | **STOP** |
| Proper C# boundary-repair and emission-wave v2 semantics | Annotated C# patch proposal, not compiled | **STOP** |
| Wii original function executes with trusted W03/Time64 HLE | Separate incomplete native bridge | **STOP** |
| Emscripten/REA rebuilt for Phase17 | Tools not on PATH; no builds attempted | **BLOCKED-ENV** |
| Browser game playable | No original game started | **NOT CLAIMED** |

## Peer and integration

Luigi requests Toad's independent exact-SHA review of this additive toy
producer. Luigi must review Peach's **final** Phase17 W03 SHA, and Peach
must review Toad's Time64 SHA. Mario alone can integrate after clean
combined QA and exact review votes. `main`, pinned upstream and the W01
strict audit are off limits for Luigi. Any true version-2 C# patch needs
trusted-source input verification, independent observer/signature design,
an approved .NET toolchain and a separate review before use.
