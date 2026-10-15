# Peach Phase9 W01 REL JSON fail-closed regression

Independent test-only branch agent/peach/phase9-critical-qa based
on public main2c2ef26. Only synthetic DOL bytes in memory.
No private Nintendo game content, owner executable hashes or REL files.

Run against chosen EXACT W01 candidate SOURCE:
    $env:NSMB_W01_AUDIT_ROOT='C:\NSMBcowork\worktrees\Mario-W01-RedTests'
    $env:PYTHONDONTWRITEBYTECODE='1'
    python -B -m unittest discover -s tests/phase9 -p 'test_w01_rel_duplicates.py' -v

NOTE this target currently contains Mario's STAGED UNCOMMITTED work:
the run is READ ONLY and is NOT approval of any clean source SHA.
Do not edit/reset/commit other sessions' files.

Baseline old Phase7 strict gates on staged W01: 18/18 PASS. W01's
existing authored test suite also passed 26/26 in the same read-only
review. New Phase9 REL layout source-ambiguity tests: 1/5 PASS,
4 FAIL. Positive: valid synthetic REL coverage is accepted; four
negative classes incorrectly report strict_compatible true+code0:
1) duplicate top-level JSON modules property (first invalid, last valid);
2) duplicate module.sections property (first bad, last valid);
3) duplicate nested section.addr property (first invalid, last valid);
4) Unicode-escaped duplicate sections property
   sec\u0074ions shadows the first property after JSON decode.

Root cause: scripts/audit_profile.py rel_sections() uses
json.loads(text) WITHOUT already existing and reusable
object_pairs_hook=reject_duplicate_json_keys from metadata parser.
Identical JSON duplicate-key rules must apply at ALL depths to REL
layout evidence, including canonical Unicode escaped key aliases.
Recommended fix solely in Mario-owned W01 clean branch, followed by
independent rerun of author tests, old Phase7 18 strict gates, this
new Phase9 5 cases, and full fake-DOL identity/probe negatives.
No second arbitrary source can silently overwrite the first.

Do not approve W01 before Mario publishes a NEW exact clean SHA.
Even corrected static pass cannot waive the separately mismatched
upstream original SMNE01 Rev1 DOL pinned SHA, nor establish
gameplay/OS/IOS/GX compatibility. Mario controls main merges.


## Independent review of Luigi real source-generated STH ef65abb

- Created SEPARATE clean detached review checkout
  C:\NSMBcowork\worktrees\Peach-Phase9-Luigi-STH-Review,
  exact published SHA ef65abb. No modifications of Luigi's checkout.
- Ran actual public precompiled .NET8 Translator.Cli on a newly
  authored copyright-free 268-byte synthetic PowerPC DOL containing
  STH r3,0(r4), STW r3,0(r6), BLR, inspected generated C++ with
  FlatWrite16 THEN FlatWrite32, rebuilt using authorized Emscripten.
- Checked-in and independent rebuilt real Wasm SHA byte-identical:
  f68e1cef4f4f991d00e732f2cef139eb6dc54f6231b3dd2b50b16286a58fb102.
- Author Node+actual Chromium source-generated suite 17/17 PASS,
  zero skips including 3 contexts, 128 resets, big-endian two
  halfword lanes, odd addresses rejected, quota0/1, no guest
  PC/GPR effects on later failure and no device callback replay.
- NEW reviewer-owned tests/phase9/sth-adversarial.test.mjs 4/4 PASS
  compiled REAL C++ Wasm: uncached MEM2 lower halfword and independent
  MEM1 STW big-endian, final physical MEM1 aligned halfword
  0x817FFFFE, late MMIO second instruction does not commit earlier
  staged halfword or PC/GPR, first unallocated halfword + full-word
  STW to same physical guest page alias at quota1 coalesces cleanly.
- NEW reviewer-owned REA6.5 static typed test
  tests/phase9/rea-sth-abi.test.mjs 1/1 PASS:
  WABT verifies source-generated test fixture all 66 original main
  export signatures preserved and precisely TWO test-only added
  nsmbw_mem_atomic_pair_write32 / nsmbw_loop_translated_store_spawn.
  Same env.emscripten_resize_heap import, exact native wasm SHA bound
  to REA evidence ID
  ev_ab8089eb0e778bbf0f0b72b27ac22bf4603b312952e699feb84cc1c572b93150.
- Source-generated fixture is NOT a Wii original ROM/REL/DOL, not
  arbitrary PPC CPU, does not implement cross-page STH, FPR/GQR,
  device side effects, OS/IOS/GX/HLE or gameplay.
- A broad first-pass parallel Chrome stress run had CDP target
  discovery failure likely from browser resource contention.
  Re-run with --test-concurrency=1 before formal 100%-suite approval.
