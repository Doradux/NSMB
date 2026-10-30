# Phase16 Luigi: public translator provenance and synthetic sidecar

**Status: structural design and synthetic tests ONLY. NO-GO authentic Wii.**
Original DOL, REL, ROM, private SHA, keys, Nintendo-generated C++ were not opened.
Existing W01 auditor and pinned upstream submodule are unchanged.

## Pinned public source

Baseline main: d5f4f2a93fc08fd4b1ee4ad22acf042abc3b365d.
Public gitlink: 20f0158dd1d96bd94f821adf80ee361e4fbd414e.
Source: https://github.com/WitherBlitz/NSMB-Wii-Multiplayer-Recompilation
All path references relative to upstream-nsmbw/translator/src at this pin.

| Phase | Exact C# public file/lines | Demonstrated fact |
|---|---|---|
| Configured root | Translator.Cli/Program.cs 448-470 | queue.Enqueue((startAddr,0)) independently of MAP |
| Speculative MAP | Translator.Cli/Program.cs 474-478 and 550-575 | FunctionMap.Addresses becomes separate speculative queue, drained after root walk |
| Attempts | Translator.Cli/Program.cs 595-682 | walked failures fatal; speculative MAP and descendants can soft-skip |
| Discovery | Translator.Cli/Program.cs 607-667,720-739 | CommitResult enqueues successful discoveryTargets using visited dedup |
| Boundary repair | Translator.Cli/Program.cs 799-843 | changed boundary set can cause reanalysis of translation |
| Emissions | Translator.Cli/Program.cs 875-894,1336-1350,1410-1421,1475-1490 | emissionAddresses derived from baseSummaries.Keys, not MAP |
| MAP importer | Translator.Core/Loading/FunctionMap.cs 80-127 | canonical sorted, distinct uint32 addresses (HashSet) |
| Output | Translator.Core/Mods/BaseTranslationOutputMetadata.cs 11-45,94-162,175-180 | numeric uint32 entryPoint, file sha256/path, quality counters |
| JSON | Translator.Core/IO/JsonOutput.cs 16-32 | CompactCamelCase uses numeric JSON, no WriteAsString |

What is NOT demonstrated: actual source SHA of original Wii title, an authentic
C# causal event log, provenance of each returned function, completeness of
skips/failed descendants, and genuine CPU/ABI/HLE for any Wii function.
MAP equality with emitted functions is NOT an upstream invariant. It remains
W01's intentionally conservative fail-closed rule; do not loosen it to make
tests green. Real configured root walk may discover a function also present
as speculative MAP seed BEFORE that seed is attempted. The model supports
that promotion and does not double-count a visited seed.

## Synthetic sidecar v1 structure

Source: scripts/phase16/luigi/sidecar.py, fixtures.py, cli.py.
Top-level fields: format, version, runId, producerCommit, sourceSha256,
configSha256, mapSha256, metadataSha256, root, executableRanges, mapSeeds,
events. All schema keys are exact. No unknown fields accepted.

- format equals nsmb-public-synthetic-provenance; version integer 1.
- runId exactly 32 lowercase hex, upstream producerCommit equals pinned
  public gitlink full SHA.
- metadata/source/config/MAP hashes require canonical lowercase hex sha256.
  Source, config, MAP, run ID, executable ranges, root and exact raw manifest
  and metadata digest all require a separate explicit external anchor.
  Actual public SYNTHETIC MAP/config files are also byte-hashed, and
  the parsed MAP inventory must exactly equal the claimed mapSeeds.
  A freshly invented DOL-format byte array is also hashed, parsed by the
  unchanged W01 DOL-section reader, and its executable ranges must match
  the separately pinned section witness. Original Wii DOL data are not used.
- ExecutableRanges are disjoint and must match the external declared range
  witness. This synthetic range witness is NOT a private DOL verification.
- Event stream: contiguous seq, first root; declaration events for the
  canonical MAP inventory; then emit, discover(parent), or skip(reason).
- Only a committed parent can discover a child. An unattempted MAP entry
  discovered by the walk inherits walk provenance; late, cyclic, duplicate
  or speculative self-promotions are rejected.
- Every pending candidate must become emitted or explicitly skipped.
  Only speculative candidates, including recursively discovered
  descendants, can have soft-skip outcomes (decode_error/lift_error).
- Emitted set must match numeric uint32 functions in metadata exactly.
  Each emit outputSha256 must match the corresponding metadata function
  sha256. Require safe relativePath and detect case-insensitive collisions.
- Structurally valid nonzero quality counters give qualityClean FALSE,
  not an evidence schema error and NEVER release eligibility.

All events in this phase are invented by the test fixture author, NOT
observed from Translator.Cli. Hash matching demonstrates only byte integrity
relative to externally supplied anchors. A fabricated stream and its
recomputed anchor can be mutually consistent without C# involvement.
Therefore BOTH producer_attested and authentic_release_eligible are
ALWAYS FALSE, even for the positive fixture. CLI exit 3 means
STRUCTURAL_ONLY_STOP; exit 4 is structural error; it never emits exit 0.
