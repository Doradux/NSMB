# Luigi — Phase 11 second exact SHA review: Time64 76fa218

Reviewer: Luigi. Host: marcos-hpr (Ubuntu), Remote Dorado Commander only.
Full published source SHA: `76fa2180169b2dc879966d3d238c08c779dcfc44`.
Review checkout: `/home/marcos/NSMBcowork/worktrees/Luigi-Toad-P11-76`,
clean detached and never part of the original owner or Toad worktree.

**Decision: APPROVED for synthetic trusted-host Time64 and this CI change only.**

The previous Toad `b1d8f49` was source-compiled and independently APPROVED.
Subsequent `f54edbb` introduced an abbreviated Peach `5a550a1` checkout
ref. Its GitHub Actions run 39935073239 FAILED when checkout searched for
a branch named `5a550a1`; runtime compiled and full Chrome suites passed
but the new peer assertions never ran. Formal CHANGES_REQUESTED was filed.

The new `76fa218` changes ONLY workflow
`.github/workflows/phase11-time64-linux.yml` relative to `b1d8f49`
(9 lines): pinned the FULL 40-char published Peach review SHA
`01bf8a14792e3828c937a6dca2066d5a93bb85a9` and executes the
Peach Phase11 typed-error and binary surface tests alongside existing
Peach and Luigi Phase10 oracles. There is ZERO C++/JS or Wasm source
difference versus `b1d8f49`.

**Independent Ubuntu recheck at `76fa218`:** genuine C++/Emscripten
source rebuild with Docker SHA-pinned toolchain EXIT0, Git worktree clean,
Wasm byte-identical SHA256
`698d9aec000498f67869c1aeb8443edd3f7e3ed948f996bf8554c324fdd86a3c`.
Luigi/Peach/Toad external and author real Wasm tests: **29 PASS,
0 FAIL, 0 SKIP**. Our earlier full Node-only 191/191 remained
applicable to unchanged compiled source, not repeated here.

**Exact-SHA real sandboxed Chrome on GitHub Actions:**
https://github.com/Doradux/NSMB/actions/runs/39935862069,
job 120355122370, completed SUCCESS, genuine Emscripten rebuild
SHA check, browser binary required and no `--no-sandbox` bypass.
Actual job log suites: runtime70/70, interop27/27, framehost109/109,
independent Luigi/Peach Phase10/11 14/14. Every suite
**FAIL0 / SKIP0**, unlike broken `f54edbb`.

**REA 6.5.0 + WABT 1.0.42**, official digest-verified WABT:
independent `inspect-wasm-artifact` on exact checkout was VALID,
candidate 77 exports, one import, artifact SHA above, evidence
`ev_2207708adabbd51f16bdd6941c30281363bdb62872f5c4af71d1ce5517730b18`.
Compared independently to main public REA base66 outputs, exactly
11 added public tick/time64 symbols; zero original export names,
kinds or typed signatures changed, one original authorized heap
import. Raw REA evidence remains local under `~/NSMBcowork/notes`.

Time64 remains a copyright-free deterministic *synthetic* one-ledger
diagnostic. Status10 time-rewind, status7 invalid host magic/address,
status12 raw-lowword unpaired are correctly tested. It is not original
Wii OSGetTime, interrupts, IOS/GX/HLE, game startup or gameplay.

Separate STOP: W01 old auditor SHA9708663 remains RED for duplicated
Unicode REL/metadata, invalid schema/MAP/probe, and original-owner DOL
SHA/profile provenance mismatch; no Nintendo original code was tested.
Only Mario may merge/push main, after independent Peach source review.
