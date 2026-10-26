# Phase 15 W15-B — Peach: bounded synthetic CpuContext in Node + real Chromium

**Scope:** existing, tracked, copyright-free WebAssembly artifacts only. **No original
Wii code, images, proprietary translator output, or gameplay.** No new compilation
was performed on the Ubuntu agent machine: no `emcc`, `dotnet`, or REA 6.5
Windows CLI found. This is a runtime parity/ABI gate for the **already-compiled**
public test fixtures, not a claim of freshly translated PPC in this phase.

## Precise evidence and permitted conclusions

`phase15-leaf-evidence.mjs` is imported **unchanged** by two independent execution
surfaces: Node and actual Chromium (via a 127.0.0.1-only HTTP allowlist). Both
verify the same SHA-256 of all three actual Wasm files, WebAssembly validity,
and exactly one `env.emscripten_resize_heap` import per artifact.

| Tracked Wasm artifact | SHA-256 |
|---|---|
| `dist/frame_loop.wasm` | `32d4313e0ab8c27a6146d132492bd2f773fdb7c817534d2d4fb54e5fc6d185a1` |
| `dist/frame_loop_translated_fixture.wasm` | `7222c2e5bbd0174ce914d717c7a1b3f0d8b78d5382f21264796d573287516ba8` |
| `dist/frame_loop_translated_readwrite_fixture.wasm` | `61ab14a6a1c0d3eb9730671563d465b5481d720f9d8b6437bf822b2cdea5bf2c` |

The existing translator fixture source in the repository states that the first
Wasm includes C# Translator.Cli-emitted **two-op synthetic** C++ with
`extern "C" void func(CpuContext*)`; the second carries synthetic
`STW r3,0(r4); LWZ r5,0(r4); STW r3,0(r6); BLR`. The phase 15 tests
exercise the **published compiled binaries** and verify their external ABI and
outputs. They do **not** independently re-run the translator, compile C++,
compare generated source provenance, or prove all upstream translation behavior.

- CpuContext exact compiled layout/offsets: 464 bytes, alignment 8,
  GPR/CR/LR/CTR/XER/FPSCR/PC/FPR/GQR and HID/MSR offsets; invalid query denied.
- Three synthetic contexts: GPR3 wrapping, r2/r13 isolation, SP unchanged,
  LR/PC exit semantics, one emitted synthetic function call per context;
  48 complete resets and no leaked pages.
- Compiled checked-MEM RAM fixture: alias forwarding of staged STW to LWZ,
  final two RAM commits; late page-quota rollback leaves PC/GPR5/RAM/page
  count unchanged; MMIO second write denied without calling a fake device,
  with no retry or leaked pages.
- Production-normal compiled Wasm: feature bits 1/2/4 and unknown flags
  (FPR/paired/GQR/unsupported) must DENY **before context or page mutation**;
  normal module must not export mock device handlers or test-only translator spawn.
- HTTP server for Chrome is bound to `127.0.0.1`; only the test page,
  one contract module and these three module+Wasm pairs are accessible.
  Nintendo/private paths and fixture internals return HTTP 404.

## Reproduce on marcos-hpr

From the Peach phase15 branch's worktree:

```bash
env -u LD_LIBRARY_PATH -u LD_PRELOAD \
  node --test tests/phase15/peach/synthetic-leaf-node.test.mjs

env -u LD_LIBRARY_PATH -u LD_PRELOAD \
  NSMB_BROWSER=/absolute/path/to/chrome \
  node --test tests/phase15/peach/synthetic-leaf-browser.test.mjs
```

The browser test intentionally **skips** when `NSMB_BROWSER` is unset or
the executable does not exist; count it as NOT VERIFIED in that circumstance.
On marcos-hpr, Chromium Linux 154's normal namespace sandbox fails due Ubuntu
AppArmor restrictions: the legacy Chrome test times out waiting for DevTools.
For an expressly limited synthetic QA on **localhost only**, the new test
can be run with additional `NSMB_BROWSER_NO_SANDBOX=1`. Disabling the browser
sandbox weakens process isolation and is **not a production setting**, and
it must never be used with untrusted websites or Nintendo materials.

Node 22 should be invoked with `env -u LD_LIBRARY_PATH -u LD_PRELOAD` on this
agent because the remote agent loader's injected libcrypto can break `/usr/bin/node`.

## Missing proof and mandatory STOP

1. **BLOCKED-ENV:** no `emcc` / .NET Translator.Cli on this Ubuntu agent;
   the committed binaries were not freshly reproduced by this phase.
2. **BLOCKED-ENV:** old `tests/phase8/rea-clock-abi.test.mjs` needs external
   REA 6.5 and PowerShell `C:/NSMBtools/rea.cmd`, plus separately selected
   clock checkout. Static typed signature verification using that REA cannot
   be claimed PASS here. Wasm import/export enumeration is weaker.
3. This is **synthetic W03 CpuContext behavior**, not a proof of a private
   original leaf: DOL SHA identity mismatch, MAP one-to-one vs recursive public
   C# discovery, unsupported FPR/GQR/64-bit and native overrides, and unknown
   ABI/HLE/IRQ/GX/IOS effects remain STOP.
4. A browser Wasm smoke test cannot prove arbitrary translated function
   semantics, stackful native fibers, shared memory safety or boot/gameplay.
5. Toad's real `OSGetTime` r3/r4 gate is independent. Never silently
   substitute low32 checked RAM clock or a no-op HLE stub.

**Next actions for Mario:** obtain peer review of exact Peach branch SHA,
rebuild byte-identical artifacts from a pinned public translator toolchain on
a suitable authorized machine, re-run REA 6.5 on the *rebuilt* artifacts,
and independently review Toad's time64 service. Do not merge `main` or
enable a Nintendo leaf until the P0 private identity and ABI gates are cleared.
