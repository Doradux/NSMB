# Phase18 Luigi — public C# producer source-site events

**Delivery: reproducible OPT-IN PATCH, NOT BUILT (dotnet absent).**
No private Nintendo assets were read. Upstream PUBLIC source pin:
20f0158dd1d96bd94f821adf80ee361e4fbd414e.
Phase18 base preview c12e8b090509f5e2e2da65b5ea5000beb7ebcc95
is NOT yet main.

Patch path: docs/phase18/provenance/PublicTranslatorCausalTrace.patch
Generator: scripts/phase18/luigi/make_patch.py
Changes only public Translator.Cli/Program.cs and adds
Translator.Cli/PublicProducerTrace.cs in an ephemeral snapshot.
Never modifies the pinned upstream submodule or main.

## Source-site event origins, relative to public Program.cs

| Old line / site | Phase18 hook | Direct observation | Limit |
|---|---|---|---|
| ~430, translate-recursive start | source_sha256, map_sha256, project_config_sha256 | hashes physical inputs visible to C# | no owner-original identity trust |
| ~469 root enqueue | root_declared | actual selected root visited | not external witness |
| ~477 MAP import | map_seed_declared | canonical parsed MAP queue | not raw MAP line provenance |
| ~550 speculative QueueBatch | map_seed_deduplicated / map_seed_queued | queue accept/skip decisions | visited outcomes must be audited |
| ~595 before IndexedParallel | walk_attempted / speculative_attempted | serial ATTEMPT INTENT | not worker completion |
| ~660 serial result loop | speculative_skipped | null result from worker | failure message excluded |
| ~730 serial CommitResult | translation_committed | translated set accepted work | SSA may later be repaired |
| ~735 discovery | target_discovered | actual visited.Add and queue enqueue | no rejected descendant edge |
| ~626 retries, ~835 repairs | boundary_retry_attempted / boundary_superseded | deterministic retry scheduling and final summary overwrite | missing final SSA digest |
| ~1455 bundle writer | bundle_wave_completed | all emission workers and bundle writer finish | durability verified later |
| ~1515 metadata publication | output_emitted | after metadata write; actual C++ output file SHA matches function metadata | requires actual function files and metadata |
| ~1535 end of successful run | metadata_sha256, run_completed | final metadata file digest; number translated == metadata functions | no authentic producer signature |

All Emit calls are on the serial producer/commit thread, never inside
IndexedParallel worker result callbacks. Their completion order may be
nondeterministic. Emit sequence is monotonic and written via JSONL with
AutoFlush. RunId is SELF-CHOSEN; fields producerAttested and
authenticReleaseEligible are ALWAYS false.

Opt-in environment variable NSMB_PUBLIC_PRODUCER_TRACE must name a NEW
absolute PRIVATE trace path, not anything in the public repo.
FileMode.CreateNew rejects overwrite. No trace is written by default.
If opted in, missing output-metadata, disabled physical function files,
source/file SHA failure or incomplete emission inventory fail CLOSED.
No run_completed marker is written after an unsuccessful translation.
Any partial JSONL is invalid.

The patch deliberately does NOT claim a canonical SSA fingerprint after
boundary repair, nor an independently witnessed original source. A
self-written source hash cannot prove producer authenticity. A real
producer witness must be a separate trusted actor and use an owner-only
authenticated source revision/challenge; see TRUST_MODEL.md.

## Reproducibility

1. Verify exact public upstream git pin above.
2. Generate patch with make_patch.py from that checkout.
3. Export its public Translator.Cli source into a NEW /tmp directory,
   then run git apply --check followed by git apply there.
4. Run the tests in tests/phase18/luigi.
5. A clean git apply result is only SOURCE PATCH compatibility; without
   dotnet it is NOT a compile/runtime guarantee.

No emcc, real game DOL, REL, ROM, secrets, original-game code or private
hash were used. Main and all Phase17 worktrees remain untouched.
