# W02 — Browser graphics presenter contract (proposed)

Scope: asset-free browser-graphics experiment by Luigi. This is **not** an implemented Wii GX renderer.

## Findings in Aurora source

| Native area | Current behavior | Browser adapter seam |
|---|---|---|
| `aurora-main/lib/webgpu/gpu.cpp:602-624` | Takes `SDL_Window*`, makes a native Dawn surface descriptor | HTMLCanvasElement + `canvas.getContext('webgpu')`; browser controls the surface |
| `gpu.cpp:670-678; 887-889` | Requests a native Dawn adapter/device | `navigator.gpu.requestAdapter()`, then `adapter.requestDevice()`, with explicit asynchronous progress/error states |
| `gpu.cpp:1161-1167` | Surface `Configure` plus offscreen render target reallocations | Track canvas backing-pixel size, `GPUCanvasContext.configure`, recreate EFB/depth/copied targets only when dimensions change |
| `window.cpp:358-368` | SDL `WaitEvent` may block a native thread | Browser `requestAnimationFrame`, event callbacks, visibility/pause and cooperative scheduler (W03) |
| `aurora-main/CMakeLists.txt` | Native Dawn + SDL providers, platform-specific linker paths | Choose and validate either Emscripten WebGPU C/C++ bindings or an explicit JS <-> Wasm adapter; no native OS-window handles |

Aurora's GX pipeline and render targets are substantially larger than this graphics smoke test. The port must preserve Wii EFB and FIFO timing, GPU command semantics, texture conversion, presentation sizing and latency; a single clear/pass cannot demonstrate these.

## Proposed boundary (discussion interface; not production code)

```text
BrowserGraphicsAdapter
  initialize(canvas, requestedSettings) -> Promise<Capabilities>
  createTexture(descriptor) / releaseTexture(handle)
  uploadTexture(handle, bytes, pitch) -> Promise<Result>
  submitRender(commands, shaderBindings, target) -> Promise<Fence>
  present(frame) -> Promise<Result>
  resize(pixelWidth, pixelHeight, scale) -> Promise<Result>
  onDeviceLost(reason) / recover() -> Promise<Result>
  dispose()

Capabilities: {webgpu, format, limits, features, maxTextureSize,
               backend, errorReason}
Results: status {verified, unavailable, timeout, failed, lost}
```

The adapter is a browser host layer, not a replacement for guest-memory protection or GX emulation. C++ guest frame data must cross a checked allocation/length/stride boundary; never export raw Wii 32-bit pointers to JS and assume the flat 4 GiB mapping works.

## Two architecture paths to evaluate

1. **Emscripten WebGPU/wasm C++ binding:** closest to Aurora's `wgpu::` use, but confirm Dawn native API compatibility, supported surface descriptors, async callback behavior, compiler versions and CMake flags. Do not assume native Dawn binaries link into browser Wasm.
2. **JS browser-GPU adapter:** JS owns DOM canvas, WebGPU device/surface and device loss; wasm exports command buffers/resource uploads over a checked ABI. Requires explicit GPU resource and shader caching contract. Simpler web integration, more glue, possible extra copies.

For either design, preserve `getPreferredCanvasFormat()` for presentation but choose test/readback textures explicitly (e.g. `rgba8unorm`), align `bytesPerRow` to 256, and handle unexpected loss and context reconfiguration. Translate/compile any future shader representation with validated pipeline descriptors rather than assuming desktop native pipeline formats carry over.

## Implemented falsifiable prototype

`web-runtime/gpu-lab.mjs` creates an **asset-free WGSL vertex + fragment shader** and fullscreen triangle in an offscreen 1x1 `rgba8unorm` target. The clear color is BLACK; shader output is expected to be RGB (28, 109, 168), recovered from a mapped GPU buffer with 256-byte row alignment. Mocks exercise shader/pipeline/draw calls, but a real browser GPU is needed to validate actual WGSL compilation and rendering.

A separate WebGPU canvas presentation clear and queue-completion check follows successful readback. The design does not yet implement shaders for the visible canvas nor any GX/EFB work.

## Current test evidence on marcos

- Node command: `node --test web-runtime/test/gpu_lab.test.mjs` -> **11/11 passed** (9 simulated lifecycle/GPU-path, one HTTP allowlist/MIME, one real headless Canvas fallback).
- Real Chrome headless with GPU disabled -> Canvas2D verified, WebGPU unavailable.
- Real Chrome headless with default GPU path -> WebGPU adapter discovery timed out after 4.5 s; GPU command-buffer errors in browser stderr; Canvas2D pixel readback succeeded. **Do not claim real WebGPU support.**
- No shader pipeline, WebGPU texture readback, GX renderer or native game code has been hardware-verified in this environment.
- Generation-scoped async runs, timeout and stale-device-loss guards, late-device destruction, validation of GPU-vs-Canvas status have dedicated tests.

## Acceptance before porting Aurora GX

1. Run lab interactively on a supported, GPU-enabled Chrome/Brave; require `data-gpu-status="verified"` and a correct 1x1 GPU readback, inspect validation errors in DevTools.
2. Compare GPU output with a deterministic screenshot/render target, test resize and forced device-loss recovery.
3. Decide JS-host vs Emscripten binding architecture in a Mario-reviewed ADR.
4. Integrate a single synthetic textured target into the chosen host ABI; use separate peer-reviewed task to bridge real GX.
5. Preserve independent review from Peach and explicit rejection if tests only show Canvas fallback.

Security: no Nintendo images/assets/binaries, translated game code or keys are involved in this worktree.
