# Peach Phase 4 — independent RED-first actual-WebAssembly acceptance

Owner: Peach (QA). Public baseline: `main` SHA `3d313d4`. QA-only branch:
`agent/peach/phase4-shared-wasm-qa`. No source changes under
`web-runtime/frame-host`, `web-runtime/runtime-services` or other agent scopes.

**Proof boundary:** Copyright-free synthetic PowerPC-like ABI / input packet /
checked sparse Wii-address guest RAM compiled to real Emscripten Wasm. **NOT**
original game code, a Nintendo disc/ROM, real Wii Remote, native CPU switch
fibers, Wii hardware HLE, GX/audio, or a browser-bootable Mario game.

## Exact ABI coordinated with Luigi and Toad

- **One normal module:** `web-runtime/frame-host/dist/frame_loop.mjs/.wasm`
  links W03 scheduler, W04 guest RAM, W07 typed policy, Toad
  `runtime-services/input_snapshot.cpp`, and Luigi synthetic guest CPU.
  Never use a second `input_snapshot.wasm` for the acceptance result.
- Toad: `nsmbw_services_input_store(address,buttons,axisX,axisY,sequence)`
  with separate `nsmbw_services_input_status()`. The W08
  `writeSyntheticGamepadSnapshot(wasm,...)` host adapter performs actual
  checked Wasm input writes. MEM1 `0x80004000` equals alias `0xC0004000`.
  Packet [seq,Y,X,buttons], big endian. Unplug neutralizes buttons/axes.
- Luigi: `nsmbw_loop_cpu_spawn(id,entry,stackTop,inputAddress,outputAddress,salt)`,
  `nsmbw_loop_cpu_gpr(id,index)`, `nsmbw_loop_cpu_steps(id)`,
  `nsmbw_loop_cpu_lr/ctr/cr/xer(id)` and existing `nsmbw_loop_pc`,
  `nsmbw_loop_frame`, `nsmbw_loop_state`, suspend/resume/retry/reset.
  Entry `0x80010000`, callee `0x80010100`, LR exit sentinel
  `0x8001FFF0`, 11 bounded operations per CPU context. Distinct guest
  stack tops `0x80005010`, `0x80006010`, `0x80007010`; output pages
  `0x80009000`, `0x8000A000`, `0x8000B000`.
  A real guest function reads shared input and returns
  `r3 = buttons + sequence + salt`, saving/restoring `r1` and `LR`.
- W07 typed errors 3 quota, 4 denied MMIO, 5 callback reject and 6 invalid
  callback reply must fault ONLY relevant guest before committing that
  instruction's PC/GPR. Separate test-only `frame_loop_fixture.wasm`
  exposes mock typed callback knobs; the normal Wasm must not.
- This QA's suggested export names were replaced with **the exact ABI
  Luigi communicated** in `NSMBcowork/messages/...Luigi_to_Peach_acec8c8a.md`.
  If an author later changes the ABI, document actual new SHA/interface and
  independently review; do not downgrade asserts to permissive mocks.

## How to run on authorized Windows PC

Use an independent clean detached checkout of the author candidate and
recompile from C++ using the authorized local Emscripten SDK. Never rebuild
a different agent's dirty worktree. Example with a clean published candidate:

```powershell
$env:NSMB_PHASE4_ROOT = 'C:\NSMBcowork\worktrees\Peach-Phase4-CPU-Review'
node --test tests/integration/phase4/joined.test.mjs tests/integration/phase4/browser.test.mjs
```

To target Toad's separately staged, already-linked W03 + W07 input service:

```powershell
$env:NSMB_TOAD_PHASE4_ROOT = 'C:\NSMBcowork\worktrees\Peach-Phase4-Toad-Audit'
node --test tests/integration/phase4/input-atomicity.test.mjs
```

Target browser is **actual Chrome/Brave**, not jsdom. A missing browser is
a FAILED test, not a skip. All modules must start from actual `0061736d`
magic bytes. Browser fixture uses an exact six-resource loopback HTTP
allowlist; full game/private/profile paths, fixture Wasm and source paths
return 404. It tests Chrome 320px responsive width and CDP
console/HTTP errors using W06 harness, with awaited Chrome/profile cleanup.

## Gates

1. Main synthetic baseline: W03 interop/MMIO final-op fault no PC commit.
2. One Wasm: W08 checked input packet aliases into exact W03 RAM. A
   scheduled C++ guest changes one real guest word. Disconnect writes a
   neutral packet and the NEXT C++ guest sees the updated source.
3. Sparse quota0 must not allocate/write input. MMIO output and invalid
   alignment must fail closed without overwriting existing guest data.
4. Three independent CPU contexts, real round-robin PC and GPR state, guest
   stack `r1`, saved caller SP, LR sentinel, call/return, independent
   output words, suspend/resume, 11 steps each.
5. C++ CPU fault atomicity on MMIO (4) and later output-page allocation
   (3), explicit RAM-only safe retry; fixture rejects typed 5 and 6.
6. Repeat 128 scheduler reset/input/guest cycles with bounded sparse
   guest memory. Real Chrome runs 128+ input-frame RAFs and another 128
   CPU call/return RAF sessions on the SAME actual Wasm instance.
7. Malicious private paths and test-only device fixtures must not be served.
   Browser page must fit at 320px with zero uncaught errors.
8. **Cross-context failure atomicity:** a rejected joined input frame
   MUST NOT mutate the current guest input snapshot simply because eight
   terminal contexts have not been reaped. This is a separate Toad
   `joined_input.wasm` gate and requires no fake JS result.

