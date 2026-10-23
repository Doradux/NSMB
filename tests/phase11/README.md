# Peach Phase11 — Ubuntu-only recovery QA

Owner: Peach, branch \`agent/peach/phase11-ubuntu-qa\`, start baseline
\`3fda047\` (Mario recovered solely published synthetic STH+Time64 from GitHub).
PC: \`marcos-hpr\`, Ubuntu. No Windows state or Nintendo game data copied.
No other worktree/main modified. Mario alone integrates.

## Time64 expected RED before Toad repair

The following tests are recovered unchanged from my **published** QA
branch \`70bbe60\`, together with the previous clock native-owner proof
from \`d0eb755\` and three additional Phase11 independent guards:

\`\`\`bash
cd /home/marcos/NSMBcowork/worktrees/Peach
export NSMB_P10_CLOCK_ROOT="$PWD"
export NSMB_PHASE7_TICK_ROOT="$PWD"
export NSMB_PHASE6_TICK_ROOT="$PWD"
export NSMB_P11_TIME64_ROOT="$PWD"
/home/marcos/NSMBcowork/bin/nsmb-node --test --test-concurrency=1 \
  tests/phase10/native_time64_cross_api.test.mjs \
  tests/phase10/native_time64_lowword_guard.test.mjs \
  tests/phase11/native_time64_guards.test.mjs \
  tests/phase7/clock-native-claim.test.mjs \
  tests/phase7/clock-facade-ownership.test.mjs
\`\`\`

**Current recovered vulnerable source \`3fda047\`:**
- Old 6 regressions: **0 PASS / 6 FAIL** with 0 skips, real Emscripten
  compiled synthetic Wasm. These are expected RED, **not a harness error**.
- New 3 native guards: **2 PASS / 1 FAIL**, 0 skips.
  The new failure shows native old-ledger returns page-quota status3
  instead of temporal-regression status10 after a legacy 64-bit
  publication; typed status must precede memory side effects.
- Historic native claim/facade: **5/5 PASS** 0 skips.
- Mario's independent \`notes/repro_time64.mjs\` also exits 1:
  legacy \`0x100000002\`, direct native \`1\` wrongly accepted, RAM
  falls from \`2\` to \`1\`.

Tests are intentionally RED until an **exact NEW Toad Ubuntu SHA** is
published. On Toad's clean committed candidate, rerun with the env
\`*_ROOT\` variables pointing to a fresh, Peach-owned **detached checkout**,
NOT a dirty agent worktree; preserve tests and compare expected
status7 malformed magic, status12 unpaired lowword, status10 rewind;
CPU r3:r4, pages, callbacks and checked RAM must be immutable on
rejection. Rerun 3 contexts and 128 genuine Chromium frames
**sequentially** with working browser sandbox, zero skipped.
Never accept \`--no-sandbox\` as a security workaround.

Existing Ubuntu \`marcos-hpr\` cannot yet launch real Chromium in
sandbox due AppArmor/user namespace policies. This is an ENVIRONMENT
BLOCKER, not proof of runtime regression. Emscripten, .NET and REA
are not currently on PATH; a committed Wasm binary alone is **not**
reproducible build proof. Do not report genuine rebuild/REA validation
until tools are installed and run, or secure CI runs with SHA-bound
actual artifacts.

## W01 historical published source — independently reproduced

A separate Peach-owned DETACHED checkout was created only from the
published old \`110697c\` in
\`/home/marcos/NSMBcowork/worktrees/Peach-W01-PublicAudit\`.
No Mario worktree is accessed or modified.

\`\`\`bash
export NSMB_W01_AUDIT_ROOT=/home/marcos/NSMBcowork/worktrees/Peach-W01-PublicAudit
export PYTHONDONTWRITEBYTECODE=1
python3 -B -m unittest discover -s "$NSMB_W01_AUDIT_ROOT/tests" -p 'test_audit_profile*.py'
python3 -B -m unittest discover -s tests/phase7 -p 'test_audit_*.py'
python3 -B -m unittest discover -s tests/phase9 -p 'test_w01_rel_duplicates.py'
python3 -B -m unittest discover -s tests/phase10 -p 'test_w01_*.py'
\`\`\`

Actual Ubuntu Python 3.14.4 execution now:
- Published W01 author: **20/20 PASS**.
- Peach Phase7: **18 methods, 19 expected FAIL assertions**.
- Peach Phase9: **5 methods, 4 expected FAIL**.
- Peach Phase10: **10 methods, 7 expected FAIL**.

These RED tests include invalid/duplicate Unicode REL/metadata JSON,
ambiguous executable intervals, incomplete MAP/strict \`--probe\`,
and false-positive original source-identity verdicts. RED must not be
converted to a green suite by weakening test expectations. A NEW
verified clean Mario W01 SHA must satisfy ALL negatives + positives
with original DOL SHA pinned. The owner's original game DOL SHA
mismatch is a **separate unwaived STOP**.

The authentic Nintendo game is NOT running in browser. The only
executed binary is a copyright-free public synthetic diagnostic.

## Peer authored Phase10 W01 tests (not copied into our public branch)

Independently executed against the SAME exact published old auditor
`110697c` on Ubuntu with `python3 -B`, retaining each peer's
original assertions in temporary read-only copies from Git objects:

- Luigi exact `c55dc33`, `test_w01_evidence_boundary.py`:
  **15 methods, 8 expected FAIL assertions**.
- Toad exact `117f1fe`, `test_w01_rel_structure.py`:
  **6 methods, 4 ERRORs**: invalid REL top-level lists and `null`/
  list section maps trigger uncontrolled exceptions rather than
  the required typed `ValueError` policy. Two positive controls pass.

These are meaningful independent RED evidence, NOT 'skips' or
passing QA. No Nintendo source data needed. Source references are
published peer commits; only Mario modifies the audit implementation.

## Review scope

The Lua/REL runtime loader may intentionally overlay modules at
identical addresses at different times, but source static compatibility
MUST NOT infer overlay lifetimes without explicit evidence. The
Phase10 overlap negatives require fail-closed rejection *in the
absence of such proof*; they do NOT claim every overlapping runtime
layout is inherently invalid. Peer tests focus on controlled errors,
not inventing runtime ownership. Only a clean corrected Mario SHA
with source provenance can unlock any authentic Wii guest call.
