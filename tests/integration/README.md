# W03 + W07 synthetic integration acceptance (Peach)

This is an **integration QA fixture**, not a playable game or Wii scheduler implementation.
Both WebAssembly binaries are real Emscripten C++ outputs and are loaded as **separate modules**.
No Nintendo binaries, private manifest, ROM paths, original guest functions, or game media
are copied, served or committed.

## Test against separate reviewed branches (Windows / PowerShell)

From this repo's root (Peach integration QA branch), set:

```powershell
$env:NSMB_W03_ROOT = 'C:\NSMBcowork\worktrees\Luigi-W03-Review'
$env:NSMB_W07_ROOT = 'C:\NSMBcowork\worktrees\Toad-W07'
node --test tests/integration/w03-w07.test.mjs
```

Run the original module tests separately as well:

```powershell
node --test "$env:NSMB_W03_ROOT\web-runtime\test\scheduler.test.mjs" "$env:NSMB_W03_ROOT\web-runtime\test\scheduler_adversarial.test.mjs" "$env:NSMB_W03_ROOT\web-runtime\test\asyncify.test.mjs" "$env:NSMB_W03_ROOT\web-runtime\test\scheduler_browser.test.mjs"
node --test "$env:NSMB_W07_ROOT\web-runtime\interop\test\step.test.mjs" "$env:NSMB_W07_ROOT\web-runtime\interop\test\browser.test.mjs"
```

Requires Node 24+, working compiled synthetic W03/W07 artifacts, and Chrome/Brave
for the actual browser test. Set NSMB_BROWSER explicitly if auto-discovery fails.
If the modules are later combined in the same repository, both NSMB_*_ROOT variables
can be omitted and the paths default to the current repo root.

## Acceptance coverage

- Real Wasm scheduler and checked guest-memory interop, no mock function substituting execution.
- Three context interleavings with deterministic order, one paused and resumed.
- Browser host yields with requestAnimationFrame and finite turn budget (nine actual scheduled dispatches).
- Valid zero-valued mapped memory read is not confused with a failed operation.
- MMIO/GX, unmapped addresses, 32-bit wrap and page-quota exhaustion produce explicit
  **4, 1, 2, 3** interop status codes shown in the DOM.
- Cross-page store failure must not partially corrupt the destination.
- Canvas2D fallback is verified when WebGPU is explicitly unavailable; RGB values
  allow one least-significant-bit rounding difference from Chrome color conversion.
- No private resources are present in an exact, five-resource HTTP allowlist.
- Repeated 128 reset/pause/resume/guest error cycles check bounded trace, quota
  reset, no stale state, correct completion and repeatability.
- Isolated localhost server on an assigned port and fresh Chrome profile;
  cleanup awaits process exit and removes the profile using the W06 reviewed harness.

## Known boundaries and blockers

- Distinct Wasm modules do not exchange a PowerPC CpuContext. Scheduler outputs IDs and
  Node/browser hosts invoke a *separate* W07 module for those IDs. This tests integration
  orchestration, not native translated stackful C++ fibers or actual game functions.
- W03 cannot reclaim eight DONE context slots without global reset; concurrent Asyncify
  calls on the same module caused an uncaught out-of-bounds trap in separate adversarial
  testing. These issues are filed as W03 review blockers; this acceptance suite does not
  exercise unsafe concurrent Asyncify, and must NOT be used to approve it.
- W07's synthetic page-budget failure is not real browser memory exhaustion.
- GPU hardware rendering, actual controller input, Wii DVD, game audio, graphics GX,
  real time VI retrace, interrupts, latency deadlines and original game boot are untested.
- Tests are independent; only Mario should integrate reviewed W03/W07 implementations into main.
