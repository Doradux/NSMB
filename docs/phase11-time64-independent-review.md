# Luigi — Phase11 independent Time64 fix review (Ubuntu marcos-hpr)

**Decision: APPROVED — SYNTHETIC TRUSTED-HOST CLOCK ONLY.**
Exact public Toad SHA: `b1d8f49914410db1579b0fa0844333f586b41f22`
(branch `agent/toad/phase11-ubuntu-time64`).
Reviewed in separate CLEAN detached worktree:
`/home/marcos/NSMBcowork/worktrees/Luigi-Toad-P11-Fixed`.
Date: 2026-10-23. Work exclusively via Remote Dorado Commander on marcos-hpr.

## Recovery and independent source rebuild

The baseline is Mario's `3fda047` built from two published synthetic
cherry-picks on public `main 2c2ef26`; the lost Windows-only Toad fixes
were NOT imported, and the old Windows computer was never used.

I ran Toad's Linux source builder independently in the detached review
checkout. It invokes Docker Emscripten pinned by image SHA256, compiling
current public C++ source, not a copied or simulated Wasm program. Build
completed EXIT 0, maintained clean Git checkout, and produced a
**byte-identical** joined_tick.wasm SHA256:

`698d9aec000498f67869c1aeb8443edd3f7e3ed948f996bf8554c324fdd86a3c`

The original recovered `3fda047` source had a genuine **RED** defect:
my four real-Wasm Time64 cases reported 2 PASS / 2 FAIL; Peach's six
cross-API/lowword cases reported 0 PASS / 6 FAIL, 0 SKIP. A legacy high64
publish could be rolled back by lower native time; raw lowword bypass
also evaded the canonical native ledger.

## Newly executed tests against exact b1d8f49

| Test series | PASS | FAIL | SKIP |
| --- | ---: | ---: | ---: |
| Luigi 4 + Peach phase10 6 + Peach phase11 3 + historical native claim/facade 5 + Toad new ledger 10 | 28 | 0 | 0 |
| Local Node-only synthetic runtime/interop/frame-host, no browser files | 191 | 0 | 0 |
| GitHub Actions 39934341917, SAME exact SHA: runtime + actual Chrome | 70 | 0 | 0 |
| Same secure CI: interop + Chrome | 27 | 0 | 0 |
| Same secure CI: frame host + Chrome | 109 | 0 | 0 |
| Same secure CI: independent Luigi/Peach public negative-oracle suite | 10 | 0 | 0 |

Public source of fresh sandboxed Chromium CI:
https://github.com/Doradux/NSMB/actions/runs/39934341917
GitHub Actions job 120350075659: all steps SUCCESS, actual browser executable
required, no `--no-sandbox` bypass, Emscripten rebuild SHA check and each
Node test aggregation explicitly rejected any skips. Job logs establish
70/70, 27/27, 109/109 and 10/10 with 0 skips respectively.
Some tests appear in multiple groups; totals are per series, not unique
test identities.

My local Chrome154 could not launch with mandatory sandbox due Ubuntu
AppArmor/user-namespace constraints. I did NOT use `--no-sandbox` or
claim local Chromium green. Secure hosted CI at the exact SHA supplied
separate real browser evidence.

## REA 6.5 static typed WASM ABI

Installed official npm `rea-agents@6.5.0` in the reviewer tool cache,
used independently obtained WABT 1.0.42 Linux-x64 release whose archived
SHA256 was verified to equal:
`84895407a6bbb80e918f33b16b2fb2206021c150b6bc9ff6f761263a745ab131`.
No tools or private input were committed to NSMB.

REA inspected local exact binaries in separate standalone runs:

- Normal public main `frame_loop.wasm`, SHA256:
  `32d4313e0ab8c27a6146d132492bd2f773fdb7c817534d2d4fb54e5fc6d185a1`.
  Evidence `ev_45b8ec16035f84fdc43fb98e53e7e7d9732c5d0808b97fc43e247f34c7bba326`.
- Exact Toad `joined_tick.wasm`, SHA256 above.
  Evidence `ev_25b6bc716efaa4f803e7019c785eae97b4355c5fb377d29f37d02fe706e1415c`.

Both validation `valid`, **66 baseline -> 77 candidate exports**;
precisely 11 expected tick/Time64 additions, zero missing original
exports, zero changed existing typed signatures, one matching imported
`env.emscripten_resize_heap` (no extra imports). The full REA JSON
(300 KB+) stays LOCAL ONLY under `/home/marcos/NSMBcowork/notes/`.
Typed REA findings describe **static ABI shape**, not native timing
semantics or Wii hardware fidelity.

## Reviewed code contract / remaining blocks

The legacy JS host's highword stage uses host-only `0xFFFFFFF8`,
paired with a checked guest low32 W04/W07 commit; direct native Time64
shares one C++ u64 monotonic authority. Regressive timestamps return
status10 BEFORE guest write or CpuContext commit; malformed magic and
invalid addresses stay typed7; valid unpaired raw low32 is typed12.
Rejected quota0/MMIO operations do not mutate guest pages/bytes, CPU
r3/r4 or device callbacks. Native owner survives guest reset. Tests
confirm 3 CPU context slots and 128 deterministic synthetic cycles.

**Scope limits:** single-threaded trusted JS host, synthetic
deterministic time source, no authentic Wii timebase/mftb/OSGetTime,
no IOS/GX/VI/DVD/HLE, no original game code or gameplay.

**W01 is still STOP:** the old public auditor author21 tests PASS but
Luigi15 had 12 RED, Peach PR2 ten had 7 RED, Toad PR3 six had 4
uncontrolled malformed schema errors on independent clean source
`9708663`; original-owner DOL SHA/profile identity mismatch remains.
Mario alone may integrate `main`, after further required independent
Peach approval and separate clean W01 audit/provenance review.
