# Private-only RuntimeServices adapter checklist (2026-10-14)

The owner-controlled private runtime will eventually need these bridges to
WiiCompiled/native Wii services. This document is an **architecture gate**,
not a claim that they exist. Never push commercial disc binaries, ROM
resources or translated original code to this repository.

| Service | Minimum future ABI and correctness gate | Status |
|---|---|---|
| Host frame clock / VI | Monotonic ticks with a bounded per-frame budget, deterministic guest visible timestamps, pause/resume and drift tests | NOT IMPLEMENTED |
| Input snapshot | Stable packed sanitized buttons and signed axes in mapped RAM, explicit quota and permission status, host-held epoch | SYNTHETIC proof only (this branch) |
| Wii Remote + expansions | Real pad enumeration, active mapping/gestures, connect/leave, calibration and interrupt-like delivery | NOT IMPLEMENTED |
| DVD filesystem | User-picked *local owned* extracted root, canonical case/path rules, completeness against FST, bounded async byte-range reads without HTTP sharing | W05 metadata inventory only |
| Save/fs writes | Per-title isolated local save, coherent blocks, explicit permission, quota, crash recovery and no public persistence | NOT IMPLEMENTED |
| Audio (AX / AI) | AudioContext unlock from user gesture, clocks, sample channel conversion, mixer, underrun/jitter and cleanup | W08 OfflineAudioContext only |
| GX command FIFO | Typed MMIO region with command parser, ordering, backpressure, side-effect records, synchronization with GPU/EFB | W07 deny/mock callback only |
| Video and EFB | Translate Wii rendering commands to WebGPU, surface/depth formats, EFB resolves, texture caches, deterministic frame fallback | W02 browser diagnostic only |
| IOS/HLE | Device opens, message queues, replies, interrupt delivery, cancellation, callbacks with timing | NOT IMPLEMENTED |
| Guest memory ABI | adapt WiiCompiled MemoryInline flat 4 GiB direct pointers to checked sparse guest addresses, aliasing, 64-bit/FP and executable write policy | W04/W07 scalar synthetic only |
| Guest context/fibers | registers PC/LR/GPR/FPR and cooperative per-context rollback on faults; validated scheduling, no uncontrolled Asyncify reentry | W03 synthetic host only |
| Original code profile | verify exact original executable SHA, translation tables and bound entry points in private folder, never infer by static symbol count | W01 BLOCKING |

## Controlled private original-function acceptance plan

1. Mario establishes a clean W01 matching source profile and executable
   hash, with independent checks of ambiguous translated objects.
2. Link only synthetic test source publicly. Any user-owned translated
   guest function is tested **locally and privately** after confirming
   permissions and ABI, never uploaded to GitHub/CI.
3. For a first private function trial, prevalidate guest input address
   ranges, write it into correct MMIO-free guest RAM, invoke a single
   bounded function with validated guest context, capture exit status
   and compare native reference behavior. Do not claim authentic game
   boot from one function.
4. Reject unsupported clocks/IOS/GX/64-bit/FPR/instruction and
   executable-write behavior explicitly, never replace with silent
   successful stubs.
5. Record reproducible summary diagnostics WITHOUT source data, file
   names, private resource hashes, or translated function bodies.
6. Only Mario integrates independently-reviewed public infrastructure.

This checklist does not grant access to private ROM resources or
automate content uploads. User-owned disc bytes remain local.
