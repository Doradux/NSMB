# Phase 3 — independent linked-Wasm stress harness

This branch is a **test-only addition based on current main** (`da10f58`), not the unreviewed W03 implementation. It tests a supplied already-built linked module without copying its source.

Set `NSMB_W03_HOST_ROOT` to a checked-out synthetic W03 host branch containing `web-runtime/frame-host/{host.mjs,dist/frame_loop.mjs,dist/frame_loop.wasm}`. No private Nintendo executable, assets or translated game code are read or served.

Run from repo root:

```powershell
$env:NSMB_W03_HOST_ROOT = 'C:\path\to\reviewed\W03-worktree'
node --test tests/phase3/host_stress.test.mjs tests/phase3/browser_stress.test.mjs
```

Browser test requires Chrome/Brave; optionally set `NSMB_BROWSER` to its executable. A missing module root/browser marks the corresponding test **skipped**, which does *not* count as verified. Both tests use real C++ Emscripten Wasm exports.

Checks: one Wasm instance reused across 128 complete resets/sessions, 3 synthetic guest contexts, 512 bounded browser animation callbacks (2 guest operations max per frame), 896 total guest operations, 128 isolated MMIO faults (status4), per-guest PC and accumulator preservation, deterministic trace, quota three physical 4KiB pages, zero physical guest pages at each reset, no stale context state, and loopback-only four-resource HTTP allowlist. The browser CDP harness verifies status, console errors, request errors and terminates isolated headless Chrome.

Measured on `marcos` with reviewed W03 exact SHA `1f2b4f8` and the joined synthetic W07 memory module: **Node 1/1 PASS and real Chrome 1/1 PASS**, no skips (2026-10-14). Node 128-session synthetic scalar exercise took about 4.1 ms on one run, which is not gameplay performance. `module.HEAPU8` is not exposed by this build, so the harness can assert guest sparse page accounting but **cannot establish WebAssembly linear-heap non-growth or genuine OOM safety**. Browser RAF throughput in headless mode is not a presentation FPS guarantee.

Limits: this does NOT validate typed callback errors 5/6, real MMIO handlers, C++ stackful fibers, PowerPC translation, rendering, audio or Nintendo game boot. The next **separate** feature branch must link the reviewed W03 host code with W07 typed-policy sources from current main and add callback test fixtures after independent approval.
