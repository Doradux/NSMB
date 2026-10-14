# W06 — Browser smoke and regression suite

Run from repository root (or using an absolute test path):

```powershell
node --test .\tests\browser\regression.test.mjs
```

Requirements: Node.js 24+ (built-in `fetch` and `WebSocket`); installed Brave/Chrome/Chromium, or set `NSMB_BROWSER` to an absolute browser executable path. No npm packages, Selenium, Playwright, private ROMs or additional runtime dependencies are needed. Existing public preview assets are checked, but no new assets are copied or committed.

The runner starts an ephemeral localhost server on an OS-assigned port (it does not touch port 3000), starts a separate headless browser with an isolated temporary profile and GPU disabled, attaches using the Chrome DevTools Protocol, awaits BOTH child exits and verifies profile removal. Default Chrome sandbox is enabled; only explicit NSMB_CI_NO_SANDBOX=1 overrides it in isolated CI. Only tests/browser files are added. The tests do not use the user browser profile.

## Coverage and limitations

- English page and correct statement that no gameplay exists.
- HTTP/MIME and bytes for HTML, styles, JavaScript, SVG, PNG and WebAssembly.
- Original screenshot PNG **actual** dimensions 1920×1080, not just HTML width attributes.
- Static allowlist denies unknown routes, source files and traversal patterns; invalid percent-encoding must return a controlled HTTP error without terminating Node.
- Browser DOM: conceptual screenshot loaded, alt text, navigation and diagnostic link.
- Headless mobile/desktop layout at 1440px, 390px and 320px with overflow assertions.
- Keyboard Tab focus on real browser link.
- All **11** WebAssembly tests are executed in real headless Chromium and verified line by line.
- Developer console exceptions/errors, including missing assets from real browser navigation.

This suite **does not** validate GPU hardware/WebGPU, authentic Wii code execution, gameplay, translated PowerPC functions, accessibility compliance or runtime performance.

## Expected existing defects

The initial baseline origin/main commit 18665b2 failed 3/9 genuine product assertions. After reviewed W02 + UI patches landed on main (0d97ed2), **all 9/9 tests pass** with assertions unchanged. A separate self-test suite (`node --test tests/browser/harness.test.mjs`) proves navigation loader synchronization, event attribution, timeout causes and child/profile cleanup (4/4). Run both suites before review. Browser checks are scoped by loader/frame ID, lifecycle load event and URL, and the runner waits for a bounded event quiet period.

W02's synthetic browser graphics lab is now integrated in main, but remains separate from W06's nine page/WASM smoke checks. Neither suite proves real WebGPU hardware, GX, or original game boot.
