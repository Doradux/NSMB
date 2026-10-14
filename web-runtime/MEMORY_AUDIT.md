# W04 — Adversarial audit: guest RAM backend

**Scope:** only the synthetic Wii-style sparse memory proof of concept. This
is not a real Wii MMIO/GX/guest-function runtime and does not boot any game.

## Confirmed defects in previous implementation

1. It used a hash table to hold 4 KiB pages; operator[] could allocate a map
   node and throw before the nothrow page allocation executed.
2. A failed write to a second page could leave earlier bytes of the same
   PowerPC 16/32-bit store mutated. There was no rollback.
3. The sparse map was unbounded except by address space and browser memory;
   browser OOM was a trap rather than a usable guest-memory status.
4. validate() iterated once for every requested byte. Current exports only
   pass widths 1/2/4; a later bulk caller could accidentally make it O(N).

## Changes

- Replace the hash table with two fixed page-pointer tables: 6,144 MEM1
  pages (24 MiB), 32,768 MEM2 pages (128 MiB), indexed by physical address.
  On Wasm32 the pointers occupy about 152 KiB. Guest data pages remain lazy.
- Add nsmbw_mem_set_page_budget(maxPages), which is controlled by host JS.
  Valid range is 0 through 38,912 pages (4 KiB each); lowering it below
  currently allocated pages fails, leaving prior setting unchanged.
  The default is 38,912 (entire modeled MEM1+MEM2), not a recommended
  browser-specific production quota. A future host adapter MUST choose
  a suitable cap from device memory/quota policy before guest execution.
- Validate guest widths 1, 2 or 4 only, with overflow/MMIO/reverse-boundary
  checks performed before any write. This keeps byte validation O(1).
- For writes, discover up to two distinct physical pages, enforce the page
  budget, allocate missing pages into temporary owners, then attach all
  pages. Only after every allocation succeeds are guest bytes committed.
  Failure therefore cannot partially mutate a multi-page store or inflate
  the page count with null phantom entries.
- Compile with Emscripten ABORTING_MALLOC=0 so a nothrow allocation has a
  recoverable failure path instead of an abort on heap exhaustion.
- Reset frees guest data and resets the error/page count, retaining the
  host-selected page budget. Aliases map to identical physical pages.
- Error codes: 0 success; 1 unmapped/MMIO; 2 32-bit address-space wrap;
  3 quota/allocator failure; 4 invalid argument/budget request.

## Reproducible acceptance checks

From isolated Toad-W04 worktree on the authorized Windows marcos host:

    .\web-runtime\build.ps1 -Emsdk "C:\Users\kakyg\Documents\NSMBW-Private\toolchain\emsdk"
    node --test web-runtime/test/guest_memory_adversarial.test.mjs
    node web-runtime/test/guest_memory.test.mjs

Adversarial baseline before the change: **4 of 5 tests failed** because
the page-budget export did not exist. After compilation: **5 of 5 pass**,
including failed two-page store without either allocation or altered
existing bytes, MEM2 alias budget accounting, quota shrink refusal,
boundary/MMIO failure, and reset semantics. Original baseline Node test
remains green.

A separate temporary copy of Peach browser regression suite was run
against this W04 checkout and then deleted (not committed). It verified
the actual new Wasm module performs **11 of 11 browser checks**. Overall
browser suite was 7 pass / 2 fail, both unrelated inherited UI defects:
320px viewport expands to 322px, and diagnostic favicon 404 on this
branch. They are tracked elsewhere and must not be attributed to the
memory change. No user's private game data were copied or read.

## Remaining engineering risks and prerequisites

- MMIO/GX FIFO, deferred EFB, writable executable page detection, DMA,
  real Wii page table access restrictions, physical memory alternatives,
  and virtual-to-physical guest translations beyond these mirrors
  are NOT implemented. This module is not a complete Wii memory model.
- The modeled MEM2 size of 128 MiB follows the original proof-of-concept;
  confirm the actual game profile and configured IOS before any guest boot.
- Single-thread only: no atomics or locks protect page contents/counts.
  The browser adapter must serialize access or design thread-safe
  allocation and guest memory synchronization before pthreads are used.
- Host must select a non-dangerous page budget; maximum enables roughly
  152 MiB of guest data (plus Wasm and host overhead). Do not expose
  arbitrary unbounded bulk operations to untrusted callers.
- Failure injection uses the deterministic page-budget limit to exercise
  atomicity. Actual OS-level OOM behavior should also be tested in a
  constrained browser before production reliance.
- Changes should receive independent Luigi or Peach review before Mario
  integrates. Do not claim real gameplay based on this experiment.
