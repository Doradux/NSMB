# Phase 3 — current-main single WebAssembly W03/W07 browser host

**Synthetic engineering prototype, not game boot.** The branch `agent/luigi/w03-phase3-single-wasm` starts from public `main` at `da10f58` and copies only Luigi's independently approved W03 synthetic source from `1f2b4f8`. The compiler links that W03 state machine against **unchanged** current-main `web-runtime/src/guest_memory.cpp`, `interop/synthetic_guest.cpp`, and `interop/device_policy.cpp`.

There are **no original Nintendo images, binaries, translated game functions, credentials, toolchain contents or copyrighted game assets** in this branch.

## End-to-end contract

The **normal runtime** `dist/frame_loop.mjs/.wasm` is **ONE actual Emscripten Wasm instance** with C++ calls between:
- W03 bounded synthetic host contexts (up to 8 slots, each 1..32 guest steps, IDs 1..65535);
- W04 big-endian 8/16/32-bit checked Wii MEM1/MEM2 sparse RAM backing and configurable page budget;
- W07 typed MMIO/GX checked policy, which **fails closed** without a registered C++ handler.

The exported scheduler interface is `nsmbw_loop_{reset,spawn,tick,frame,suspend,resume,cancel,reap,retry_quota,state,pc,reg_a,guest_error,yields,ready,paused,done,faulted,cancelled,trace_length,trace_at,trace_dropped,error}`. Read-only browser actions use `host.mjs` to call the Wasm exports via `requestAnimationFrame`, maximum 1..64 steps per frame and a finite maximum frame count. Host state has per-run generation counters, cancellation guards and failed-RAF retry protection. Every guest write executes **before** committing its PC, registers or DONE status. Status is captured immediately into the affected guest context.

The current W07 checked operation is `nsmbw_interop_step(srcGuest:u32,destGuest:u32,addend:u32)->1/0` followed by `nsmbw_interop_status()->0..6`. The full failure contract:

| Status | Meaning | Behavior |
|---|---|---|
| 0 | Successful checked synthetic guest operation | Commit PC, register and trace |
| 1 | Unmapped guest RAM | FAULT only this context |
| 2 | 32-bit address wrap | FAULT only this context |
| 3 | Sparse quota/allocation failure | FAULT without PC advance; may retry after explicit host quota adjustment |
| 4 | MMIO/GX missing handler or invalid straddle | FAULT, no automatic retry |
| 5 | Device callback explicitly rejected | FAULT, no automatic retry |
| 6 | Invalid callback reply | FAULT, no automatic retry |

Status 5/6 are tested using an **entirely separate** `frame_loop_fixture.mjs/.wasm` built with unchanged W07's `interop/test/mock_device_policy.cpp`. It exports `nsmbw_test_policy_install(mask)`, `nsmbw_test_policy_rejection(code)` and associated counters **only for tests**. Production-style normal Wasm has no test hook and never registers a fake device handler. `server.js` exact allowlist only exposes normal `demo.html`, `host.mjs`, `frame_loop.mjs` and `frame_loop.wasm`; it NEVER serves the fixture.

`asyncify-guard.mjs` rejects a second simultaneous `ccall({async:true})` before entry to the same Wasm instance. Its independently compiled `asyncify_probe.wasm` exercises the guard. The original unsafe W03 WAsm native-style fiber semantics are not used by this host.

## Interactive local browser demo

```powershell
cd <this-branch-worktree>
.\web-runtime\frame-host\build.ps1 -Emsdk 'C:\path\to\your\private\emsdk' -WithTestFixture
.\web-runtime\frame-host\build_asyncify.ps1 -Emsdk 'C:\path\to\your\private\emsdk'
$env:PORT=3019
node server.js
```

Open `http://127.0.0.1:3019/web-runtime/frame-host/demo.html`. Buttons **Start, Pause, Resume, Stop and Reset** operate the same actual compiled WAsm instance. The main synthetic scenario shows three context PCs and registers, one MMIO denied status4, two completed contexts, guest page count and bounded trace. A demo does not render a real game frame.

## Full repeatable acceptance tests

```powershell
$env:NSMB_W03_HOST_ROOT = (Get-Location).Path
$cases = @(Get-ChildItem web-runtime/frame-host/test -File -Filter '*.test.mjs' | ForEach-Object FullName)
$cases += @(Get-ChildItem tests/phase3 -File -Filter '*.test.mjs' | ForEach-Object FullName)
node --test @cases
```

From authorized `marcos` 2026-10-14:
- **16/16** original reviewed linked host tests on current W07: real Wasm, actual Chrome, Asyncify rejection and lifecycle/fault handling.
- **5/5** additional Node typed-policy tests for status4/5/6, malformed or rejected device callback, strict no-handler runtime, MMIO/GX boundary and reset.
- **1/1** actual Chrome typed-policy test; browser invokes two compiled Wasm instances (normal and test fixture) and validates guest error codes 4/5/6 across five actual RAF callbacks.
- **1/1** interactive-site Chrome test for Start/Pause/Resume/Stop/Reset against compiled normal Wasm, exact server allowlist, malformed URLs and private/fixture denial.
- **2/2** 128-cycle Node + Chrome stress tests on a **single normal linked Wasm instance** per test: 128 resets, 512 real Chrome RAF callbacks, 896 guest operations, 128 isolated MMIO failures, no guest-page or guest-PC leakage.
- **25/25 expected** across the above suites when Chrome/Brave is present and explicitly run. Any skipped browser test is NOT considered verified.

The code does NOT prove process/linear-Wasm heap OOM safety (`HEAPU8` isn't exposed), frame-accurate Wii timing, native stackful `HostContext::Switch` semantics, ISR/interrupt correctness, translated PPC ABI, actual MMIO/HLE handlers, GX rendering, original boot or gameplay. These remain gated by Mario's private W01 verification and additional independent reviews.

## Peer-review criteria before Mario merge

1. Rebuild normal and fixture Wasm using your own authorized Emscripten SDK; verify the generated *normal* module has no mock callback exports.
2. Run every Node and **actual browser** test from a clean checkout, inspect console errors and HTTP allowlist.
3. Inject final-instruction MMIO/status5/status6 failures: check no PC/register/DONE commit, no peer corruption, no secret files.
4. Inject initial RAF throw and stale callbacks after cancellation/stop; verify restart works and old callbacks cannot consume new session work.
5. Repeat 128 resets with three contexts: bounded dispatch and cleared pages/trace. Critique actual heap bounds separately.
6. Demand separate proof before claiming authentic Wii game boot. Only Mario merges reviewed work.
