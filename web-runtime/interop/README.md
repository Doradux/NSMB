# W07 — Checked synthetic guest-call WebAssembly interop

**Not game code; not emulation; not a playable Mario game.** This phase proves
that real C++ compiled to WebAssembly can call the W04 checked MEM1/MEM2
physical-page backend and return typed failures without using native pointers.
The example function was authored synthetically for this project. No
Nintendo binary, generated translated source, original ROM filenames,
disc image, assets or private manifests belong to this public worktree.

## ABI

The standalone module compiles BOTH:
- web-runtime/src/guest_memory.cpp (W04 reviewed page backend)
- web-runtime/interop/synthetic_guest.cpp (W07 synthetic function)

Exports (C ABI; uint32 parameters are guest addresses and values, not
WebAssembly linear-memory pointers):

    uint32_t nsmbw_interop_step(uint32_t sourceGuest,
                                uint32_t destinationGuest,
                                uint32_t addend);
    uint32_t nsmbw_interop_status(void);
    void nsmbw_interop_reset(void);

The step reads a big-endian 32-bit value through the checked backend,
adds addend using **unsigned modulo-2^32 arithmetic**, and stores at
destinationGuest. Returns 1 on success and 0 on failure. Zero read data
is legal and checked via nsmbw_mem_error(), never interpreted as a failed
read by itself. The last interop status is 0 after success/reset:

| Status | Meaning |
|---|---|
| 0 | Success |
| 1 | Unmapped or other unsupported guest RAM access |
| 2 | Guest 32-bit address wrap |
| 3 | Sparse allocation/page-budget exhaustion |
| 4 | Unavailable guest-device policy (MMIO/GX FIFO) |

The interop layer checks all four bytes for overlap with
0xCC000000..0xCDFFFFFF, including range-crossing starts, and refuses
rather than mapping MMIO/GX to RAM. Other unmapped addresses are rejected
by W04. The backend preallocates both pages before writing a crossing
store, providing all-or-nothing behavior for these 1/2/4-byte accesses.
The guest page budget is retained across nsmbw_interop_reset().

## Build on authorized machine

The repo includes the purely synthetic built JS/wasm files for browser
diagnostic reproducibility. Regenerate them from source with:

    .\web-runtime\interop\build.ps1 -Emsdk "C:\path\to\private\emsdk"
    node --test web-runtime/interop/test/*.test.mjs

Requires Node.js 24+, Emscripten 6.0.12 and local Chrome/Brave for the
browser test. Browser checks use an ephemeral localhost-only server and
an isolated headless browser profile; they do NOT touch Mario's port 3000.
No external services, game resources or runtime accounts are involved.

Unit tests check actual Wasm magic, physical/cached/uncached MEM1/MEM2,
big-endian bytes, modulo arithmetic, legitimate zero reads, MMIO/GX,
unmapped/wraparound, quota-induced cross-page atomicity, unaligned access,
reset/budget persistence and isolated Wasm instances. The headless test
loads the compiled Wasm in Chromium and calls the exported synthetic
C++ function; it is not computing a JS imitation of the result.

## NOT yet ready for original translated game functions

- Native WiiCompiled uses a flat 4 GiB guest-address view, optimized
  MemoryInline checks and more than scalar 32-bit reads/writes. Arbitrary
  generated functions CANNOT be linked safely to this proof-of-concept.
- MMIO callbacks, GX FIFO writes, deferred EFB reads, DMA visibility,
  executable-page write guards, 64-bit/float/paired-single instructions,
  Wii OS HLE and guest threading/scheduler are absent. Do not silently
  dispatch unsupported accesses to RAM or fake successful device I/O.
- The project W01 DOL hash and pinned WiiCompiled profile remain subject
  to Mario's independent validation before **any** real translated code
  can be tested. That research and any original-generated source stay
  private; no original source is added to this branch.
- Page-budget tests simulate allocation failure through a deterministic
  page quota, **not** true browser heap OOM. Thread safety, timing and
  memory throughput require separate measurements.

Next integration decision belongs to Mario: define a checked MemoryInline
adapter and HLE device policy map, coordinate W03 scheduler, validate W01
real-code ABI/address-map privately, then attempt a controlled original
function only in the owner's nonpublic workspace. No game boot claim.
