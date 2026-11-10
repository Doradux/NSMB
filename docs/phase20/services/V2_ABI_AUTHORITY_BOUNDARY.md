# TOAD Phase20 — synthetic PURE Service ABI v2

Source: web-runtime/runtime-services/synthetic_service_v2.hpp.
This is a **PUBLIC**, deliberately forgeable, stateless C++17 numeric
candidate only. It has NO real Nintendo Wii clock, HLE, ROM or code.
V2 does not change P19 v1 ABI or values.

Service IDs (uint32):
- 0x53560001 rawClockFromNanoseconds: exact floor(ns*243/4000),
  with 60,750,000 raw ticks/sec and no floating-point, signed input,
  calendar date or original guest.
- 0x53560002 rawClockFromTicks: uint64 scalar copied/checked.
All IDs, including 0 and 0xffffffff, are DENIED.
ABI version=2; synthetic guest PC=0x80010000 only. RequestV2 is
(version,id,slot,expectedPc,epoch,revision,value). No token, serial
or proof data exists in the request. ViewV2 holds slot/currentPc/
epoch/revision/previousTicks, claimedBudget, origin/phase/ready/busy
hints. It is entirely fabricated/caller-supplied; OriginClaim
nativeScheduler is NEVER evidence of execution provenance. All checks
are preliminary mathematical deny hints, NOT authorization.

ResultV2 = StatusV2 plus CandidateV2; all C++ standard-layout, trivially
copyable, constexpr/noexcept. Status candidateOnly=0, unsupported=1,
badVersion=2, invalidSlot=3, wrongPc=4, wrongEpoch=5,
staleRevision=6, forbiddenOriginClaim=7, claimedBusy=8,
claimedQuotaEmpty=9, disabled=10, overflow=11, clockRegression=12,
invalidPhase=13, revisionExhausted=14. Every DENIAL returns a default,
ZERO payload with proposedCost=0, to prevent reuse. For success:
CandidateV2 carries version, serviceId, slot, expectedPc,
sourceEpoch/sourceRevision, rawTicks, high32, low32, proposedCost=1.
The proposedCost is a constant ESTIMATE, not a budget decrement. W03
must charge a real private quota once and only upon accepted commit.
High32 is the upper half for W03 GPR3, low32 for GPR4; neither is a
pointer, capability, or guest RAM address. Endianness is not implied by
C++ padding/struct layout; do not memcpy structs into PPC guest RAM.
Converting host/Wasm ABI to guest ABI must use explicit shifts and
native-owned CPU register writes.

## Required Peach W03 integration, NEVER in this header
1. Only Peach's W03 private scheduler authorizes a synthetic guest
   with actual owner/generation/slot/epoch/PC/phase/revision, issues
   and consumes a native-only one-use Ticket. A W03 trusted private
   per-guest quota is independently checked. A JS caller with
   ViewV2.claimedBudget=999999 and OriginClaim.nativeScheduler can
   compute a mathematically valid Candidate but CANNOT issue a Ticket,
   spend private quota or alter GPR/clock.
2. W03 can construct RequestV2 and ViewV2 from its trusted private
   values to call compute, but computed status is **not a grant**.
   Revalidate private fields and quota at native arm/commit boundary.
   A stale ticket/PC/epoch/revision, unknown service, W07/MMIO/IRQ/
   JS-originated attempt or reentry cannot write GPR, RAM or the
   clock. Every failure has ZERO CPU/ledger/private-quota effect.
3. In one W03-only no-throw no-callback commit, write GPR3/GPR4,
   canonical clockTicks, clockRevision and charge exactly one PRIVATE
   quota unit. Toad never holds a second ledger/transaction service.
   Reset/recycle must invalidate old Ticket AND quota snapshot. Never
   mint Ticket as an extern C/JS import, C++ public request or
   implied caller OriginClaim.
4. Mario should source-pin exact SHA peers before combined compilation,
   and separately verify SAME new Wasm digest on functional Node and
   Chromium operation, not just module load. This public header by
   itself does not prove a native W03 private service gate exists.

## ABI scope and compatibility
This is OUR invented C++/Wasm numeric ABI, not Nintendo PowerPC
external ABI. Exact sizeof/align/offset are asserted by separate
C++17 GCC and cached Docker Emscripten tests. All fields are by-value,
no raw CpuContext pointer, no new host imports, no JS exports,
no callback, no heap allocation or global state. Callers can freely
forge every field including epoch/revision and phase. Input snapshot
optional service intentionally NOT added in P20 to avoid inventing
new W07 host privileges. Only raw ticks and nanos are allowlisted.

Original owner DOL SHA/profile mismatch, original Nintendo content,
authentic C# translator/witness, IOS/GX/VI/IRQ/real OSGetTime and Wii
gameplay remain explicitly STOP.
