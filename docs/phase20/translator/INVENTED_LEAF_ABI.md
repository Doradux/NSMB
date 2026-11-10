# Luigi Phase20: invented PPC-Lite to a by-value W03 leaf ABI

The only source is created by scripts/phase20/luigi/abi.py from
already entirely INVENTED PPC bytes, not Nintendo code or C# producer.
Source SHA256 at first published commit:
167ae443b59b03c89a898d3e74bf9f39588c355f0c261f845f9725f1b99f03cb.

The first difference from P19 is MATERIAL: Phase19 toy only exported
nsmb_toy_execute(entry,initial) from a standalone Wasm. It had NO typed
W03 CpuContext coupling, return PC, LR, service candidate or security
state. P20 exposes a narrow, deterministic, compiler-generated
C++ value-only result suitable for a future trusted W03 caller.

Files generated deterministically from decoded invented instruction bytes:
- scripts/phase20/luigi/toy_leaf_abi.hpp
- scripts/phase20/luigi/toy_leaf_generated.cpp
- scripts/phase20/luigi/leaf_metadata.json
The tracked files MUST equal render_header()/render_cpp()/provenance() outputs
byte-for-byte; automated tests verify. Reproducible producer child writes
source.dol, inputs.map, config.json plus those three files. A separate
witness re-decodes source bytes and tests all 6 actual files, full event
newline, public nonce and a caller-supplied C++ SHA.

## Narrow C++ ABI, NOT authorization

Namespace nsmbw::p20::toy, versioned by source+header SHA. A generator
includes the definition in toy_leaf_abi.hpp:

    struct Input {
      uint32_t entryOffset, expectedPc, gpr3;
      uint32_t lr, stackSentinel, maxSteps;
    };
    struct Result {
      Status status;
      uint32_t gpr3,lr,returnPc,steps;
      bool computed() const noexcept;
    };
    Result evaluate(const Input&) noexcept;

Input size24, Result size20, standard-layout/trivially copyable.
Status=0 ok; 1 wrongPc; 2 unknownEntry; 3 unsupportedOpcode;
4 recursion; 5 stepLimit; 6 badBranch. ALL non-ok results have
gpr3=0, lr=0, returnPc=0 (zero candidate), with steps diagnostic.
No writable host pointer, no CpuContext*, private Ticket, quota,
clock ledger, native gate, guest RAM/device callback or JS HLE in leaf.

The expectedPc=0x80010000 scalar is public and can be forged.
It is a *consistency* check, NOT W03 authorization. W03 alone must
compare its own internal PC, slot/generation/epoch/owner, private
Ticket, phase, dispatchBusy and private per-guest service quota
BEFORE accepting any candidate.

A DIFFERENT public TEST-ONLY C ABI nsmb_p20_leaf_probe(...) exports
typed scalar fields for a source-oracle comparison in native/Node/
Chromium. The production W03 should link evaluate() directly in C++
after private authorization, not ask JS to grant permission.

## Actual PPC-Lite semantics and clear limitation

Only NOP, ADDI r3,r3,signed16, BL (bounded child address) and BLR.
Source root offset 0x000 calls offset0x020 and 0x0e0, then +5.
For initial r3=100 this produces r3=118, steps8, LR from caller
unchanged, returnPc=0x80010004. Another entry offset0x040 calls
offset0x060, which does ADDI -3, followed by +7 => r3=104.
Entry0x060 with r3=0 returns 0xfffffffd (sign extension).
A UINT32 wrap at entry0x0e0, input 0xffffffff -> r3=10.
Unknown/invalid offset0x0a0,0x0c0,0x0300, wrong W03 PC,
insufficient maxSteps and invalid branch return zero/no mutation.
Hard bound: 128 total decoded instructions and 16 nested calls.

CRITICAL: function calls use a shadow continuation stack and preserve
the incoming external LR. Real PPC BL overwrites LR, and a real binary
must explicitly save/restore LR with mflr/mtlr or equivalent. Those
instructions are not in this toy subset. Do NOT call this full original
PowerPC semantics, nor claim genuine upstream C# translation.

## W03 authorized service integration seam

When the scheduler can expose a NATIVE-only, privately authorized
synthetic leaf invocation, it should:
1. Privately revalidate W03 guest slot/generation/owner/epoch, private
   Ticket, expected current PC, phase/dispatchBusy and PRIVATE quota.
2. Acquire a by-VALUE CPU input snapshot (not an externally held
   CpuContext pointer), call evaluate() with fixed W03 PC and one
   allowlisted entry offset. No arbitrary user-installed binary.
3. A status ok yields ONLY an untrusted arithmetic result.gpr3.
   W03 can choose ServiceId rawClockFromTicks=0x53560002 and pass that
   value into Toad's V2 PURE compute() (candidateOnly != permission).
4. W03 rechecks its private ticket+quota+epoch+PC+revision and canonical
   current clock; in ONE no-throw/no-callback scheduler dispatch commit
   CandidateV2 hi/lo -> GPR3/GPR4, canonical ticks/revision and quota--.
   On ANY deny, no CPU/clock/quota mutation, including reentry or
   stale revisions. Public ViewV2 claimedBudget/origin are forgeable.
5. W03 remains only ledger authority; no second Toad Time64 ledger,
   no JS Ticket, no raw CPU pointer, no original Wii service.
Only Peach may edit W03 frame_loop.cpp and build fixture exports.

## What was actually tested here

Our Phase20 native intermediate fixture links actual P19 scheduler
frame_loop.cpp, Toad exact V2 header source from immutable Git SHA
4b4151b0f25027b85f5f15fb205a7fad1631c6d0 and the generated
C++ leaf. The host TEST HARNESS evaluates the by-value leaf and
computes public pure V2 candidate, obtains a real private W03 Ticket
through native leaseSynthetic, then arms the canonical ledger.
Next actual nsmbw_loop_tick atomically commits clock and GPR3/GPR4;
wrong PC, default empty Ticket, replay, LR/PC/FPR/GQR/RAM mutations
denied. 21 named native checks plus 128 W03 reset cycles pass under
ASan/UBSan.

This is NOT YET W03 invoking the translated function internally
and does NOT debit an actual private SERVICE quota. The host harness
is trusted synthetic native test code, not a forged JS admission.
Do not claim P20 full service bridge until Peach's private W03 fixture
has been compiled and tested from its own final SHA.
