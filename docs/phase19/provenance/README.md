# Phase19 Luigi - executable invented PPC -> C++ -> new Wasm

**Status: actually compiled and DYNAMICALLY EXECUTED toy Wasm.
NOT Nintendo, NOT authentic C# producer, NOT Wii HLE.**

The chain uses separate executable roles: an existing Phase18 toy producer
with a separately running bounded witness, a NEW Phase19 C++ producer
with its own replay witness, native g++, offline Docker Emscripten, and a
separate Node executable which instantiates and invokes the physical Wasm.
All source PowerPC instruction words are newly fabricated.

## Reproduction, authorized marcos-hpr

Use existing agent/luigi/phase19-producer-execution worktree, fresh
UNUSED absolute /tmp directory. No new worktrees, no repository dist edits.

    python3 -B -m scripts.phase19.luigi.cli create --directory /tmp/luigi-p19-unique-name

This performs all of:
1. Create hand-authored DOL-shaped data with invented BL, ADDI r3,r3,
   BLR and NOP; six decoded candidate functions. Skips one speculative
   recursive failure; root has two invented calls.
2. Phase18 parent witness precommits fabricated source/MAP/config
   and producer code pins + external nonce; child emits 34 actual
   bounded causal JSONL events, parent independently replays and
   checks all emitted toy comment outputs and metadata. Not actual C#.
3. Phase19 NEW child emits ACTUAL C++ code and an event AFTER writing,
   with full source/map/config/CPP hashes; parent checks whole C++ bytes
   by decoding the invented source again, not by believing event JSON.
4. g++ builds native C++17 with -Wall -Wextra -Werror -pedantic and
   actual binary is run for 24 oracle vectors.
5. Docker image SHA
   sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a
   already cached: --rm --pull never --network none --cpus=2 --memory=4g;
   C++ source mounted read-only, artifacts only under fresh /tmp output,
   no sudo, pulls, network, privileged or repository writes.
6. Node WebAssembly.Module validates and INSTANTIATES actual newly
   compiled standalone Wasm and invokes nsmb_toy_execute for 24
   source-derived test vectors. No import functions. This proves toy
   Wasm execution, not W03/Time64 or original Wii.
7. A 10-file manifest binds source, MAP/config, CPP, native binary,
   Wasm bytes, independent toy witness, C++ origin event, Node proof,
   producer-code SHA pins and build image/flags. Exit3 is
   STRUCTURAL-TOY-STOP, never authentic release success. Exit4 rejects.

Create prints JSON commitments package, manifestSha256, runNonce,
wasmSha256. Keep them from a SEPARATE reviewer-owned channel if you
require a meaningful immutable comparison (they are NOT signatures).

    python3 -B -m scripts.phase19.luigi.cli verify --directory /tmp/luigi-p19-unique-name --manifest-sha HEX64 --expected-nonce HEX32 --wasm-sha HEX64

A second independent new Docker compilation and byte-for-byte comparison:

    python3 -B -c 'from pathlib import Path; from scripts.phase19.luigi.rebuild_check import rebuild_and_compare; print(rebuild_and_compare(Path("/tmp/luigi-p19-unique-name"),"HEX64_WASM_SHA"))'

This shares the same cached Docker image; it is reproducibility evidence,
not a signed compiler lineage or producer attestation.

## Actual measured example, 10 November 2026

For initial invented r3=100: offsets 0x000/0x020/0x040/0x0e0
yield 118/102/110/111 in Python oracle, real native, and real new
Wasm. Invalid speculative +0x0a0 and unknown +0x0300 return 0xffffffff.
Actual new standalone Wasm measured 777 bytes, SHA256
01dbdfc68c4c1f33eceb31b37767247efed01d153f7c313108e878e560f1eed7.
This is an observed source revision, NOT a guarantee for future builds.

Mario's separate NEW frame_loop.wasm of 25,904 bytes SHA256
0d0e68d38ee36840fb86a177dfc930988dc9c8c61c2595e5e3c9eda11bc8e8d1
came from DIFFERENT public C++ in main. external.py verifies its
source/hash/ABI physical identity (12 files, one import, 66 exports),
but NEVER asserts guest clock actually invoked. Peach owns NEW
functional W03/Time64 proof in both Node and Chromium same binary SHA.
Never call Mario's binary a descendant of invented PPC code.

## Strict STOP

Public C# upstream pinned 20f0158dd1d96bd94f821adf80ee361e4fbd414e:
Phase18 source-site trace patch git apply --check PASS; no dotnet or
already-cached .NET SDK, so real C# compilation and signed producer
attestation NOT RUN. Original Wii owner's DOL SHA/profile mismatch
remains. Never read original code, keys, original ROM/REL, bypass W01,
claim real OSGetTime HLE, IOS/GX/VI/IRQ or NSMB gameplay.

A malicious actor owning source, producer, manifest and all pins can
create a new consistent invented run; author-provided hashes do not
prove trusted provenance. Every status always reports
producerAttested=false and authenticReleaseEligible=false.

See MANIFEST_V1.md, CSHARP_AND_TRUST_STOP.md,
BENCHMARK_AND_NEGATIVES.md, FIRST_WII_LEAF_NO_GO.md.
