# Luigi Phase17 — deferred-origin event v2, synthetic only

This is a small Python toy producer over entirely INVENTED PPC instructions
and a hand-written DOL-shaped container; it is NOT the pinned C# producer,
real Nintendo binary, actual Wii execution, trusted observer or W01 bypass.
No original input files are read. Authentic-release remains STOP.

## Why v2 is distinct from Phase16 v1

The Phase16 structural v1 checker models emit before discover, matching
the original toy but NOT actual C# ordering. Public pinned C# source commit
20f0158dd1d96bd94f821adf80ee361e4fbd414e has CommitResult/discovery
at Translator.Cli/Program.cs:720-760, and later separate output waves at
Program.cs:1336-1490. It would be WRONG to fake early C# output events.
Our v2 toy demonstrates this ordering without changing Phase16/W01/C#.

## At-origin v2 toy sequence

1. root_declared and map_seed_declared when toy queues are set up.
2. candidate_attempted when an item leaves the queue; after bounded
   decode, translation_committed with decoded-byte digest.
3. target_discovered occurs during commit, as committed parent enqueues
   each previously unseen child. Inherits walk/speculative tier.
4. candidate_skipped only on speculative decode failure; walked failure
   aborts. candidate_deduplicated if MAP seed already reached by WALK.
5. All attempted candidates resolve BEFORE output_emitted records
   sorted invented output comment-files. run_completed binds counts
   and final metadata digest.

Events record contiguous seq and synthetic uint32 addresses, as emitted
by this toy operation, not reconstructed from user-provided JSON. The
deterministic runId derives from the invented source/map/config bytes and
is NOT a signature. verify_v2 executes the toy decoder AGAIN against
the supplied bytes, comparing complete trace, metadata and output bodies.
A forged re-ordered event sequence with recalculated seq does not pass.
Tampered input, file body or invented claim of authentic producer also
fails closed.

Current demo: 6 committed invented functions, 2 speculative skips,
4 recursive discoveries, 1 MAP deduped after walk, 6 deferred outputs,
33 total v2 toy events. This does not model parallel C# translation,
boundary repair SSA or authentic signatures. Those remain independent
future design, not implemented or run.

## Commands from Luigi worktree

python3 -B -m scripts.phase17.luigi.cli generate-origin-v2 --directory /tmp/luigi-v2-unique
python3 -B -m scripts.phase17.luigi.cli check-origin-v2 --directory /tmp/luigi-v2-unique
python3 -B -m unittest discover -s tests/phase17/luigi -p 'test_*v2*.py' -q

generate => exit 3 INVENTED_V2_DEFERRED_EMISSION_ONLY.
check => exit 3 TOY_V2_REPLAY_ONLY_STOP, producerAttested FALSE,
authenticReleaseEligible FALSE. Tamper => exit 4.
Never returns exit0 indicating authenticated game release. An adversary
controlling input bytes and all anchors can invent a new consistent run.
True Wii provenance needs owner-authorized original source identity,
instrumented REAL pinned C# producer, independent observer/signature
trust root, complete output hashes, and W03/Time64 ABI/HLE gating.
