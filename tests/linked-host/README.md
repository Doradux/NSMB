# Phase 3 independent acceptance — one linked synthetic WebAssembly module

This QA-only branch started from public main `da10f58`. The test harness does
not contain Nintendo binaries, extracted assets, translated guest source,
credentials, or toolchains. **Passing does not mean an authentic Wii game boots.**

## Current independent checkpoint

- Exact reviewed candidate: `00cd8e4` on
  `agent/luigi/w03-phase3-single-wasm`.
- Independent detached checkout:
  `C:\NSMBcowork\worktrees\Peach-W03-Phase3-Final-Review`.
- Rebuilt **from C++ using Emscripten**: normal `frame_loop.wasm`,
  separate **test-only** `frame_loop_fixture.wasm`, and
  `asyncify_probe.wasm` — all succeeded.
- Author suites: **27/27 PASS, 0 skipped**; tests include actual Chrome browser,
  128 four-frame sessions, callback states 4/5/6, quota/retry and demo route denial.
- Peach independent suites: **10/10 PASS, 0 skipped**, including real Chrome,
  five-frame three-context interleaving and 128 further `requestAnimationFrame`
  cycles in one joined C++ Wasm module.
- Additional Peach adversarial test: one MMIO-read quota fault and an independent
  RAM-only quota fault occur concurrently; MMIO callback remains at **one**
  invocation after budget increase, MMIO retry is rejected, RAM-only retry
  succeeds without changing the other guest's PC.
- Normal Wasm **must not** export `_nsmbw_test_policy_install` or fake device
  handlers. The **separately compiled fixture** must export the same test hooks,
  for exercising typed errors 5/6 without weakening the normal runtime gate.
- Main W04/W07 guest memory/device-policy stays checked and fails closed.

This supersedes the previous `1f2b4f8` RED baseline (which independently
reproduced the stale pre-`onFrame` stop issue). Earlier scratch-only proof was
not an author release; `00cd8e4` is a new clean author commit separately rebuilt
and tested without editing Luigi's worktree.

## Reproduction (Windows PowerShell on authorized machine)

```powershell
$env:NSMB_LINKED_ROOT = 'C:\NSMBcowork\worktrees\Peach-W03-Phase3-Final-Review'
node --test tests/linked-host/contract.test.mjs tests/linked-host/browser.test.mjs
```

To prepare a clean reviewed candidate (do not rebuild the author's worktree),
create an independent detached `git worktree add --detach <path> <exact SHA>`
and compile from the source already present in that worktree:

```powershell
.\web-runtime\frame-host\build.ps1 -Emsdk '<authorized local emsdk path>' -WithTestFixture
.\web-runtime\frame-host\build_asyncify.ps1 -Emsdk '<authorized local emsdk path>'
$env:NSMB_W03_HOST_ROOT = (Get-Location).Path
$cases = @(Get-ChildItem web-runtime/frame-host/test -File -Filter '*.test.mjs' | ForEach-Object FullName)
$cases += @(Get-ChildItem tests/phase3 -File -Filter '*.test.mjs' | ForEach-Object FullName)
node --test @cases
```

Node 24+ and a local Chrome/Brave executable are required. No browser tests
may be skipped when claiming browser verification. `NSMB_BROWSER` can override
browser binary discovery.

The QA browser fixture serves only five exact static resources from a randomly
assigned localhost port. Requests for private game files, source-code paths,
Git metadata and unlisted assets must respond with 404. Browser isolation uses
an ephemeral profile and the reviewed W06 CDP harness with awaited cleanup.

## Acceptance checks

1. Execute actual linked C++ Wasm guest operations from three contexts;
   verify independent PC, register and MEM1/MEM2 state and a legitimate zero read.
2. Fault on the **last** MMIO instruction without committing PC/DONE.
   Check typed denied (4), callback rejected (5) and malformed (6) outcomes.
3. Retry only after an explicit increased RAM quota: only status 3 and a
   guest-local retry-safe decision permit it. External MMIO side effects must
   **never** replay after a later RAM allocation failure.
4. Suspend/resume within `onFrame`; re-snapshot ready count **after** callback
   to avoid a premature `blocked` result.
5. Reject overlapping Asyncify calls; recover from first RAF throw; isolate
   callbacks from previously cancelled/stopped generations.
6. Repeat 128 Node task reset/reap cycles and 128 extra real browser animation
   cycles with exact page count, bounded trace, PCs and deterministic output.
7. Degrade absent/permission-denied Gamepad to neutral input, verify
   `OfflineAudioContext` only renders a synthetic silent-speaker PCM buffer,
   and verify Canvas2D fallback when WebGPU is disabled.

## Historical RED reproduction (kept for regression)

Against untouched earlier W03 `1f2b4f8`, this suite originally exposed
`reason='blocked'` despite a context being resumed inside `onFrame`.
The initial typed-policy test incorrectly expected test hooks inside the
normal Wasm; independent Toad review identified the test-harness/production
fixture separation. The test now **requires normal hooks be absent and
test-fixture hooks be present**, while preserving all typed failure assertions.

## Explicit limits

The scheduler is a synthetic state-machine PC, not a saved Wii PowerPC
`HostContext` stack, real guest fibers, HLE device implementation, executable
translation, actual gamepad/Wii Remote integration, live audio, graphics/GX,
or a demonstrated game boot. Sparse-page-quota testing is **not** proof of
actual browser heap OOM behavior, thread safety or frame-accurate performance.

The independent reviewed test suite and the author commit require their own
formal reviews. Mario alone decides whether to integrate reviewed changes
into main. Separate W01 DOL hash / function correctness issues still block
claims of original game compatibility.
