# W06 — Browser smoke and regression suite

Run from repository root (or using an absolute test path):

```powershell
node --test .\tests\browser\regression.test.mjs
```

Requirements: Node.js 24+ (built-in `fetch` and `WebSocket`); installed Brave/Chrome/Chromium, or set `NSMB_BROWSER` to an absolute browser executable path. No npm packages, Selenium, Playwright, private ROMs or additional runtime dependencies are needed. Existing public preview assets are checked, but no new assets are copied or committed.

The runner starts an ephemeral localhost server on an OS-assigned port (it does not touch port 3000), starts a separate headless browser with an isolated temporary profile and GPU disabled, attaches using the Chrome DevTools Protocol and destroys both processes afterward. Only tests/browser files are added. The tests do not use the user browser profile.

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

As of baseline `origin/main` commit `18665b2`, 3/9 tests fail, for genuine regressions (see `QA_REPORT.md`). Do not disable or weaken these tests to make the suite green; Mario should address the original HTML/CSS/server fixture and the tests should then pass.

The separate W02 graphics prototype remains in Luigi's branch and is not assumed to be part of this main-based suite.
