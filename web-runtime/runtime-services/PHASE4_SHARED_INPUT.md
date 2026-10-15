# Phase 4 — W08 input + W03 guest frame in ONE WebAssembly module

Synthetic C++ WebAssembly only. NOT Nintendo code, Wii Remote emulation,
native PPC instruction decoding, original game launch, or gameplay.

## Shared guest memory contract

build_joined.ps1 links five public sources into ONE joined_input.wasm:
1. W04 guest_memory.cpp (sparse aliased MEM1/MEM2)
2. W07 synthetic_guest.cpp (checked synthetic function)
3. W07 device_policy.cpp (fail-closed MMIO/GX)
4. W03 frame_loop.cpp (bounded scheduler and guest context)
5. W07 input_snapshot.cpp (validated input store)

One Wasm has one W04 page table. The W08 controller packet is written
into the SAME checked guest RAM instance that the W03 C++ synthetic
guest function reads and transforms, rather than two separate modules.

Existing ABI: nsmbw_services_input_store(guestAddress,buttons,axisX,
axisY,sequence) writes ONE aligned big-endian word:
[sequence:u8][Y:i8][X:i8][buttons:u8].
Buttons bit0=primary, bit1=secondary, bit2=pause. Other bits reserved.
Axes finite, bounded -127..127, quantized symmetrically after W08
deadzone. Sequence is a host-owned u8 with rollover 255->0.
Input address mapped MEM1/MEM2 only, never MMIO/GX/FIFO.
W07 C++ guest step then reads that same word and writes
(packet + addend) modulo 2^32 through checked W04 guest RAM.

New JS helper joined_host_input.mjs:
- keyboardAsStandardGamepad(keys): <=16 strings or Set; ArrowUp/Down/
  Left/Right directions, Space primary, KeyZ secondary, Escape pause.
  Synthetically constructs standard Gamepad data; no DOM listeners.
- applyJoinedInputFrame(wasm, gamepads, options): one checked store,
  one bounded W03 scheduled guest step and typed result snapshot.
  Default input address 0x80004000, output 0x80009000, guest ID 1,
  addend 1. Refuses an unreaped guest ID or another runnable context
  BEFORE writing input, to avoid attributing a different task's work.
  It does not reset the module or silently auto-retry faults.
- reapJoinedInputFrame(wasm, guestId): explicit DONE/FAULT/CANCELLED
  slot recycling. nextInputSequence(u8): bounded modulo-256 rollover.

Connected pad, disconnected pad (neutral packet to RELEASE sticky
buttons) and synthetic keyboard all share this one validated C++
entry point. Absent or oversized hostile pad arrays also produce a
neutral packet with a guest-visible status; no hidden device callbacks.
Both input store and quota-zero failure propagate explicit errors.

## Status and page budget

Existing W07 codes 0 success, 1 unmapped RAM, 2 guest 32-bit wrap,
3 quota/allocation, 4 unavailable MMIO/GX, 5 policy rejected,
6 malformed policy reply. Input-only status 7 invalid packet/address.
The input status is separate from W03 guestError. An input failure
returns before spawning. W03 failed guest output leaves PC uncommitted;
MMIO failures never route guest input into device callbacks. Quota
retry is host-initiated, not automatic.

The joined module uses W04 nsmbw_mem_set_page_budget; 128 browser and
Node frame exercises hold exactly two 4KiB backing guest pages.
W03 loop_reset is GLOBAL across all contexts and releases RAM.
Never treat it as a per-context player reset.

## Reproduce on authorized Windows machine

    .\web-runtime\runtime-services\build_joined.ps1 -Emsdk "C:\path\to\emsdk"
    node --test web-runtime/runtime-services/test/*.test.mjs
    node --test web-runtime/frame-host/test/*.test.mjs
    node --test web-runtime/interop/test/*.test.mjs

Joined Node suite covers W08 Gamepad and keyboard, zero button after
unplug, invalid and oversized providers, 0 page quota, 1 page output
failure, rejected MMIO destination, alias mapping, three interleaved
guest contexts in the SAME Wasm, 128 frames/reaps, and separate module
isolation. Chromium test runs an isolated headless browser profile and
ephemeral loopback HTTP server with explicit six-resource allowlist;
loads the compiled Wasm, executes synthetic C++ guest frames, verifies
unplug and quota error and 128 iterations. Not a frame-rate SLA.

## Dependencies before original code could work

RuntimeServices checklist still identifies original Wii VI clock/ticks,
real hardware pad enumeration/permissions/expansions, GX FIFO/DMA/EFB,
IOS/HLE, audio queues, owner-selected PRIVATE filesystem and save
semantics, PPC context stack/floating point, WiiCompiled MemoryInline
4GiB guest access policy, and W01 executable profile checksum.
No original DOL/REL/RVZ/ISO, extracted assets or translated source
may enter GitHub, logs or public CI.
