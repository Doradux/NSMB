# Luigi phase 11: Ubuntu-only W01 / native Time64 regression tests

Scope: SYNTHETIC PUBLIC CHECKED-ABI ONLY. DO NOT place proprietary Wii
code, original DOL/REL binaries, private game hashes, credentials or traces here.

Exactly recovered from **published, reviewed Phase10 Luigi** commit branches,
not from unpublished Windows worktrees:
- time64-native-direct-monotonic.test.mjs came from
  origin/agent/luigi/phase10-time64-native-regression at f4c578f.
- test_w01_evidence_boundary.py came from
  origin/agent/luigi/phase10-w01-strict-evidence-qa at c55dc33.
No assertions were relaxed.

## Run against a selected exact compiled Ubuntu Time64 checkout

    export NSMB_PHASE10_TIME64_ROOT=/home/marcos/NSMBcowork/worktrees/<EXACT-CLEAN-REVIEW>
    /home/marcos/NSMBcowork/bin/nsmb-node --test --test-concurrency=1 \
      tests/phase11/time64-native-direct-monotonic.test.mjs

The test hard-fails if a real compiled `joined_tick.mjs/.wasm` is missing.
A real isolated source rebuild requires Emscripten and matching WASM SHA256;
unmodified public `main` + `3fda047` still contain the known defect.
To run independent Peach public e4e087a/70bbe60 tests in the same report, use
their exact published SHA read-only; never copy a peer's dirty local worktree.

## W01 public source RED-old vs GREEN-new

    export NSMB_W01_AUDIT_ROOT=/path/to/EXACT-CLEAN-W01-CHECKOUT
    PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover \
      -s tests/phase11 -p 'test_w01_evidence_boundary.py' -v

All fixture inputs are intentionally invented; tests do NOT inspect private
Nintendo material. A broken old auditor should fail many negative cases.
Only a NEW clean Mario fixed SHA plus unchanged author+Phase7/9+Phase11 tests
may be considered green, pending original DOL/profile identity check.
A red-first suite is intentionally NOT a pass on the old auditor.

## Fresh Ubuntu marcos-hpr results (2026-10-23)

Exact clean public source W01 SHA 9708663:
- W01 author 21 PASS / 0 FAIL / 0 SKIP.
- Luigi phase11 15 tests: 3 PASS / 12 FAIL / 0 SKIP (negative defect reproduction).
- Peach PR2 c87090e equivalent public branch: 3 PASS / 7 FAIL / 0 SKIP.
- Toad PR3 structural cases (published branch): 2 PASS / 4 uncontrolled
  malformed-REL schema ERROR / 0 SKIP in private scratch copy of auditor.

Time64 local *recovered from GitHub* reconstruction SHA 3fda047:
- Luigi native regression tests: 2 PASS / 2 FAIL / 0 SKIP; direct native after
  a legacy 64-bit publish erroneously rewinds checked RAM, including alias.
- Peach published Time64 70bbe60 six cases: 0 PASS / 6 FAIL / 0 SKIP.
- Existing synthetic Time64/real-translator STH Node-only suite:
  27 PASS / 0 FAIL / 0 SKIP; does NOT cover critical regression.

Tools: Node22 through nsmb-node wrapper is operational. Chromium154 is present
but local AppArmor/user-namespace sandbox prevents normal launch. DO NOT use
--no-sandbox to mark browser accepted. Emscripten and REA not installed in
Ubuntu at initial bootstrap, so no new source rebuild/typed REA result may be
claimed based on the committed binaries alone. When Toad supplies a NEW
published exact clean Linux SHA, re-execute and record RED-to-GREEN evidence,
Chrome/REA separately when toolchains available.

W01 original-owner executable revision/hash does not match source profile.
Regardless of an audit parser fix, original Wii function execution is STOP.
