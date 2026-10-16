# Phase 10 — source-based no-go gate for the FIRST original Wii leaf

**Decision: STOP.** Nothing in public synthetic tests currently authorizes
executing an original New Super Mario Bros. Wii function. This document
is an engineering dependency inventory, not translated game code.

## 0. Source identity and audited provenance — blocking

- Public `main` base `2c2ef26` is the synthetic runtime baseline.
- The published auditor `scripts/audit_profile.py` revision
  `110697c` uses permissive `json.loads(text)` for REL layout.
  Peach's phase 9 tests exposed four duplicate-key false acceptances;
  the extra independent structural gates in
  `tests/phase10/test_w01_rel_structure.py` cover overlapping
  executable REL ranges and uncontrolled malformed section mappings.
- Mario's W01 edited checkout is NOT a clean reviewed commit. Do not
  touch it or interpret a local green suite as reviewed publication.
- The owner's extracted original `main.dol` identity still differs
  from the upstream pinned expected executable. The game binary and
  its precise version must be independently matched without changing
  expected checksums as a shortcut. No original executable or hashes
  are needed in this public document.

**Reject:** unknown version/transform, duplicate profile/metadata/REL
keys, unsupported schema, conflicting REL ownership without module
lifetime proof, unverified MAP-to-translator closure, or incomplete
quality evidence. Never convert a `--probe` research finding into
`strict_compatible=true`.

## 1. PPC ABI and direct native calls — unimplemented for originals

- Upstream public `runtime/src/hle/os/os_time.cpp` implements
  `extern "C" void OS__GetTime_HLE(CpuContext* ctx)`, returning
  timebase high32 in `ctx->gpr[3]`, low32 in `ctx->gpr[4]`.
  `ReadTimeBaseRegisters` repeats `mftbu; mftb; mftbu` until the
  upper words match to avoid a torn 32-bit rollover.
- Public `runtime/include/timebase_contract.h` specifies
  Broadway bus 243 MHz divided by 4 = **60,750,000 ticks/second**,
  with explicit rational conversion. A deterministic host-provided
  BigInt sequence is not automatically this oscillator.
- The desktop source `OSGetSystemTime` is a DIFFERENT contract:
  guest base-time words at `0x800030D8/0x800030DC` and interrupt
  save/restore. Do not confuse it with `OSGetTime`.
- Toad `54e0936` builds a **three-slot independent synthetic
  CpuContext diagnostic** and writes r3:r4 only after a checked
  low32 guest RAM snapshot. Those slots are NOT the actual W03
  scheduled task contexts, and the native original override address
  is NOT registered in browser WASM.

**Reject:** unknown actual translator entry/call signature,
indirect/direct native target mapping, unproven stack/LR/CTR/SDA,
FPR/GQR or 64-bit return semantics, inconsistent CpuContext lifetime,
unverified timebase epoch, or any falsely successful stub.

## 2. Memory and device side effects — fail before mutation

- Desktop upstream guest translation can assume a flat 4 GiB
  address space and generated `MemoryInline` operations.
  Public browser W04 is a *sparse, bounded* MEM1/MEM2 mapping.
  All widths, alignment, byte order, aliases, and reads/writes
  must be checked against the selected original leaf's **complete**
  generated instruction list, not guessed.
- Luigi `ef65abb` demonstrates a **fixed synthetic**
  `STH -> STW -> BLR` in translator-produced C++ compiled into
  actual Emscripten with rollback on later RAM quota/MMIO failures.
  It does not make general PPC, FPR/GQR or arbitrary native calls safe.
- Wii MMIO/GX FIFO may cause irreversible external callbacks.
  Browser W07 tests mainly demonstrate explicit *rejection*,
  not GX semantics, DMA, EFB, VI or IOS device emulation.
  Do not retry after a callback unless a proven per-context
  idempotency contract permits it.

**Reject:** raw guest virtual address cast into a WASM native pointer,
missing MemoryInline width, speculative device read/write,
partially committed mixed RAM/device transactions or event replay.

## 3. Scheduling, interrupts and OS/IOS dependencies — absent

- Public upstream `runtime/src/hle/os/os_interrupt.cpp`,
  `os_alarm.cpp`, `os_thread.cpp`, and
  `runtime/src/hle/vi.cpp` provide guest-visible scheduling,
  callback or retrace contracts. W03's bounded cooperative frames do
  NOT prove compatible Wii interrupt, thread or alarm behavior.
- `runtime/src/hle/ios.cpp`, `hle/storage/dvd.cpp` and
  `nand_isfs.cpp` represent async IPC, storage, guest callbacks and
  save/permission boundaries. A public metadata-only asset index is
  NOT a complete DVD/FST or IOS implementation.

**Reject:** unimplemented required callback, device FD, DMA transfer,
OS thread/interrupt mask, alarm, video synchronization, or imported
native hook. Explicit error is required; never return fabricated
success just to progress boot.

## Gate to begin exactly ONE private original-function experiment

1. Mario obtains a NEW clean W01 SHA, and Peach independently proves
   positive + all Phase7/9/10 negative gates, including source version,
   REL structure, metadata duplicates, `--probe` and exact hash.
2. Only in owner-private storage, identify ONE matching original
   translated leaf and audit all instructions, callee imports,
   CPU state, guest memory widths, errors, device effects and
   relative schedule. Never paste its name/address, bytes or code
   into public issues/branches/logs.
3. Every dependency is classified **implemented and tested**,
   **denied before effects**, or **unknown**. Required denied/unknown
   is a hard STOP.
4. First prove the ABI shape with newly authored copyright-free code,
   real .NET Translator.Cli -> unmodified emitted C++ -> Emscripten
   WASM, real Chrome/Node tests and source-bound REA signatures.
   Report negative quota/MMIO, 64-bit carry, aliases, rollback,
   three contexts, 128 frames, and reproducible artifact hash.
5. Private original trial requires finite memory/step/time budgets
   and independent oracle output. Success for ONE leaf is not game
   boot or playable levels.

## Verifiable Phase9 public references

- Toad time64 candidate:
  `54e0936d9411820930c4ab1fe3b241d685e98a84`.
- Luigi fixed true-translator STH candidate:
  `ef65abb64884253232c223e11caa9f801dcaea71`.
- Peach independent time64 adversarial/REA tests:
  `f845af1070e8e38d59d92acdf7671533f0530b28`.
- GitHub issue #1 remains the Phase10 coordination source while
  Remote Desktop Commander is quota-paused. The owner of `main`
  remains Mario.

**Evidence limit:** prior authorized marcos sessions ran actual
Translator.Cli/Emscripten/Chrome tests; Desktop Commander refused new
calls due monthly quota at the time this document was authored.
No new Phase10 Emscripten or Chromium run is claimed here.