## Verified starting red-first baseline (15 October 2026)

- Integrated main `3d313d4`: host and memory baseline green.
  Independently executed W03/Phase3 **27/27 PASS**, W04/W07/host-input
  **42/42 PASS**, W06 public website **14/14 PASS**, all with real Chrome
  where required and **zero skips**.
- Same-module Phase4 suite against old main: expected **RED** — no
  `_nsmbw_services_input_store` in W03 host normal module, and no new
  Luigi PPC CPU exports. No JS/shim-only green workaround permitted.
- Toad Phase4 SHA `12cb05c` (independent detached
  `Peach-Phase4-Toad-Audit`): Emscripten rebuilt real
  `joined_input.wasm`; all author **81/81 PASS** including real Chromium.
  Independent `input-atomicity.test.mjs`: **1 PASS / 1 FAIL**.
  Repro: 8 terminal unreaped contexts consume capacity, request guest ID 9,
  `applyJoinedInputFrame(...)` throws `JOINED_GUEST_SPAWN_REJECTED`
  AFTER overwriting guest input `0x11223344` with `0x63000000`.
  The negative check is deliberately RED. Independent formal
  `CHANGES REQUESTED` was sent to Toad and Mario, tracked in
  `NSMBcowork/reviews/2026-10-15T07-28-02-684Z_Peach_to_W07_96f6df55.md`.
- Luigi's Phase4 CPU changes were **uncommitted** when these acceptance
  tests were authored; no approval or real-Wasm CPU result is claimed yet.
  Update status after a clean SHA is independently built and executed.

## Merge policy and scope limits

Red tests are gates, **not suite failures to hide**. Never merge to
`main` without independent critical review by Toad or Luigi and
Mario's decision. Test code and docs have no original Nintendo code,
private disc contents, mapped translated original functions, pinned
private hashes, or toolchain files. W01 remains unresolved: original
PPC execution stays PRIVATE and BLOCKED until an audited exact hash
profile and compatible ABI are independently proven.

## Update — Toad correction 022d6d9 independently verified

Earlier Toad 12cb05c: 81/81 author tests pass, but Peach capacity
regression fails and Luigi reproduced paused-guest input overwrite.
Toad fixed both in 022d6d9, without editing frame-host.

Peach checked out a NEW clean detached 022d6d9, rebuilt actual
joined_input.wasm, ran author Node/Chrome W03+W07+input 82/82 PASS,
0 skipped, and updated input-atomicity.test.mjs 3/3 PASS: shared
W04 memory, eight DONE-unreaped contexts, one PAUSED guest retaining its
original input on resume. The helper rejects before writing on any
unreaped/paused slot and never auto-reaps another owner.
Formal W07 Peach synthetic-only approval:
C:\NSMBcowork\reviews\2026-10-15T07-34-29-187Z_Peach_to_W07_b8cf71c3.md.

## CPU ABI reviewed expectations (Luigi coordination)

The Node suite asserts 11 actual synthetic C++ instructions and BL/BLR
semantics across three independent contexts, r1 restored after return,
r3 = buttons + seq + salt, LR sentinel 0x8001FFF0, independently saved
caller stack at stackTop-16, checked W04 output in RAM, CPU MMIO fault
PC/GPR atomicity, and explicit RAM-only quota retry. Separate TEST-ONLY
frame_loop_fixture.wasm must expose typed MMIO 5/6 callbacks; normal
runtime MUST NOT. The real Chrome diagnostic demands 128 real input RAF
loops and 128 further CPU call/return RAF loops, plus 320px responsive UI.

Toad independently found first Luigi CPU candidate SHA 937a394 lets
stackTop 0x80004010 overwrite the input packet at 0x80004000.
His formal review is CHANGES REQUESTED. Require guest-physical alias
and cross-context stack overlap rejection before merge; Peach will test
the next CLEAN Luigi SHA and the exact CPU ABI.

## Update — Luigi first synthetic CPU SHA 937a394

Peach checked out exact 937a394 into a NEW clean detached worktree,
independently rebuilt frame_loop normal, typed fixture and Asyncify Wasm,
and tested with Toad independently fixed 022d6d9 joined input:
first 13/13 combined Node+true headless Chrome/320px tests GREEN.
This proves the ordinary C++ synthetic ABI and input path, but not
guest stack/input safety.

Two NEW independent CPU address-alias adversarial tests in joined.test.mjs
are RED on 937a394 (8/10 Node PASS, 2 FAIL):
1. StackTop 0x80004010 has 16-byte caller frame [0x80004000,0x80004010).
   Guest input pointer 0xC0004000 aliases its start; loop_cpu_spawn
   incorrectly returns 1 rather than rejecting before corrupting input.
2. Two different unfinished synthetic CPU contexts use the SAME
   stackTop 0x80005010; both are accepted and can corrupt saved
   caller SP/LR. A real synthetic CPU proof must isolate guest stacks.

Both require preflight canonical guest physical alias checks against
input/output and all active CPU stacks, with zero mutation on rejection.
Formal W03 Peach 937a394 CHANGES REQUESTED:
C:\NSMBcowork\reviews\2026-10-15T07-38-32-392Z_Peach_to_W03_af6e380d.md.
Toad's independent review found overlapping input too. New Luigi exact
clean SHA must pass both tests, full authored suites, and actual Chrome
before approval. Do not merge 937a394.
