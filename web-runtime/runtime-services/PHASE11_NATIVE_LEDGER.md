# Phase 11 Toad — Ubuntu native Time64 monotonic repair

**Scope: copyright-free synthetic WebAssembly only.** No original Wii game
functions, proprietary game binary, ISO, REL, audio or translated Nintendo
source are included or tested here. W01 original source identity remains STOP.

## Source provenance and RED proof

- Actual Ubuntu GitHub recovery base `3fda047`, composed locally
  of public `main 2c2ef26`, Luigi synthetic STH `ef65abb` and Toad
  Time64 `54e0936`, without retrieving the unpublished Windows fix.
- Red-first real compiled public Wasm on Ubuntu:
  `clock.publish(0x100000002n)` wrote checked RAM 2, and then
  direct `_nsmbw_services_time64_publish(0,0x80008000,0,1)` returned 1,
  rewrote RAM to 1. This was reproduced with
  `/home/marcos/NSMBcowork/notes/repro_time64.mjs` before modification.
- Source-level rebuild replaces *two* separate JS/native monotonic
  authorities with one C++ u64 ledger shared by legacy `publish`
  (host-only staged high32 then checked low32) and native
  `time64_publish` (direct C++ internal `commit64`). No JS-only guard.
- Host registration magic uses the unchanged reserved `0xFFFFFFFC`
  with `0x5449434B`. Invalid magic/unsupported MMIO returns typed 7;
  ordinary valid guest RAM write with no paired upper returns 12;
  regressive u64 returns 10. Pending highword is consumed upon invalid
  address; failures never allocate ghost pages or commit CPU registers.
- The actual C++ `CpuContext*` writes r3=high32, r4=low32, with three
  independent *synthetic diagnostic* slots, not authentic W03 guest HLE
  CpuContexts. The single native owner persists over guest resets;
  an empty W03/W04 epoch is required before native time reset.
- This contract is single-threaded and trusted-host only. Does NOT prove
  native PPC timebase rate/epoch or 64-bit guest memory atomicity.

## Reproducible Linux toolchain

`web-runtime/runtime-services/build_tick_linux.sh` uses native Emscripten
when present, otherwise isolated unprivileged Docker with the pinned
`emscripten/emsdk@sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a`
image and the same nine public C++ sources as `build_tick.ps1`. The output
is `dist/joined_tick.{mjs,wasm}`, both source-rebuilt, not copied from
the missing Windows machine.

- Exact Ubuntu Emscripten joined Wasm SHA256:
  `698d9aec000498f67869c1aeb8443edd3f7e3ed948f996bf8554c324fdd86a3c`
  (verify again after every subsequent source change).
- New `phase11_clock_ledger.test.mjs` tests native legacy->direct
  reversal, raw lowword denial, malformed claim magic7, unpaired
  ordinary RAM12, alias, high/low regs three contexts, quota0, MMIO
  with zero callbacks, u64 rollover and 128 checked-frame cycles.
- Independent Luigi SHA `f4c578f` and Peach SHA `70bbe60` tests
  must run unchanged against this compiled image; the CI workflow
  checks their exact GitHub SHAs.
- Local Ubuntu Chrome for Testing cannot initialize its normal
  sandbox due AppArmor/user-namespace restrictions. DO NOT override
  sandbox flags to manufacture a passing test. The workflow runs actual
  Chrome/Node on GitHub Actions with `--test-concurrency=1`,
  requires `# skipped 0`, and fails rather than hiding missing browser.
- REA 6.5.0 is currently absent on Ubuntu and was *not* claimed run;
  static import/export checks in `time64_cpu.test.mjs` are weaker than
  verified REA typed WABT evidence. Any REA certification needs a newly
  acquired, correctly installed tool and a new report.

## Hard STOP: authentic Wii

Mario's W01 strict public source audit has unresolved REL JSON duplicate
keys / Unicode aliases, malformed structure, overlap/overlay ownership,
missing MAP provenance, `--probe` ambiguity, and the user's original
DOL SHA mismatch to the pinned expected profile. Until source identity,
a clean W01 fix and two exact-SHA reviews pass, **do not execute a
Nintendo original leaf**, and never call this diagnostic game boot.
