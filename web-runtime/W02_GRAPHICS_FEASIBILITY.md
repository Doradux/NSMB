# W02 — Browser graphics feasibility: first checkpoint

Owner: Luigi | Branch: `agent/luigi/w02`
Status: **prototype available for peer review; genuine WebGPU path not yet confirmed on an actual GPU-enabled browser**.

## Why the current Aurora renderer cannot be reused unchanged

Inspected upstream source from Mario's reference checkout (read-only), without copying private Nintendo assets:

- `upstream-nsmbw/aurora-main/lib/webgpu/gpu.cpp:602-624`: `create_surface()` gets an `SDL_Window*`, passes it to `utils::SetupWindowAndGetSurfaceDescriptor`, and creates a native Dawn `wgpu::Surface`. Browser presentation is instead attached to an HTML `<canvas>` through `GPUCanvasContext`; this native SDL/window-handle route must be replaced or abstracted.
- `.../lib/webgpu/gpu.cpp:670-678` and `:887-889`: native Dawn adapter/device requests. Browser `navigator.gpu.requestAdapter()/requestDevice()` is asynchronous and permission/capability constrained; make adapter acquisition explicitly async and report errors.
- `.../lib/webgpu/gpu.cpp:1161-1167`: native surface configuration and internal offscreen render target reallocation. Web path requires canvas pixel size updates, WebGPU context configuration and a carefully managed presentation lifecycle.
- `.../lib/window.cpp:358-368`: `SDL_WaitEvent/SDL_PollEvent` control the native event loop. A browser integration must not block the UI event loop; scheduler work belongs to W03.
- `.../aurora-main/CMakeLists.txt`: current graphics dependencies are native Dawn and SDL3 providers. Their CMake paths are not evidence of a WebAssembly browser-compatible build.

Porting the complete GX/EFB pipeline, shader translation, textures and command submission is separate from proving that a browser can clear a GPU surface.

## New standalone lab

- `web-runtime/gpu-lab.html`: accessible status, diagnostic JSON and two distinct canvases. No copyrighted assets.
- `web-runtime/gpu-lab.mjs`: tries native **browser WebGPU** initialization; executes a GPU render pass and copies a 1x1 offscreen `rgba8unorm` texture to a MAP_READ buffer to check RGBA values. It then paints the canvas surface and awaits submission.
- When WebGPU is absent, blocked or no adapter exists, it instead draws an independently testable Canvas 2D image and checks its corner pixel. This **fallback is not equivalent to GPU support or native GX**, and UI identifies the actual active mode.
- Handles resize, high-DPI up to 2x, GPU device loss, and repeat-check button.
- `server.js`: exact allowlist extended for these two new static files, without exposing private directories.
- `web-runtime/test/gpu_lab.test.mjs`: dependency-free Node HTTP/MIME/path-denial tests and real headless Chrome/Brave Canvas fallback test.

## How to run

```powershell
cd C:\NSMBcowork\worktrees\Luigi
node --test .\web-runtime\test\gpu_lab.test.mjs
$env:PORT = '3002'
node .\server.js
```

Open `http://127.0.0.1:3002/web-runtime/gpu-lab.html` in an actual browser. It should say **PASS — webgpu** only after GPU buffer readback, or **PASS — canvas2d** after 2D pixel verification. A Canvas result must never be reported as a WebGPU success.

## Tested on marcos (2026-10-14)

- `node --check web-runtime/gpu-lab.mjs`: PASS.
- `node --check server.js`: PASS.
- HTTP GET `gpu-lab.html` and `gpu-lab.mjs`: **200** with HTML and JavaScript MIME respectively.
- `node --test web-runtime/test/gpu_lab.test.mjs`: **2/2 PASS**.
- Chrome headless with GPU disabled: **PASS — canvas2d**, corner pixel readback confirmed. Browser explicitly reported **no compatible GPU adapter**.
- Chrome headless with its default GPU path: adapter discovery hung, now correctly **times out after 4.5 seconds and reports PASS — canvas2d**, rather than leaving an indefinite loading screen. A GPU driver/command-buffer error appeared in Chrome stderr; this is not evidence of a working browser GPU.
- Therefore WebGPU rendering remains **untested** on a usable adapter; the synthetic GPU pixel-readback code exists but requires separate interactive verification.
- Does **not** integrate original Wii game functions, Aurora GX, private image or frame output. It is a platform-feasibility milestone only.

## Next decisions / review requests

1. Independently validate the WebGPU path in an interactive, GPU-enabled Chrome/Brave with DevTools. A successful GPU readback is required before claiming WebGPU viability.
2. Agree with Mario on the architecture: (A) a JavaScript host-facing WebGPU presentation adapter around Wasm, or (B) an Emscripten WebGPU binding layer compatible with Aurora's C++ wgpu/Dawn usage. Verify version/API compatibility before choosing.
3. Define a clean presenter interface for surface creation, resize, acquire/submit and device loss. Port a no-game-data synthetic textured triangle or GX-like command next, with reproducible visual regression.
4. W03 must own nonblocking browser scheduling. W04/W07 must own memory bridges; avoid mixing rendering with guest-memory changes before those contracts stabilize.
5. Request Peach/Toad independent review of the security boundary, pixel tests and fallback semantics.

**No original game assets or binary outputs have been copied into this branch.**
