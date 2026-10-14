# W02 — Browser graphics feasibility: current checkpoint

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
- `web-runtime/gpu-lab.mjs`: tries native **browser WebGPU** initialization; creates a synthetic WGSL vertex/fragment shader and draws a fullscreen triangle into a 1x1 offscreen `rgba8unorm` texture; copies it to a MAP_READ buffer to check RGBA values. It then paints the canvas surface and awaits submission.
- When WebGPU is absent, blocked or no adapter exists, it instead draws an independently testable Canvas 2D image and checks its corner pixel. This **fallback is not equivalent to GPU support or native GX**, and UI identifies the actual active mode.
- Handles resize, high-DPI up to 2x, GPU device loss, repeat-check button, overlapping async reruns, bounded requests, stale callbacks and cleanup. Canvas PASS does not imply WebGPU PASS.
- `server.js`: exact allowlist extended for these two new static files, without exposing private directories. Peer-review fix: malformed percent-encoded URL paths now return HTTP 400 instead of crashing the Node HTTP process; tests verify the server remains alive.
- `web-runtime/test/gpu_lab.test.mjs`: dependency-free Node HTTP/MIME/path-denial tests, real headless Chrome/Brave Canvas fallback and 9 imported GPU-mock tests from `gpu_controller.test.mjs`.

## How to run

```powershell
cd C:\NSMBcowork\worktrees\Luigi
node --test .\web-runtime\test\gpu_lab.test.mjs
$env:PORT = '3002'
node .\server.js
```

Open `http://127.0.0.1:3002/web-runtime/gpu-lab.html` in an actual browser. It should show **PASS — WebGPU** only after shader-render GPU buffer readback, or **PASS — Canvas 2D only** after 2D pixel verification. It reports GPU status separately (`verified`, `unavailable`, `timeout`, `failed`, `lost`). A Canvas result must never be reported as a WebGPU success.

## Tested on marcos (2026-10-14)

- `node --check web-runtime/gpu-lab.mjs`: PASS.
- `node --check server.js`: PASS.
- HTTP GET `gpu-lab.html` and `gpu-lab.mjs`: **200** with HTML and JavaScript MIME respectively.
- `node --test web-runtime/test/gpu_lab.test.mjs`: **11/11 PASS** (9 simulated GPU lifecycle/fault/concurrency cases; HTTP, actual headless Canvas fallback).
- Chrome headless with GPU disabled: **PASS — canvas2d**, corner pixel readback confirmed. Browser explicitly reported **no compatible GPU adapter**.
- Chrome headless with its default GPU path: adapter discovery hung, now correctly **times out after 4.5 seconds and reports PASS — canvas2d**, rather than leaving an indefinite loading screen. A GPU driver/command-buffer error appeared in Chrome stderr; this is not evidence of a working browser GPU.
- Therefore WebGPU shaders and texture readback are covered by mocks but remain **untested on real WebGPU hardware** here. See `W02_BROWSER_ADAPTER_CONTRACT.md` for the proposed Aurora/browser integration interface.
- Does **not** integrate original Wii game functions, Aurora GX, private image or frame output. It is a platform-feasibility milestone only.

## Next decisions / review requests

1. Independently validate the WebGPU path in an interactive, GPU-enabled Chrome/Brave with DevTools. A successful GPU readback is required before claiming WebGPU viability.
2. Agree with Mario on the architecture: (A) a JavaScript host-facing WebGPU presentation adapter around Wasm, or (B) an Emscripten WebGPU binding layer compatible with Aurora's C++ wgpu/Dawn usage. Verify version/API compatibility before choosing.
3. Validate the proposed presenter interface in `W02_BROWSER_ADAPTER_CONTRACT.md`. The lab already includes a synthetic shader triangle in a 1×1 target; the next step is hardware validation, then a textured quad and a visual regression using the chosen Wasm host boundary.
4. W03 must own nonblocking browser scheduling. W04/W07 must own memory bridges; avoid mixing rendering with guest-memory changes before those contracts stabilize.
5. Request Peach/Toad independent review of the security boundary, pixel tests and fallback semantics.

**No original game assets or binary outputs have been copied into this branch.**
