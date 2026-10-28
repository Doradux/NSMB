# Phase 9 — bounded PPC halfword store (STH) through actual public translator

**Owner:** Luigi. Baseline public main `2c2ef26`. Independent branch
`agent/luigi/phase9-translated-sth`. This is ONLY invented public PPC
input, not Nintendo's DOL, guest function, Wii OS, or playable game.

## Genuine translator and ABI

`translator-fixture/build_sth_fixture.mjs` generates a synthetic 268-byte DOL
with 3 big-endian 32-bit PPC instructions: `0xB0640000` STH r3,0(r4);
`0x90660000` STW r3,0(r6); `0x4E800020` BLR. Public synthetic DOL
SHA256: `440f1d00e1bd1452745298703c8162326ffbb8908ced78e67feb5b2fbb256fed`.

The actual installed upstream precompiled .NET8 `Translator.Cli.dll` executed
on this NEW DOL and produced UNEDITED generated C++:
```cpp
extern "C" void func_80001000(CpuContext* MKW_RESTRICT ctx)
{
    // emitted local register materialization omitted
    MemoryInline::FlatWrite16(r4, static_cast<uint16_t>(r3));
    MemoryInline::FlatWrite32(r6, r3);
}
```
`build_translator_sth_fixture.ps1` re-runs the real .NET translator,
requires the exact generated source function shape/order and **exactly two**
`MemoryInline` operations, and compiles actual C++ with authorized
Emscripten and W03/W04/W07/W08 into a separate **TEST ONLY**
`dist/frame_loop_translated_sth_fixture.{mjs,wasm}`.
Original Wii source code, generated original-game C++, ROM/DOL/REL and
private traces never enter Git or browser HTTP paths.

## Strict safety contract

- The newly introduced C++ `MemoryInline::FlatWrite16(guest,uint16_t)`
  exists ONLY under `NSMB_PHASE9_HALFWORD_FIXTURE`, with existing
  `NSMB_PHASE6_TRANSLATED_STORE_FIXTURE`. It is not part of the normal
  runtime; the normal server never exposes the fixture.
- **Alignment:** guest address must have bit0 clear. Odd offsets 1 or 3
  reject with guest status7 **before** any RAM read/return/register change or
  MMIO device callback. This is a conservative fail-closed policy; this fixture
  does not emulate the architectural PowerPC alignment exception.
- **Endian:** aligned guest byte offsets 0 and 2 of each 32-bit word target,
  respectively, bits31..16 and bits15..0. The 16-bit halfword truncation of
  `r3` is explicit, including zero, 0xFFFF and upper-word garbage.
- **Address mapping:** existing `ordinaryRam` validates full aligned
  physical MEM1/MEM2 words; cached/uncached aliases resolve via
  `canonical(addr)=addr&0x3FFFFFFF`. A valid halfword cannot straddle an
  aligned 4-byte word or 4KiB guest page. Last valid MEM1 halfword is
  0x817FFFFE; the next halfword is rejected. Arbitrary memory layouts
  and page-crossing/unaligned halfwords remain unsupported.
- **Transaction:** checked W07 read obtains the original 32-bit containing
  word, then masked big-endian halfword is STAGED in the existing 2-entry
  journal; source-generated later STW stages a second word. W04
  `nsmbw_mem_atomic_pair_write32` preflights and allocates both sparse
  pages atomically. Quota0, quota1 second-page failure and late MMIO store
  reject without mutating original guest bytes or creating ghost pages.
  CPU registers and PC are committed only after successful W04 commit.
  Alias to the same physical word coalesces (later STW wins).
- **No replay:** retrySafe remains conservative on mixed staged errors;
  MMIO/GX/unmapped denied before typed handler; device callback count zero.
  No general mixed-width reads, FPR/GQR, thread-reentrant journals, DMA
  or arbitrary translated PPC code are allowed.

## Evidence

- `test/translator_sth.test.mjs` runs actual compiled Wasm in Node:
  endian high/low halfword; alias; zero/0xFFFF truncation; last halfword
  of guest page and physical MEM1; odd alignment rejection; MMIO/GX/unmapped;
  quota0/1 rollback; late STW failures; same-word coalescing; 3 independent
  contexts; 128 resets; normal export boundary.
- `test/translator_sth_browser.test.mjs` serves a **strict four-path**
  allowlist and executes real Chrome requestAnimationFrame callbacks with
  3 contexts, late fault isolation, 128 resets, no private/fixture DOL URL,
  no browser console/HTTP errors.
- `test/sth_export_boundary.test.mjs` verifies native
  `WebAssembly.Module.imports/exports` (including all four W03 CPU ABI
  functions, no test mocks/leaks in normal).
- **REA 6.5.0** independent WABT binary static analysis, output OUTSIDE Git at
  `C:\NSMBcowork\notes\Luigi-P9-REA-NORMAL.json` and
  `Luigi-P9-REA-STH.json`:
  - normal Wasm SHA256 `32d4313e0ab8c27a6146d132492bd2f773fdb7c817534d2d4fb54e5fc6d185a1`,
    evidence `ev_3b4e7e42ca159680cb14d3a327dd90d58f740d89eaaa33be74d6461c4dea67a4`,
    **66 exports**, one `env.emscripten_resize_heap` import;
  - generated STH Wasm SHA256 `f68e1cef4f4f991d00e732f2cef139eb6dc54f6231b3dd2b50b16286a58fb102`,
    evidence `ev_93045fc223722bfc62cedc45f3f2ba7f9471c4c70fe2d6d7a6f016a9e36960a7`,
    **68 exports**, the two additions are
    `nsmbw_mem_atomic_pair_write32` and
    `nsmbw_loop_translated_store_spawn`, both test-only; same single import.
  - REA validates *static* Wasm syntax/interface, NOT runtime instruction,
    scheduler or atomic guest memory semantics. Node/real Chrome do that.

## Exact next original-runtime ABI/HLE dependencies

Current synthetic CPU is not the authentic Wii runtime. Original guest
function work remains STOP until Mario's W01 verified executable SHA/provenance
and unambiguous static MAP/quality/coverage auditor pass independent critical
review. After identity, privately vet ONE specific leaf's complete generated
import graph and CpuContext layout (r1/r2/r13, LR/CR/XER, FPR/FPSCR/GQR,
native direct/indirect calls, stack and guest faults). Required OSGetTime
must return a full 64-bit timebase through r3/r4; the synthetic low32 RAM
clock is NOT Wii OSGetTime. GX/IOS/DMA/interrupts and irreversible device
side effects cannot be faked with successful stubs. Perform bounded private
reference comparisons before considering any original function execution.
Never commit, serve or upload original Nintendo game material.
