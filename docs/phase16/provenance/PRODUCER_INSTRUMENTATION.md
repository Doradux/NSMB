# Phase16 Luigi — future instrumented PUBLIC C# producer (proposal)

NO changes to upstream-nsmbw or pinned gitlink, no .NET executable detected
on marcos-hpr, no translated real Wii code or owner-private files processed.
This describes the missing contract, not an attested producer run.

## Exact source insertion points (public pin 20f0158dd1d96bd94f821adf80ee361e4fbd414e)

1. Translator.Cli/Program.cs around 448-478: after root configuration,
   bind the run ID and local source/config/MAP byte identities; emit a
   configured root event when startAddr enters the required queue.
   Record canonical FunctionMap addresses as speculative declarations.
2. Program.cs 512-575: record visited/translated dedup. A configured
   root walk may discover a MAP entry before the speculative queue drains.
   Such an address is WALK-reachable, not speculative solely because MAP
   also names it.
3. Program.cs 595-682: report each attempted candidate, including
   speculative descendants; walked failure is fatal but speculative
   failure is a typed skip. No original address/exception text in
   PUBLIC logs. If batch repair reattempts a function, identify the
   canonical successful decoded SSA/event.
4. Program.cs 720-760: emit each causal parent -> discovered child after
   actual CommitResult, including accepted and visited/dedup results.
   Do not reconstruct this from metadata.directCallDependencies later.
5. Program.cs 799-843: bind boundary repair to the final SSA snapshot,
   explicitly superseding earlier discovered target observations that
   no longer apply after reanalysis.
6. Program.cs 875,1336-1490: bind emissionAddresses to the final output
   metadata and output file digests, track all map seed and recursive
   failures, verify no unresolved candidates or orphan function outputs.
7. Publish a versioned record with metadata in an atomic successful
   producer transaction. Specify authenticated process identity,
   independent verifier and trust boundary. A hash or HMAC key stored
   beside an attacker-controlled manifest is NOT independent proof.

## Environment and viable next public experiment

Available: Python3.14, Node22, g++ and public pinned source. dotnet absent
and not installed by Luigi (no sudo). The existing Phase16 generator
produces invented metadata/MAP/config and artificial provenance. It can
test semantics but NOT actual emitted producer events or original DOL.

If Mario approves a toolchain and future public-producer patch:
build pinned C# in an isolated workspace using a vetted .NET SDK with
ONLY an independently invented PPC fixture; instrument real queue,
CommitResult, boundary repair and emission. Verify two clean runs give
deterministic outcomes; adversarially mutate later output artifacts,
skip speculative descendants, promote a MAP seed discovered by WALK,
reject unverified roots and missing outcomes. The upstream submodule
must stay pinned in main until a separate SHA review and integration.

Authentic Wii work remains STOP until owner-private identity SHA matches,
real producer run attestation is independently verified, and trusted
W03/ABI/HLE service contracts are complete. No private hashes, symbol
names, Nintendo bytes, generated real C++ or keys in Git or public logs.

## Threat model

The attacker may control all sidecar JSON, metadata, config and MAP,
even a copied example-anchors JSON. Independently pinned hashes only
prove equality with pinned bytes, not that C# produced them. Without an
independent trusted producer/observer, it is possible to forge the entire
internally consistent graph and all hashes. The verifier must therefore
always report producer_attested=False and authentic_release_eligible=False.
