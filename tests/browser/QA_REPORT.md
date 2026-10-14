# Peach QA report — W06, 2026-10-14

- Baseline: `origin/main` commit `18665b2`, worktree `agent/peach/w06-browser-qa`, device **marcos** (Windows).
- Exact command: `node --test C:\NSMBcowork\worktrees\Peach\tests\browser\regression.test.mjs`
- Browser: automatic locally installed Brave/Chrome headless with `--disable-gpu`, clean ephemeral user profile, local ephemeral Node HTTP port.
- Final baseline results: **9 tests, 6 passed, 3 failed**. False-positive disclaimer regex fixed in the test itself; all three remaining failures are real. The previous eight-test pass/fail ratio was 6/2.

## Confirmed successes

1. English home and WASM diagnostic; explicit not-gameplay descriptions.
2. Assets served successfully with expected MIME, actual PNG dimensions **1920×1080**, WASM MIME `application/wasm`.
3. Unknown URL paths, traversal attempts, repository internals and C++ files all return 404; normal root remains available.
4. Browser DOM renders real image with natural dimensions 1920×1080 and alt text.
5. Keyboard Tab moves focus to accessible home link.
6. **11/11 WebAssembly checks genuinely execute in the browser**, including MEM1/MEM2, endian, page boundary, MMIO rejection and reset.

## Confirmed regressions (reproducible failures)

**W06-BUG-01 — Very narrow mobile layout expands viewport:** Chrome DevTools emulated 320px mobile viewport results in `window.innerWidth === 322` and `document.documentElement.scrollWidth === 322`. This is a 2px horizontal overflow. Header `.nav-github` plus flex spacing forces min-content width. 390px/1440px did not fail. Suggested fix in `styles.css`: reduce `.nav-wrap` gap and `.nav-github` padding/text width at <=360px, recheck focus and wrapping.

**W06-BUG-02 — Missing diagnostic favicon causes a console error:** On `/web-runtime/lab.html`, the browser requests `/favicon.ico` (not on the server allowlist). Response: HTTP 404; DevTools `Log.entryAdded` reports `Failed to load resource`. Suggested fix: add an explicit `<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">` to `web-runtime/lab.html` (already allowlisted). The 11 WASM checks themselves still pass.

**W06-BUG-03 — Malformed URL crashes the server:** On baseline main `server.js:20`, direct request `GET /%` crashes the Node process with `URIError: URI malformed` from `decodeURIComponent(...)`, causing socket reset and `fetch failed`. The ninth test reproduces this safely at the end of the suite, after all browser coverage. Fix: catch malformed URL decoding in the HTTP handler and respond 400 (or 404) while keeping the server alive; ensure this case is covered in CI. The same bug exists in Luigi W02 `server.js`.

## Independent W02 review (separate worktree; not incorporated here)

`node --test C:\NSMBcowork\worktrees\Luigi\web-runtime\test\gpu_lab.test.mjs` passed **2/2** (HTTP and Canvas fallback only). Reproduced additional denial-of-service: with `PORT=3008 node server.js`, request `curl.exe -i http://127.0.0.1:3008/%` resets connection and terminates Node with `URIError: URI malformed` at `server.js:20`. WebGPU asynchronous rerun/device-loss races remain untested and unsafe. Formal `CHANGES REQUESTED` review filed with Mario and Luigi.

## Handling

No changes were made to Mario's main checkout, Luigi's worktree, game image data or proprietary Wii originals. The W06 branch adds QA files only. Three red tests are intentionally retained as acceptance blockers pending product fixes.
