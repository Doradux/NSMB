# Phase19 Luigi — measured invented source artifact QA (2026-11-10)

All below were actually executed on marcos-hpr from owned worktree
agent/luigi/phase19-producer-execution. No original Wii files or game.
No fabricated rate estimates; native/witness/Wasm time is host-specific.

## Actual measured toy CPU source->artifact chain

Executed:
    python3 -B -m scripts.phase19.luigi.benchmark --verify-rounds 10 --fuzz-rounds 300

Results with seed191110:
- Fresh Docker Emscripten standalone C++ build PLUS two independent toy
  witness child flows, complete manifest, native+Wasm verification:
  1014.998 ms end-to-end ONE run. Not the Wii translator.
- Full physical 10-file manifest verifier including 24 real native
  subprocess calls and Node dynamic instantiation per repetition:
  10 runs min92.256ms, median93.857ms, max95.380ms.
- 180 independent Python source-byte oracle evaluations spanning
  three invented guest entry offsets: min0.109ms median0.122ms
  max0.330ms. Different work than full process/ABI verification;
  never compare directly as percent speedup.
- 300 randomly generated single-bit modifications of the ACTUAL
  emitted C++ file: 300/300 rejected by independent re-decoder
  and record hash before compilation. File restored afterward.
- New standalone 777 byte Wasm SHA256:
  01dbdfc68c4c1f33eceb31b37767247efed01d153f7c313108e878e560f1eed7.
  The independent second Docker compile of the exact generated C++
  produced byte-for-byte identical Wasm. Dynamic Node calls 24/24
  oracle vectors plus native 24/24; this is not game CPU W03.
- Former Mario 25,904-byte frame_loop.wasm SHA256
  0d0e68d38ee36840fb86a177dfc930988dc9c8c61c2595e5e3c9eda11bc8e8d1
  verified separately as a public-source STATIC linker artifact:
  12/12 public source files, one typed import, 66 typed exports,
  MJS and Wasm digests matched. It does NOT prove current new W03
  CLOCK call (Peach's work).

## Observable RED -> GREEN defects

1. Generated C++ first failed native -Werror compilation on ambiguous
   misleading indentation. Rewrote branch/continue as unambiguous
   separate statements; subsequent g++ and Docker Emscripten pass.
2. Phase19 C++ witness first accepted a truncated emission JSON event
   missing the final newline, because it was reconstructing a newline.
   Test originally FAILED (false-green). Reworked to pass raw bytes
   unchanged, requiring a complete final event line; regression GREEN.
3. Path checks originally rejected symlink final leaf but a symlink
   parent could redirect the physical artifact. Added every-component
   symlink checking and explicit generated/native/wasm parent check.
4. Parent process originally used subprocess.run(capture_output=True),
   bounding output only AFTER child returned, which could allocate
   unbounded buffers or hang on stderr. Replaced with selectors,
   os.read(4096), 500kB bound per stream, monotonic deadline,
   kill/reap/fd close. Distinct tests now DENY large stdout, large
   stderr, stalled child; valid bounded output passes. No repeated
   leaked subprocess resources under ResourceWarning-as-error.

## Attack classes actually tested

Each tests a different integrity or concurrency boundary, not arbitrary
boolean flips: physical Wasm swap with Mario's valid different new
binary; post-manifest Wasm byte mutation followed by rehashed manifest;
valid native binary replaced with /bin/true and rehashed; wrong
external manifest SHA and wrong external Wasm SHA; nonce replay even
with matching copied event; source PPC byte mutation with ALL source
SHA/manifest/event copies repinned; forged producerAttested=true;
duplicate Unicode-escaped JSON keys; unknown manifest version/key;
wrong compiler image; missing C++/extra .cpp/hidden file; C++ output
modified with accurate new manifest hash; symlink to another legit
file and symlinked parent folder; truncated C++ event and premature
EOF; ABI import/export claims changed; source-code pin mismatch;
Node caseCount/result altered; C++ emitter wrong/noninvented source;
compiler stdout/stderr floods and deadline; four parallel Phase18
source producer/witness processes on distinct nonces; 250 unique
single-bit source byte mutations denied before creating output.

All new lineage tests count as actual unittest methods, NOT the
300 fuzz iterations, 180 oracle samples, 24 native checks nested
inside the Node verifier or four concurrent subcases counted as methods.
See tests/phase19/luigi and commands above for exact current counts.

## Resource limits, explicit blocked gates

Docker: offline --pull never --network none --rm, 2 CPU, 4GiB RAM,
no privileged or new downloads, source mount :ro and output /tmp.
C++ emitted in a NEW /tmp directory only, no checked-in dist.
Event parent: bounded stdout+stderr 500,000 bytes, monotonic
45s default / Docker 105s, dead child killed/reaped. Phase18 witness:
100,000-byte line/2MB total/1000 events/15s deadline.
No real C# compiler SDK, authentic producer signature, private source
identity or Nintendo leaf execution. No Wii OSGetTime HLE or full ABI.
Stop means STOP even on fully valid toy: producerAttested and
authenticReleaseEligible always false.
