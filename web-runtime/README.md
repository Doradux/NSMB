# Experimental WebAssembly RAM backend

This is **a platform feasibility module**, not an emulator and not a playable game. It is a standalone C++ implementation of sparse, page-backed guest memory with Wii-style MEM1/MEM2 physical, cached and uncached aliases.

## What works

- C++17 compiled using Emscripten 6.0.12 into a real `guest_memory.wasm` plus a JS ES module.
- 4 KiB physical pages allocated only on writes (no 4 GiB virtual reservation).
- Read/write 8-, 16- and 32-bit values, big-endian like PowerPC.
- Mirrors MEM1 and MEM2 addresses using the same physical backing.
- Detects address wraparound, unmapped access and MMIO; **MMIO is not implemented**.
- A Node regression test and a browser-only diagnostic page.

## Build and test (Windows)

Install Emscripten (emsdk) and Node.js, then run:

```powershell
.\web-runtime\build.ps1 -Emsdk 'C:\path\to\emsdk'
node .\web-runtime\test\guest_memory.test.mjs
node server.js
```

Open http://localhost:3000/web-runtime/lab.html for browser tests. The repository includes generated `dist/guest_memory.mjs` and `dist/guest_memory.wasm` from this source to make the local diagnostic work without a separate build step.

## Not supported yet

- Direct invocation of the translated Mario PowerPC functions
- The existing WiiCompiled page-table integration and physical memory mappings beyond MEM1/MEM2
- MMIO/GX FIFO, executable-write guards, DMA, deferred EFB reads
- Cooperative fibers/scheduler, graphics, audio, controllers and saving
- Wii game code or assets in the browser

WiiCompiled's native runtime currently uses a **fixed flat 4 GiB guest address space and operating-system page protection**. Its translated fast-path references must be adapted to use a checked browser memory backend. This proof of concept does NOT yet replace `GuestFlat` in the upstream runtime.
