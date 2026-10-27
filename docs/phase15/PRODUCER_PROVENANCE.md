# W15-A: Public translator provenance, synthetic-only evidence, STOP for authentic Wii

Status: SPEC and additive SYNTHETIC MODEL; **NOT authenticated producer evidence**.
No source Wii files, game-generated C++, private SHA, or Nintendo assets were used.
Do not weaken the integrated W01 MAP==metadata check without a new approved contract.

## Exact pinned public producer evidence

Baseline main SHA: 3cda86e4ad5ced94003c2a49612372852dc521e0.
Gitlink upstream-nsmbw SHA: 20f0158dd1d96bd94f821adf80ee361e4fbd414e.
Public submodule inspected READ-ONLY on marcos-hpr. Source paths below
are relative to upstream-nsmbw/translator/src, at that pinned commit:

- Translator.Cli/Program.cs lines 468-478: queue.Enqueue((startAddr,0))
  independently of MAP; functionMap.Addresses becomes speculativeSeeds.
- Program.cs lines 512-575: ProcessQueue drains direct/recursive work; the
  speculative queue skips entries already translated or visited. Speculative
  descendants retain speculative failure policy.
- Program.cs lines 595-682 and 720-760: TranslateBatch distinguishes failed
  walked vs speculative attempts; CommitResult adds every discoveryTarget
  to knownBaseFunctionEntryPoints and the queue if not already visited.
- Program.cs lines 763-786: Processes call-walk first, then speculative map;
  prints aggregate and max-20 preview of skipped entries. Console summaries
  are NOT complete machine-readable provenance.
- Program.cs line 875: emissionAddresses is derived from baseSummaries.Keys,
  NOT functionMap.Addresses.
- Program.cs lines 1336, 1417-1420, 1475-1480: emitter generates function
  metadata from the emission wave for successfully translated addresses.
- Translator.Core/Loading/FunctionMap.cs lines 80-127: MAP importer parses
  hexadecimal into a HashSet of numeric uint32, deduplicates and sorts.
  W01 rejects duplicate RAW MAP entries as a conservative stricter policy.
- Translator.Core/Mods/BaseTranslationOutputMetadata.cs lines 11-45,
  94-160 and 175-177: output metadata contains actual emitted functions
  and quality; entryPoint is C# uint, and Build.DirectCallDependencies lists
  emitted direct calls, NOT source-of-discovery events.
- Translator.Core/IO/JsonOutput.cs lines 16-32: CompactCamelCase uses a
  numeric JSON representation; no WriteAsString for entryPoint.

No existing output metadata field authenticates a root-vs-MAP-vs-discovered
causal chain or enumerates ALL speculative failures. An ordinary list of
emitted direct calls is NOT the provenance of how/why translation queued
each function. Even a hash of an independently handwritten manifest cannot
prove it came from the real translator. MAP == emitted addresses is not
universal: a valid root walk can emit unlisted recursive targets; map-only
speculative entries can fail to decode and be omitted.

## Proposed upstream instrumentation: NOT IMPLEMENTED or AUTHENTICATED

Only a separately reviewed change in the actual C# producer could emit a
source-bound VERSIONED event record atomically with output metadata. It must
capture the following for each authorized private run (NONE saved in Git):

1. Private envelope: exact upstream pin, executable and profile identities
   checked locally, translator config/options digest, unique run ID. Without
   trusted local provenance, self-declared hashes cannot prove integrity.
2. Configured root event at the actual startAddr queue enqueue. Its origin
   is the configured root even if that address also appears in the MAP.
3. MAP seeds from the real FunctionMap loader with canonical distinct
   addresses, source digest, attempted/skipped/emitted outcomes and reasons;
   never silently assume un-emitted MAP entries are fatal or successful.
4. Each actual CommitResult records a parent -> discovered target edge,
   the inherited call-walk vs speculative tier and a reproducible link to
   the relevant decoded result/SSA. Include updates after boundary repair.
5. Complete attempt outcomes for successful roots, failed walked targets
   (HARD STOP), failed speculative seeds/descendants (SOFT SKIP) and
   deduplicated already visited seeds. Record the full set, not a top-20 log.
6. Bind emissionAddresses to one completed function metadata entry,
   artifact/source-bundle digest and original run ID; reject orphan entries,
   unjustified omissions, repeated/ambiguous output and cross-run mixing.
7. Publish private artifacts atomically only after a complete run and
   independent verifier checks them. A versioned signature/trust boundary
   needs separate design: a self-signed JSON file is not authenticity.

Until such a producer-backed record exists, STOP release eligibility and
keep the existing strict W01 gate unchanged. Do NOT retrofit fake
discoveryEvents onto public output JSON and call them trusted.

## Implemented additive model: synthetic graph consistency ONLY

File: tests/phase15/luigi/provenance_model.py. This takes invented numeric
uint32 root, MAP seeds, discovery edges, explicit MAP skips, and metadata
shaped like the public producer output. It reuses the actual strict metadata
schema validator. Its results NEVER indicate release eligibility:
producer_attested=False and authentic_release_eligible=False for ALL outputs.

Positive synthetic case: root 0x80004000 discovers 0x80004100 (not in MAP);
MAP seed 0x80004200 emits and discovers 0x80004300; another seed 0x80004400
fails speculative translation. Emitted metadata contains four entries, not
equal to MAP. The model distinguishes root-reachable vs speculative branch,
yet reports no trustworthy source attestation.

Negative cases: orphan emitted node, unreachable cycle, missing MAP seed
outcome, skip not in MAP, skip also emitted, absent root, invalid graph edge,
duplicate/invalid uint32, duplicate numeric entryPoint, malformed schema,
nonzero quality counters. Nonzero quality is distinguishable from broken
schema, but NEVER certified as release-safe.

LIMITATION: the synthetic helper models explicit MAP-root skips; C# can
also skip recursively discovered speculative descendants. The full source
event instrumentation must cover those; do not extrapolate this toy graph
to all real translator variants. A hand-authored plausible caller graph
is not proof of a real upstream discovery event.

Repro from the **assigned Luigi Phase15 worktree**:
    env -u LD_LIBRARY_PATH -u LD_PRELOAD PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests/phase15/luigi -p 'test_*.py' -v
    env -u LD_LIBRARY_PATH -u LD_PRELOAD PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p 'test_*.py' -q
    env -u LD_LIBRARY_PATH -u LD_PRELOAD PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests/phase14 -p 'test_*.py' -q

## Owner-only private identity gate: GUIDE, NOT EXECUTED

After explicit authorization, the owner should verify original disc/version,
profile and SHA-256 ONLY on the authorized local machine; preserve exact
bytes, don't print/share original hashes, paths, assets, function names,
C++ or decoded instructions in logs or GitHub. Compare source identity
locally and report MATCH or STOP only. The existing original-DOL-to-profile
SHA discrepancy is a STOP; never edit the DOL or pinned reference to force
a match. --probe is not a release bypass. Even if identity eventually
matches, separately review a source-bound provenance chain and the exact
ABI/HLE dependencies of one leaf BEFORE private execution.

## Reviews and next steps

Toad reviews Luigi's exact branch SHA; Luigi reviews Peach's exact
branch SHA. Mario alone decides integration after independent reviews,
the own branch test results and all authentic-data STOPs. The synthetic
model is an additive test aid and never makes the game playable.
