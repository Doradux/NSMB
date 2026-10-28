# Phase 10 — gate for ONE future authentic guest leaf (no original code)

**Status: STOP / design only.** This checklist does NOT select, extract,
translate, publish or execute a Nintendo function. It does not certify
a game boot, playability, hardware emulation or a Wii HLE implementation.

Owner of original source/version identity and of `main` integration: Mario.
Reviewers: Peach, Luigi and Toad on **exact clean SHAs**.

## 0. Critical prerequisite: W01

A candidate cannot be chosen, disassembled or executed until all items
below hold independently:

1. The privately held DOL's *exact* edition, provenance and SHA256 match
   the upstream profile pinned to **that edition**, not a conveniently
   edited hash. The current reported mismatch means STOP.
2. The W01 source auditor has a newly published clean SHA, not an uncommitted
   staging worktree. JSON REL and translation metadata must reject duplicate
   keys **recursively after Unicode decoding**. MAP, DOL/REL section bounds
   and overlapping/ambiguous executable provenance must fail closed.
3. Mario's positive audit and all Phase7, Phase9 and Phase10 adversarial
   tests pass; the `--probe` read-only exception never prints
   `strict_compatible=true` for mismatched identity or missing coverage.
4. Peach and Luigi independently review the **exact SHA**, the evidence
   source and negative-gate behavior. A clean static audit by itself
   is NOT proof of guest runtime safety.

**Never commit original DOL/REL/ISO/RVZ, extracted assets, original generated
C++, recovered instruction bytes, original function addresses or proprietary
traces. No original inputs in GitHub Actions or public browser routes.**

## 1. Private function selection only AFTER gate 0

Mario privately chooses a single deterministic, bounded leaf with:

- A confirmed owning DOL/REL and an exact ABI return path.
- A **complete** generated import/callee graph. If there is indirect
  dispatch, unresolved native override, external call or recursion, STOP.
- Every instruction and memory access classified by width, alignment,
  address alias, allocation, side-effect and error semantics. Select a
  pure scalar leaf first if one actually exists in the authenticated binary;
  do not invent a source function to satisfy this criterion.
- Explicit rejection of FPR/paired-single/GQR/FPSCR/CR/XER behavior not
  implemented by the tested actual `CpuContext` ABI. Existence of
  464-byte diagnostic struct alone does not establish those semantics.
- No required GX FIFO, IOS request, interrupts, DVD/DMA, graphics, VI
  scheduling, callbacks, file system, audio or unreviewed HLE service.
  Unsupported calls must **fail before guest state mutation**, never
  be stubbed as successful.

No function identity or source content belongs in a public checklist.

## 2. ABI and timebase: verified vs missing

Known **public upstream source contracts** (not yet a game integration):

| Dependency | Contract to verify privately |
|---|---|
| Generated C++ | Translator.Cli emits C ABI `void func(CpuContext*)`; verify symbol registration, caller/callee save set, actual arguments and return flow |
| CPU state | GPR0..31, LR, CTR, CR, XER, stack/r1, SDA/r2/r13, PC, FPR/FPSCR/GQR, and exceptions against a trusted reference |
| RAM | All guest widths and big-endian loads/stores, cached aliases, alignment and cross-page behavior; no raw browser pointer cast or unbounded Wasm read |
| Transaction | Check quota0/1 and late denied MMIO, no partial writes, no phantom pages or callback replay; guest PC/registers unchanged on rejected operation |
| Time (only if the leaf needs it) | Upstream `OS__GetTime_HLE(CpuContext*)` returns 64-bit high in r3 and low in r4. The documented synthetic rate is 60,750,000 ticks/sec, but the actual timebase and per-instruction ordering are **not** emulated by the diagnostic clock |
| Device/HLE | Every import must be individually implemented and reviewed or denied. A synthetic W07 typed rejection is **not** functioning Wii hardware |

Toad Phase9 `54e0936` proves a *separate, public, deterministic*
64-bit `CpuContext*` diagnostic sidecar with three slots and checked
**low 32-bit** guest RAM publication. It does not bind time to W03
scheduled guest contexts or prove the actual Wii `OSGetTime` implementation.
Luigi Phase9 `ef65abb` proves only a synthetic aligned
`STH -> STW -> BLR` operation, not general PowerPC or native guest HLE.
REA 6.5 checks binary static import/export types, not PPC correctness.

## 3. Reproducible private oracle protocol, conditional and bounded

After **all** gates above pass, Mario may privately perform this one-function
experiment. The public record must contain only aggregated, nonidentifying
result categories, never input values from the original binary.

1. Privately record build environment/toolchain identifiers and a separately
   verified reference runner for the *same* exact version and function. No
   new public SHA of game bytes or addresses.
2. Construct matched snapshots for reference and translated execution:
   every GPR, CR/XER/LR/CTR/PC, stack canaries, r2/r13, FPR/FPSCR/GQR
   **when relevant**, guest RAM bytes, page allocation and device state.
   Compare fully—not just r3 or a page checksum.
3. Execute ordinary and boundary test vectors deterministically:
   all-zero, all-one, signed extrema, page-edge/alignment, cached aliases,
   second-store quota fault, denied MMIO, low32 rollover **if applicable**.
4. Bound each run by explicit guest instruction count, frame count, memory
   quota and time budget; abort immediately on unresolved import, register
   drift, callback side effect, leak or unmatched fault.
5. Compare PC/return path, every relevant register, RAM bytes, allocation
   count and typed errors after each step at matching safe checkpoints.
   Native/guest architectural exceptions must match or be *explicitly*
   classified unsupported and stop the test.
6. Use several independent runs on the same private input to rule out
   state leakage, then request a fresh independent code/security review
   of only the public infrastructure modifications. Repeat actual Node/
   Chromium test suites serially when Chrome CDP resource contention occurs.
7. **Do not** infer boot/gameplay from one leaf passing. Wider execution
   requires a new explicit gate for every further dependency.

Suggested private comparison result schema with **no proprietary fields**:

```json
{
  "status": "blocked | pass | mismatch",
  "prerequisites_verified": false,
  "unsupported_imports": 0,
  "tested_vectors": 0,
  "register_mismatches": 0,
  "memory_mismatches": 0,
  "fault_mismatches": 0,
  "device_effects_seen": false,
  "browser_node_tests_passed": false,
  "independent_review_sha_verified": false
}
```

This schema is a *reporting format*, not proof of anything without the
private reference evidence and the precise clean public source SHAs.

## 4. Strict Phase10 handoff

- Mario: publish new clean W01 SHA with REL/metadata strict identity
  guards; never alter the pinned source digest to silence mismatch.
- Peach: independent W01 red/green and merged Wasm Chromium-serial suite.
- Luigi: independent W01 regression suite
  `tests/phase10/test_w01_evidence_boundary.py`, source-generated
  STH `ef65abb` verification, no further opcodes until review issues close.
- Toad: 64-bit ABI `54e0936` confirmation, precise distinction from
  original OS/HLE services.

**Do not place any original-game input, function identity, private oracle
trace or key in GitHub issues, pull requests, downloadable artifacts or
browser-based CI.**
