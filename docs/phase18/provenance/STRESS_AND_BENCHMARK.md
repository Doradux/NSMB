# Luigi Phase18 — measured synthetic observer test, 9 November 2026

All metrics below come from actual execution on marcos-hpr in this
Phase18 working session, NOT estimates and NOT original Wii translation.
Synthetic source is invented PowerPC/DOL-shaped fixture, built by test
helpers, never from Nintendo. CPU is local machine; no browser or Wasm.

Command from own worktree:
    python3 -B -m scripts.phase18.luigi.benchmark_witness --rounds 1000 --process-runs 30

Measured with deterministic RNG seed 1809001:
- Source-bit single flips against separately pinned original toy bytes:
  1000 / 1000 rejected, before launching producer.
- Deliberately injected incomplete/early-output/missing-file/duplicate
  event stream: 30 / 30 rejected (three categories are synthetic).
- Full independent observer subprocess runs: 30/30 structurally accepted
  as TOY ONLY STOP, no authenticate; median wall time 44.589 ms and
  observed maximum 48.105 ms.
- In-process Phase17 toy replay alone: median 0.178 ms. This is NOT a
  like-for-like performance comparison: observer includes Python process
  startup, pipe IPC, filesystem bytes, import overhead, re-decoding and
  output verification. Do not project to actual C# with many functions.
- All results producerAttested=false, authenticReleaseEligible=false.
- These are CASE COUNTS, not unittest methods: do not add 1000+30+30
  to 24 own unit methods or 440 previous methods.

The observer's stream reader is bounded BEFORE it accumulates an event
line: selectors + os.read 4096 chunks, MAX_LINE 100000 bytes,
MAX_BYTES 2000000 total, MAX_EVENTS 1000 and 15s default monotonic
deadline. It never uses an unbounded child.stdout iteration. Child
stderr is DEVNULL to prevent a full stderr PIPE blocking stdout.
The child is killed/reaped on exception/timeout; pipes are closed.
Tests separately demonstrate giant unterminated line, 300 KB stderr
flood, and sleeping child fail/complete as intended with no hang.

The observable early RED defect was found in first version of Phase18
stream emitter: it named the emitted output SHA field sha256 whereas the
independent decoder's v2 contract expects outputSha256; the witness
rejected event 27 and passed after correction. Another RED class:
an unbounded readline would block and allocate before MAX_LINE testing.
A read-bounded selector and deadlines with three targeted regressions
now GREEN. This is useful robustness, not proof of C# provenance.

Other environment limitations: dotnet and emcc/em++ absent, no actual
C# compilation, real producer event log or original Wii executable,
W03/Time64 full joint transaction, fresh browser Wasm or REA6.5.
Source-only patch git apply compatibility is separately verified.
