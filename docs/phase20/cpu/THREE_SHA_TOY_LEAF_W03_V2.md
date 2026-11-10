# Phase20 Peach: genuine invented generated PPC-Lite under W03 + Toad V2 + private quota

## Three independently authored source boundaries

- **Luigi** owns a wholly invented 32-bit PPC-Lite word sequence generated
  into `scripts/phase20/luigi/toy_leaf_generated.cpp` with
  `toy_leaf_abi.hpp` (`Input` 24B / `Result` 20B, no CpuContext pointer
  or service authority). `evaluate({entryOffset,Entry,initialR3,LR,SP,128})`
  interprets the invented function with result `initialR3 + 18` (nested
  `entryOffset=0x40` gives +4), steps8 on root, returned PC Entry+4.
- **Toad** owns `synthetic_service_v2.hpp` with pure/forgable
  `compute(RequestV2,ViewV2)` and typed Version 2,
  `0x53560001` nanoseconds, `0x53560002` raw ticks. Claimed
  `origin=nativeScheduler`, serial-like metadata, sourceEpoch and
  `claimedBudget` are data, NEVER grants or real consumed quota.
- **Peach/W03** exclusively owns actual private native `Ticket`,
  owner/epoch/serial, expected PC, service ID, actual
  `serviceQuota=1` on brand-new fictional guest and single mutable
  canonical `clockTicks+clockRevision` plus CPU GPR3/GPR4/LR/PC/steps.

No authority is delegated to the leaf function or public pure dispatcher.
None of this code is a Nintendo game function or actual Wii HLE.

## Actual scheduler sequencing

Under compile flags `NSMB_P20_ENABLE_TOY_LEAF` and
`NSMB_P20_ENABLE_SERVICE_V2` (peer sources must be supplied by Mario or
exact read-only Git archive), W03 exports
`nsmbw_loop_synthetic_toy_leaf_fixture_spawn(id,stack,input,output,salt,
initialR3,entryOffset,maxSteps)`. It can ONLY create a NEW
`SyntheticCpu::Entry` fixture; host cannot attach to a running guest.

The fixture verifies the invented leaf once to PREPARE a candidate raw tick
value through **Toad V2 PURE**. W03 privately mints its Ticket, validates
real per-guest quota and stages a service candidate. Preparation leaves the
original `initialR3`, PC, LR, steps and canonical ledger untouched,
private quota still one.

On the NEXT actual `nsmbw_loop_tick()`, W03 enters its trusted
`DispatchScope`, checks actual owner/epoch/PC/revision/quota, then
**re-executes the generated Luigi C++ evaluator inside the real
scheduler** as a pure, prevalidated computation. It requires returned
`rawTicks` to equal the previously approved candidate exactly and
requires a valid return PC/steps. Failure consumes the pending attempt but
does NOT change GPR/FPR/GQR/PC/LR/RAM/clock/quota.

Only after all fallible work is complete, one non-reentrant, no-callback,
no-allocation block commits `r3=ticks>>32`,
`r4=ticks&0xffffffff`, canonical `clockTicks`,
`++clockRevision`, **`--serviceQuota`**, and (only for toy)
`cpu.pc=Entry+4`, preserved LR and `cpu.steps+=8`.
For `initialR3=100`: the actual verified state is
`clock=118, r3=0, r4=118, revision=1, remaining quota=0,
steps=8, PC=0x80010004`. A second call on that same P20 fixture is
denied **before** a native Ticket is minted and causes no partial writes.

When peer modules are NOT provided, the normal published Peach worktree
still uses its P19 stable typed v1 fixture. It does not silently claim
the V2/generated-leaf path was compiled. The peer symbols are enabled
only with the two explicit flags and source files from exact peer Git
commits.

## Reproducible real three-SHA source build WITHOUT merging main

From clean, committed Peach own Phase20 branch, after peer commit hashes
are known:

```sh
out=$(mktemp -d /tmp/nsmb-p20-three-sha-XXXXXX)
sh web-runtime/frame-host/build_phase20_peers_container.sh \
  --build "$out" "$TOAD_SHA40" "$LUIGI_SHA40"
node web-runtime/frame-host/verify_phase20_three_sha_node.mjs \
  --verify "$out" "$TOAD_SHA40" "$LUIGI_SHA40"
NSMB_BROWSER=/home/marcos/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome \
 NSMB_BROWSER_NO_SANDBOX=1 \
 node web-runtime/frame-host/verify_phase20_three_sha_browser.mjs \
  --verify "$out" "$TOAD_SHA40" "$LUIGI_SHA40"
```

The wrapper verifies full lowercase SHA40 commit existence, clean own source,
original absolute/empty external /tmp output, exact cached
Emscripten6.0.13 Docker image ID, no network/pull/sudo/privileged. It
creates a disposable source directory populated by `git archive` from
**three exact Git commits**, mounting `/work:ro` and `/output:rw`,
then compiles actual W03/W04/W07 + translated generated leaf in ONE
new Emscripten Wasm with macros. It leaves every peer worktree and
`main` untouched. Source manifest includes THREE commit IDs, SHA256 of
all 18 public input blobs, link flags, source ownership and binary SHA.
The Node verifier independently checks each source SHA against its Git
commit object, binary imports/exports and executes actual toy guest; real
Chromium repeats the SAME oracle on SAME Wasm/MJS byte hashes and cleans
its profile and localhost server.

These manifests demonstrate reproducible physical bytes, not a signed
C# translator or original owner Wii DOL; user-created invented source
cannot establish Nintendo provenance. Mario alone integrates reviewed
source SHAs and repeats combined QA before updating `main`.

## Independent native evidence

`tests/phase20/peach/peer_toy_service_native.cpp`, real g++ W03/W04/W07
plus both peer sources from immutable Git archives under /tmp: exact
V2 status and untrusted GateView, generated root/nested toy function
execution in actual W03, service quota1→0 and full CPU/clock no-write
on denied second attempt, invalid/unknown leaf PC, wrong step budget,
64-bit high-word raw-ticks carry, multiple guest quotas, reset/reap/
cancel/pause and 256 real reset/spawn/commit cycles. No shadow
JavaScript simulation or original Nintendo assets.
