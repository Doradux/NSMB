# Phase20 Peach: private W03 service quota and one canonical commit

This is a **fictional public synthetic W03 fixture**, NOT a Nintendo OSGetTime
HLE, not an authentic C# translator/runtime and not a general-purpose service
authorization or clock API. No original Wii code, ROM or DOL.

## Authoritative W03 state, never a public capability
Each **new Phase20 fixture-only** W03 kind1 slot carries a hardcoded private
`serviceQuota=1`, `serviceFixture=true`, fixed `SyntheticCpu::Entry`,
serviceOwner, serviceEpoch, outstanding private Ticket serial and the
canonical existing `clockTicks+clockRevision`. No second Time64 ledger or
service budget exists. Ordinary existing guests (including Phase19 fixture)
cannot be converted into service fixtures.

Public test-only C exports:
- `nsmbw_loop_synthetic_service_fixture_spawn(id,stack,input,output,salt,version,serviceId,hi,lo)`: create **only NEW** fixed-PC slot and request one typed candidate
- `nsmbw_loop_synthetic_service_fixture_retry(id,version,serviceId,hi,lo)`: confined to an **already created Phase20 test fixture**, never an arbitrary guest; cannot mint an issuer or grant quota, and quota zero means no new Ticket is minted
- `nsmbw_loop_synthetic_service_quota(id)` and `nsmbw_loop_synthetic_service_id(id)`: read-only 32-bit scalar observations

The only acceptable Phase19 pure IDs before the independently authored
Phase20 peer ABI is merged are Version 1 `0x53560001` (nanoseconds to ticks)
and `0x53560002` (raw ticks). Version and allowlist are checked before any
guest slot is spawned. `p19::services::prepare(Request,GateView)` is PURE
and is **not authority**, even if a JS caller fabricates matching `origin`,
`serial`, `epoch` and `remainingBudget=9999`. W03 constructs its local
request/view from actual scheduler state, then obtains private
`leaseSynthetic` and consumes that Ticket inside native
`armClockInternal(...,phase20Service=true)`. An attempt to use the old
`armCanonicalClock`, `armSyntheticClock` or register-only publish route on a
Phase20 fixture is denied, even with a private native Ticket.

## Exactly one no-fail actual W03 transaction
1. **Prepare**: validate fresh slot, version/allowlist, fixed PC, private
   owner/epoch/serial and quota=1, result pair coherence and revision. Native
   `armClockInternal` only stages candidate; **quota remains 1** and CPU
   GPR3/GPR4/PC/LR/RAM/clock/revision do not change.
2. **Dispatch**: on next actual `nsmbw_loop_tick()`, prevalidate owner/epoch,
   PC, revision, monotonic ticks and **private** quota and pending service ID
   again. Denied dispatch must not alter CPU/ledger/RAM/trace/quota (the
   attempted pending event and outcome status may be retired/recorded).
3. **Commit**: inside existing single-thread, non-reentrant
   `serviceExecuting=true` section with NO callback or fallible allocation:
   publish `r3=ticks>>32`, `r4=ticks&0xffffffff`,
   `clockTicks=ticks`, `++clockRevision`, **`--serviceQuota`**,
   `clockCommitted=true`, event result. No additional Toad commit.
4. A second request via confined fixture retry checks private quota=0
   **before** minting a new Ticket. No changes to CPU/GPR/FPR/GQR/PC/LR,
   trace, clock or quota; callers may see a separate error code.

Suspend/cancel retire a pending event without consuming the quota; resume
may request the remaining one unit. Reap/reset erase the fixture, owner and
quota; an ID reused on a new fixture has a NEW private owner and epoch.
Ordinary older Phase19 synthetic clock exports and older native tests remain
unchanged. The public test fixture is not a protection boundary against a
maliciously linked native library; no raw `CpuContext*`, Ticket factory or
private quota setter is exposed to JS.

## RED/GREEN native proof
`tests/phase20/peach/private_service_native.cpp` initially linked with
missing Phase20 ABI symbols (RED). Once linked against the **real**
`frame_loop.cpp`, `guest_cpu.cpp`, W04 guest_memory and W07 checked
interop C++, **39/39** checks + **256 reset/commit/quota-deny loops** pass:
caller-forged `GateView` yields a public pure candidate but no W03 state;
quota 1→0, same GPR/ledger/revision; second request is rejected with a full
semantic CPU/FPR/GQR/trace/clock snapshot unchanged, lifecycle and two-guest
independence, service version/ID failures, large 64-bit raw ticks/overflow
bound, actual RAM quota=0 then checked W04 fault. Excludes Wii game code.

## Further integration not yet proven by this native proof
Toad Phase20 v2 public contract and Luigi's generated invented PPC leaf
must be tested against **their exact published SHA** using immutable
source snapshots; neither may issue Tickets or provide trusted quota.
After authored peer reviews, Mario alone merges the three worktrees and
rebuilds fresh combined WebAssembly from a clean source tree. Do not claim
the invented leaf is running under W03 until the exact combined code
actually executes it.
