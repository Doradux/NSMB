# Phase20 Luigi evidence and explicit remaining gates (2026-11-10)

## Own performance and security evidence (actually measured)

Command:
    python3 -B -m scripts.phase20.luigi.benchmark --repetitions 8 --mutations 300

Invented-only seed20201110. Measured on marcos-hpr:
- One new Docker Emscripten compile + independently observed CPP source
  + actual native and Node oracle: 1124.311ms. One measurement, not
  a speed prediction or real upstream C# translation benchmark.
- 8 whole-package source/physical native/Node verification runs:
  min142.415ms, median145.814ms, max151.232ms.
- 180 Python byte-oracle exercises over three invented entries:
  min0.209ms, median0.251ms, max0.531ms. Different workload than
  compilation; do NOT compare timings as a direct speedup.
- 300/300 single-bit alterations of PHYSICAL generated C++ rejected
  by independent byte replay. 300 iterations, NOT 300 test methods.
- New standalone invented source WebAssembly: 1377 bytes SHA256
  716573fceb307c5871c9c38def93c8ae6a6e09ddfa531b183bdb23c407db25e2.
  Native 36/36 vectors, Node 36*5=180 functional checks; REAL
  Chromium same exact binary SHA executed 36*5=180 functional checks.
  This is not scheduler execution; realW03SchedulerInvoked=false.
- Second independent Docker compile of same self-authored source
  was byte-for-byte IDENTICAL 1377 bytes; not a trusted compiler signer.
- Native W03 intermediate: actual P19 compiled frame_loop.cpp,
  actual generated invented leaf CPP and exact Toad P20 source-pinned
  V2 header SHA4b4151b0f25027b85f5f15fb205a7fad1631c6d0.
  21 named C++ checks and 128 reset cycles with ASan/UBSan PASS,
  incorrect PC consumes Ticket, public forgeable ViewV2 cannot
  authorize without real Ticket, one W03 native clock commit only.
  This harness invokes the leaf BEFORE W03 in trusted native test
  code; NO W03 private P20 service quota charged here.

## RED -> GREEN technical defects found

- Before first source emitter, native tests raised ModuleNotFoundError:
  no render.py. Implemented real CPP generated from invented PPC words;
  native C++17 -Werror and functional tests GREEN.
- Native intermediate fixture first expected 16 labels though actual
  source had 18 real checks: test failure (not runtime CPU failure).
  Corrected to exact 18, then expanded immutable Toad V2 checks to
  21 named. No false passing count.
- Three intentionally BAD C++ source mutants are independently
  compiled: remove expectedPc guard, interpret signed16 immediate
  as unsigned16, destroy caller LR. All three produce WRONG behavior
  relative to the byte-derived independent oracle. Mutants RED,
  original generated source GREEN. Mutants are never committed as
  production C++ or named as approved builds.
- The origin witness requires raw newline-terminated event bytes,
  strict duplicate-key JSON and nonce. Re-hashing a changed C++
  or input DOL-shaped toy does NOT make it valid. No user original.
- Original HLE/Quota FALSE authority cannot be smuggled by flipping
  the manifest or public ViewV2. Missing source/CPP/header/Node output,
  unexpected hidden files, symlink ancestor, nonce replay and
  second valid unrelated Wasm byte substitution reject.
- The subprocess controller reused Phase19 hardened selectors +
  os.read bounded stdout/stderr, monotonic timeout, kill/reap, no
  indefinite or unbounded stderr buffering.

## QA accounting

Run official Python 14 source groups from CORE/Phases7,9,10,12,13
(general/rel),14,15,16,17,18,19 and NEW Phase20. Baseline after P19
Mario main integration: 511 actual Python unittest methods, all PASS.
At this checkpoint new own Phase20 test files:
test_leaf_native, test_producer, test_oracle, test_pipeline,
test_w03_native_intermediate and test_mutants, 39 unittest
methods (not 500 random oracle cases, 300 fuzz, 180 Wasm scalar checks,
128 native W03 stress loops or 21 nested C++ labels). All GREEN on
test invocation with ResourceWarning treated as ERROR.
Expected total after this change: 550 actual Python unittest
methods, no FAIL, ERROR or SKIP; rerun this total after final commit.
Existing P19 main integrated Node baseline 283 actual test methods
over 41 nonbrowser test files, using Git-archived immutable Peach
P18 SHA6352eab and Peach P19 SHAaaa7f7f, plus Toad P19 test-only
Wasm SHA b9bd8b47... . The result achieved 283/283 PASS, no skips.
Any later peer SHA must be tested separately, not added silently
to historical 283 counts.

## Trust, environment and first real original Wii function NO-GO

- Public C# upstream source pinned SHA20f0158... text patch from Phase18
  only. No host dotnet or already cached .NET SDK; genuine translated
  C# producer compiled and runtime-observed? NO. Toy Python decoder and
  generated CPP are NOT an authentic producer C# lineage.
- Owner-private DOL sha/profile mismatch remains. NEVER edit original,
  repin invented hashes as genuine or read ROM/DOL/REL.
- Real P20 W03 authority is Peach-owned scheduler private Ticket,
  private service quota, single clock/revision/GPR3/GPR4 atomic
  commit, and only then a native authorized translated toy leaf.
  This exact reviewed combined pipeline remains a dependency of
  Peach's final source and three-branch integration. Current native
  intermediate harness is not the same as an in-W03 leaf dispatch.
- Toad V2 contract is PURE computation. Public RequestV2, ViewV2
  origin, claimedBudget, epoch and revision are forgeable, no secret
  permit. Its CandidateV2.proposedCost is only a proposal; W03 must
  privately charge quota after final checks. No Toad second clock.
- Original Wii OSGetTime/IOS/GX/VI/IRQ and original program boot
  are not implemented or tested by Luigi. New toy Wasm in Chromium
  is real function execution but NEVER evidence of a playable game,
  real service permissions or Nintendo code.
- Only Mario may combine approved exact SHAs and merge main. A
  successful synthetic SHA/manifest does not supply owner consent
  or an independently signed producer trust root.
