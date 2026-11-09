# Phase17 Luigi — producer-origin provenance, exact source and trust boundary

**Deliverable:** independent, small *Python toy producer* that decodes entirely
invented PowerPC instruction words and emits causal events as its decoder and
queue actually act. It does not instrument the pinned C# producer, cannot
translate the user's real game and cannot attest Nintendo execution.

## Exact public C# baseline

Main `fe5a34f74afe1f12880fc8eee999fe8e0c9c7d02`; public upstream gitlink
`20f0158dd1d96bd94f821adf80ee361e4fbd414e`. Inspected without changing
submodule, in `upstream-nsmbw/translator/src/Translator.Cli/Program.cs`:

| Real stage | Code at pinned commit | What is witnessed in C# source | Missing production evidence |
|---|---|---|---|
| Required root | `Program.cs:469-471` | `queue.Enqueue((startAddr,0))`, `visited.Add(startAddr)` | Trusted source identity tying `startAddr` to exact DOL bytes |
| MAP seeds | `Program.cs:473-478`, `Translator.Core/Loading/FunctionMap.cs:80-127` | A **different** speculative queue; MAP parsing canonicalizes and deduplicates | Original raw seed identity and reason each seed was accepted, visited or skipped |
| Required walk | `Program.cs:512-545`, `763-770` | `ProcessQueue(false)` drains root call graph | Committed/queued event trace keyed to producer run |
| Speculative work | `Program.cs:547-575`, `595-687` | `ProcessSpeculativeSeeds`; walked failures fatal, speculative failures in `Attempt` caught/soft-skipped | Full ordered events for **all** failures including speculative descendants |
| Recursive calls | `Program.cs:720-760` | `CommitResult` enqueues `discoveryTargets` only when `visited.Add` succeeds | Parent->target causal record from committed SSA, not inferred from emitted C++ |
| Parallel+repair | `Program.cs:601-664`, `799-834` | Parallel decoding and deterministic serial commit; potential batch retries and **later boundary repair** | Canonical final SSA and revisions of earlier event evidence |
| Actual emission | `Program.cs:875-894`, `1336-1493` | `emissionAddresses` from `baseSummaries.Keys`; parallel waves, serialized bundle writer; metadata only for actual output | Atomic final source bundle digest + emitted function path/digest joined to actual decoded provenance |
| Metadata schema | `Translator.Core/Mods/BaseTranslationOutputMetadata.cs:11-55`, `95-140`; `Translator.Core/IO/JsonOutput.cs:16-32` | `uint EntryPoint`, safe relative path, SHA, quality; numeric JSON | No complete event stream, trusted signature, independent executable identity |

### Critical semantic difference between v1 and the real C# producer

The existing **Phase16 structural sidecar v1** accepts an `emit` event followed
by `discover` from that emitted function, because its tiny toy model emits a
synthetic function before recording calls. The real C# `CommitResult` discovers
recursive targets **before the later whole-program output emission wave**.
A serious C# patch must therefore use **version 2** event semantics:
`root_declared`, `map_seed_declared`, `candidate_attempted`,
`translation_committed`, `target_discovered`, `candidate_skipped`,
`boundary_repaired`, `output_emitted`, `run_completed`.
Do **NOT** force a fake early `output_emitted` event to satisfy v1. Do **NOT**
change `scripts/audit_profile.py`, Phase16 v1 schema or pinned C# gitlink
without Mario's new review. This version mismatch is an explicit blocked
interface design question, not evidence of code execution.

## Current invented source-driven prototype

- `scripts/phase17/luigi/producer.py` constructs a hand-written 0x1100-byte
  DOL-shaped synthetic container, with standard invented PPC encodings:
  `bl` relative link, `blr`, and `nop` (plus a bounded `addi` subset).
  The 4 KiB section is **invented** and never executed as a game.
- Root at invented `0x80004000` calls another invented function and also a
  function listed later as MAP seed. The MAP queue includes successful seeds,
  an unsupported seed, and a seed with an unsupported *descendant*.
- Events are appended in `_event()` directly during `run()` queue creation,
  `_translate()` decoded-function emission and successful-target discovery,
  or caught speculative decode failure. No event list is post-processed from
  a manually supplied caller graph.
- `runId` is stable SHA256(domain || source-hash || map-hash || config-hash),
  truncated to 128 bits. This is **determinism only**, not producer signature.
- `metadata.functions` and C++-looking comment files are generated from the
  **actual decoded invented words**. The strings are comments, not compiled
  code or Nintendo-generated C++. `producerCommit` in the compatible v1
  structure indicates only the **C# version being modeled**; it does NOT
  identify the Python toy as that C# binary. CLI prints that distinction.
- `scripts/phase17/luigi/replay.py` checks byte-hash anchors with the
  unchanged Phase16 verifier, then re-runs the actual toy decode/queues from
  the supplied source bytes and compares serialized events, metadata and
  every emitted file byte. This detects structurally plausible *fabricated*
  events that were never produced by the toy decode. It cannot rule out an
  attacker controlling both the verifier implementation and all inputs.
- CLI `generate-demo` and `check-demo` always return code **3** when
  structurally valid (UNAUTHENTICATED STOP), code **4** when invalid, and
  **never** return code 0 for real-release readiness.

### Falsifiable input matrix

| Invented change | Expected failure | Verified by |
|---|---|---|
| Remove root `blr` so decoder could consume another function terminator | REQUIRED-WALK rejection, not false-green | RED->GREEN origin test; new known-boundary rule |
| Original required root unsupported | Abort entire run, no soft skip | root negative test |
| Bad speculative MAP instruction or child | `skip` with no fake translated artifact | speculative root/descendant tests |
| MAP seed discovered from root before speculative phase | One WALK discovery, no second emission | promotion positive test |
| Forge `metadata` output SHA and corresponding `emit` SHA, repin all hashes | Phase16 structure may accept; toy replay MUST reject | replay-forged-output negative |
| Change source/map/config bytes without updating witness | Reject before replay | CLI and digest tests |
| Ambiguous duplicate config JSON keys, MAP duplicates, malformed hex | Reject prior to queue processing | strict parser negatives |
| Modify file body or remove/add emitted artifact | Reject exact output inventory | CLI/replay negative tests |
| Same mutable producer object run twice | Reject before adding new events | producer single-use negative |
| Invented source with recomputed *all* hashes and valid new trace | Valid **new synthetic run**, never real C# attestation | source-edit/recompute positive control |

**This improves falsifiability of a miniature implementation, not trust.**
A tamperer who controls the source and externally supplied example-anchor JSON
can create a self-consistent new toy run. Even a real C# event stream produced
and hashed by the same untrusted process would not be sufficient. See
`TRUST_AND_PATCH_PROPOSAL.md` and the separate draft patch for the reviewed
upstream instrumentation gate.
