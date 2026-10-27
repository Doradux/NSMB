# Phase16 W16-C — isolated synthetic OSGetTime64 service

**SOURCE-ONLY synthetic fixture; NOT Wii HLE, NOT an installed W03 bridge,
NOT Nintendo guest execution.** All code and test inputs independently authored.

## Public ABI facts (pinned sources)

- [Wiicompiled os_time.cpp @ f02d000](https://github.com/patchzyy/Wiicompiled/blob/f02d000ba8e67240a04d95676da89023f781222f/runtime/src/hle/os/os_time.cpp):
  OS__GetTime_HLE returns **r3=high32, r4=low32** of raw timebase. The
  upper/lower/upper hardware retry is NOT the synthetic low32 guest RAM clock.
  ReadSystemTime adds separate epoch information from guest memory; we do NOT.
- [Wiicompiled timebase_contract.h @ f02d000](https://github.com/patchzyy/Wiicompiled/blob/f02d000ba8e67240a04d95676da89023f781222f/runtime/include/timebase_contract.h):
  243 MHz/4 = **60,750,000 ticks/sec**. Exact conversion from nanoseconds:
  floor(nanoseconds*243/4000), safe quotient/remainder, never floating point.

## Local service boundary, WITHOUT production authorization

`web-runtime/runtime-services/time64_epoch_service.hpp` models three
private CpuContext copies and their independent monotonic 64-bit ledgers.
`Time64Permit` is a single-use, move-only, non-default-constructible
compile-time capability carrying service identity, slot, generation,
expected PC, action and synthetic quiet observation. All attempts consume
the ticket, even rejected attempts; wrong instance/action/slot/epoch/PC
or operation fail before touching context or time ledger. Both r3/r4
registers and ledger update ONLY after all validation. Generation starts
at nonzero, increases strictly across reset, and its retired watermark
survives reset to block ABA and generation overflow reuse. Reset needs
a trusted issuer's positive quiescence observation.

`nsmbw::w03::Time64PermitIssuer` is a **forward declaration only**.
The sole friend issuer is additionally fenced behind compile flag
\`NSMB_PHASE16_TIME64_SYNTHETIC_TEST\` used ONLY for native tests. Normal
builds cannot mint a permit even by defining the fake issuer class. There is NO
production issuer definition, callsite, registered HLE or
JS/Wasm export. Tests define a local fake issuer in the executable solely
to verify the boundary; a fake is NOT evidence of W03 authorization.
C++ private constructors are **not cryptographic authentication**.
`reset(..., quiet=true)` is ONLY a test assumption. No proof of genuine
scheduler in-flight work, callback cancellation, generation identity
or safe guest pointer has been made.

`publishNanoseconds` uses the exact source ratio and delegates to
`publish`. Unknown guest memory, MMIO, IRQ and unknown operations reject
with explicit errors; all errors retain PC/LR/SP/GPR/FPR/GQR and ledger.
The class allocates no guest RAM and NEVER modifies production frame-host.

## Coordination with Peach's actual proposal

Peach's initial W03 proposal has a separate
`nsmbw::trusted_cpu::Ticket`, `leaseSynthetic(guest)` and
`publishSyntheticPair(ticket,expectedPc,ticks)`, issued from scheduler-owned
CPU state. This is **NOT** Toad's test permit. Never cast or conflate them.

A future integration must be separately reviewed as a two-phase transaction:
(1) W03 validates live slot, epoch+serial, exact expected PC, READY,
no reentry and verified quiescence where necessary; (2) Toad prepares a
candidate monotonic tick without ledger mutation; (3) under a trusted
non-reentrant scheduler operation, W03 publishes r3/r4; (4) only after
confirmed W03 success, host ledger commits. On W03 failure, GPRs AND
ledger remain unchanged. An arbitrary `trusted=true` or JS raw
CpuContext pointer is not admissible. Our isolated fixture does **not**
implement that joint transactional scheduler bridge.

## Persistent hard STOP

Original private DOL checksum mismatch; producer C# MAP recursive
provenance unattested; no real W03 ticket-to-Toad bridge, no native HLE,
no physical timebase/epoch/mftb read/IRQ/MMIO, no fresh emcc build or REA6.5
gate. Synthetic tests do not establish real Nintendo function execution.
Mario alone decides ABI and main integration after exact-SHA peer reviews.
