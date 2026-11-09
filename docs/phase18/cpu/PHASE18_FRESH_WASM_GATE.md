# PHASE18 W03 — opt-in new-Wasm build, provenance, and browser gate

**Status on marcos-hpr, 2026-11-09:** BLOCKED-ENV + BLOCKED-PEER-API in Peach's standalone stacked worktree. `em++`, `emcc`, `dotnet` and REA6.5 are not available in PATH, and Mario has NOT merged Toad's reviewed pure Time64 headers into this source tree. No new Phase18 binary has been built; no original Nintendo code, HLE, ROM/DOL/REL or real game execution has occurred. Running the old `dist/frame_loop.wasm` in Chrome cannot prove this new source.

## Owner and controls

Three new tools under **Peach-owned** `web-runtime/frame-host` implement a fail-closed, opt-in path without downloads, installs or root privileges.

- `rebuild_phase18_user.sh --probe` checks the actual merged Toad public headers (`time64_pure_candidate.hpp`, `time64_pure_clock.hpp`) and delegates to the existing safe Phase17 em++ probe. It returns **78** with `BLOCKED-PEER-API` or `BLOCKED-ENV` when absent.
- `rebuild_phase18_user.sh --build /absolute/empty/external/path` rejects relative, Git-tree and symlinked-back-to-Git paths BEFORE any compiler invocation; refuses dirty/uncommitted source; requires Toad's reviewed pure headers and pinned authorized em++. It delegates compilation to the existing Phase17 public-source builder and then runs the Phase18 static integrity manifest creation and verification. It does NOT overwrite `dist` or change source worktrees.
- `verify_phase18_wasm.mjs --create|--verify /absolute/external/path` binds SHA-256 of 12 current source/header files (including the two pure Time64 headers) and exact generated `frame_loop.wasm`/`frame_loop.mjs` plus full typed imports/exports to a `phase18_artifact_manifest.json` and the current CLEAN Git HEAD. It refuses symlinked artifacts, stale/different bytes, unexpected imports, missing W03 public exports or any private token/forgery/original HLE export. `--create` is run only by the controlled builder after compiler success. Hash equality detects changes AFTER the build; it does not cryptographically attest a compiler or prove authentic Wii provenance.
- `verify_phase18_browser.mjs --verify /absolute/external/path` first REQUIRES successful static Node verification, then (only when `NSMB_BROWSER` points to a real Chrome executable) serves only `/frame_loop.mjs` and `/frame_loop.wasm` from that exact output directory on localhost. A temporary Chromium profile loads the exact bytes and checks SHA-256 with browser WebCrypto, `WebAssembly.validate`, Emscripten module initialization and private export denial, comparing the browser digest to the Node manifest. Browser artifacts not present or browser environment missing => no PASS. On Ubuntu with AppArmor problems, `NSMB_BROWSER_NO_SANDBOX=1` is an explicit **localhost QA-only** concession, not production advice.

The browser loading proof, even once genuinely executed, still would NOT prove that an original Wii guest invoked OSGetTime: the current W03 service is private native C++ code not reachable from arbitrary JS, and no native scheduler service-fixture for newly compiled browser Wasm has yet been independently approved. A separate future test must link a legitimate synthetic guest service request without exporting raw CpuContext pointers.

## Reproducible future commands (DO NOT run until authorized toolchain/peer code exists)

```bash
cd /home/marcos/NSMBcowork/worktrees/peach-Phase18
# With Mario-reviewed Toad headers merged and a pinned user-owned em++ in PATH:
env -u LD_LIBRARY_PATH -u LD_PRELOAD sh \
  web-runtime/frame-host/rebuild_phase18_user.sh --probe

mkdir -p /tmp/nsmb-phase18-new-wasm
env -u LD_LIBRARY_PATH -u LD_PRELOAD sh \
  web-runtime/frame-host/rebuild_phase18_user.sh --build /tmp/nsmb-phase18-new-wasm

# Hash/source/import/export verification must match current CLEAN Git SHA:
env -u LD_LIBRARY_PATH -u LD_PRELOAD node \
  web-runtime/frame-host/verify_phase18_wasm.mjs \
  --verify /tmp/nsmb-phase18-new-wasm

# Real browser test only after the previous artifact actually exists and
# NSMB_BROWSER refers to the intended locally installed Chrome binary:
env -u LD_LIBRARY_PATH -u LD_PRELOAD NSMB_BROWSER=/absolute/chrome \
  node web-runtime/frame-host/verify_phase18_browser.mjs \
  --verify /tmp/nsmb-phase18-new-wasm
```

The directory must be **empty** before compiling; the builder leaves source unchanged. Save resulting SHA, compiler version/commit, import/export map, Node result, browser result and reviewer exact SHA. DO NOT copy an old `dist/*.wasm` into that folder and claim it was rebuilt.

## Adversarial negative tests run NOW, without any SDK

```bash
env -u LD_LIBRARY_PATH -u LD_PRELOAD node --test \
  tests/phase18/peach/wasm_integrity_gate.test.mjs
```

Eight Node methods verify absence of compiler/peer => exit 78; relative destination => exit 64 before mkdir; Git source destinations => exit 64; missing manifest/empty artifact cannot pass; bogus CLI cannot pass; no browser executable => exit 78 with no Chrome launched. These are **safety gate tests**, NOT executions of a new Wasm binary. A valid minimal/old Wasm binary still cannot pass the SHA-pinned current-source manifest checks by copying it from `dist` alone.

## STOP conditions

No concurrent native Wii CPU thread scheduling guarantee, authoritative original DOL SHA, independently attested C# recursive producer, original Wii HLE/GX/IOS/IRQ/VI or game boot exists in this source-only stage. The Phase18 stacked branch starts at Mario's Phase17 *preview* `c12e8b0`, not `main`: only Mario may reconcile histories and integrate after exact peer signatures.
