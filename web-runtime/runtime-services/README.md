# W07 Phase 3 — Synthetic input snapshot to checked Wii RAM

This is a narrow, testable RuntimeServices adapter. **NOT** actual Wii Remote
emulation, native Wii input HLE, controller hardware polling, game boot, or
original Nintendo input data. Built from publicly authored synthetic C++ only.

## ABI and packet layout

The checked input service compiles the integrated W04 sparse MEM1/MEM2 guest
backend with integrated W07 checked interop and this tiny new source file.

    uint32_t nsmbw_services_input_store(
        uint32_t guestAddress, uint32_t buttons,
        int32_t axisX, int32_t axisY, uint32_t sequence);
    uint32_t nsmbw_services_input_status();
    void nsmbw_services_input_status_reset();

A success is 1, failure 0. Status 0..6 matches existing W07 checked guest
errors; 7 is a SERVICE-LOCAL invalid argument/guest input-alignment error.
Status must be read immediately after store. No raw host pointers cross the
Wasm interface. All fields are validated BEFORE the only guest write.

One aligned 32-bit PowerPC big-endian guest word, byte order:
[sequence:u8][axisY:i8][axisX:i8][buttons:u8].
Button bits 0 primary, 1 secondary, 2 pause; other bits are reserved by
this synthetic prototype. Both axes must be signed -127..127, buttons
and sequence 0..255. A single W04 write32 is page-quota-aware and
all-or-nothing on allocation failure. **Only ordinary mapped MEM1/MEM2
RAM** is writable; input cannot be redirected to MMIO/GX FIFO, even if
a device handler were installed. Address must be 4-byte aligned.

JS web-runtime/runtime-services/host_input.mjs accepts an ordinary W08
**synthetic standard gamepad snapshot** via W08's snapshotGamepad(), maps
buttons and normalizes signed axes with symmetric magnitude quantization.
Disconnected input writes a **neutral guest packet** (buttons and axes zero)
so previously pressed buttons do not remain latched. That write is still
checked and any page-quota failure is returned to host JS. No background
polling or physical controller capture occurs.

Sequence is an 8-bit stamp, not a real VI timer or reliable multi-context
ordering token. The host must own its epoch and sample input at a
known scheduling boundary before writing the packet; overwriting
between guest readers is NOT synchronized by this proof-of-concept.
Services status reset does not reset guest RAM or other device policy.
W04/W07 resets are module-wide and require an explicit host-level decision.

## Reproduce (authorized Windows marcos host)

    .\web-runtime\runtime-services\build.ps1 -Emsdk "C:\path\to\your\emsdk"
    node --test web-runtime/runtime-services/test/*.test.mjs

The Node tests exercise byte layout, MEM1/MEM2 cached/uncached alias
consistency, invalid axes/buttons/sequence, address alignment and
MMIO denial, quota rollback, retained guest data after service
status reset, 128 reset cycles and bounded 25k updates. The actual
Chrome/Brave headless browser loads the compiled Wasm plus public W08
Gamepad adapter through a five-resource-only localhost HTTP server
(no original/private routes) and checks the same synthetic packet,
quota failure and 10k repeated writes.

No actual Gamepad permission, Wii MotionPlus, Nunchuk, rumble,
speaker output, key mapping to NSMB Wii, or native controller
interrupt behavior is tested. The benchmarks are local diagnostics
and not Wii VI frame throughput guarantees.

## Security and remaining prerequisites

- Never load original media/assets from Git, a public URL, or JS demo.
- Do not widen the input address allowlist to device registers without
  real HLE policy and independent review.
- Single-thread guest RAM access only. No USB/Bluetooth Wii Remote bridge,
  thread-safe CpuContext, input IRQ, true PP memory pages or DMA.
- W01 compatibility hash/profile still gates original-code execution.
