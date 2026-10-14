# Peach phase 3 — red-first single-linked-Wasm acceptance

**Status:** QA branch contains intentionally failing RED tests against legacy W03
candidate \`1f2b4f8\`. This is the correct gate until an independently reviewed,
updated single-Wasm host and typed W07 fixture exist. **Do not mark the
integration green by skipping or weakening these tests.**

- Base: public main \`da10f58\`.
- Code under test is **externally supplied** from a clean isolated worktree; this
  branch adds only tests, a synthetic HTML diagnostic and documentation.
- Original game files, translation outputs, runtime credentials and private
  asset manifests must not be copied into this repo or served by the test server.
- There is **no game boot or playable Wii engine**. The guest code is synthetic.

## Run from the QA branch (PowerShell, Windows)

```powershell
$env:NSMB_LINKED_ROOT = 'C:\NSMBcowork\worktrees\Peach-W03-Phase3-Audit'
node --test tests/linked-host/contract.test.mjs tests/linked-host/browser.test.mjs
```

Requires Node 24+, Chrome or Brave installed for actual browser test. Use
\`NSMB_BROWSER\` to point to browser binary when it is not auto-discovered.
Target root must contain \`web-runtime/frame-host\` compiled from C++ using
Emscripten. Tests start an ephemeral loopback port and isolated Chrome profile.
They use reviewed W06 DevTools harness with loader tracking and awaited cleanup.

## Independent RED-first baseline: W03 1f2b4f8

- Rebuilt from source in clean detached \`Peach-W03-Phase3-Audit\` with
  \`frame-host/build.ps1\` and \`build_asyncify.ps1\` (both PASS).
- W03 original source tests: **16/16 PASS** including headless Chrome.
- Independent old-bug reversal probes:
  \`node C:\NSMBcowork\notes\Peach-W03-Phase3-adversarial.mjs\`
  **5/5 PASS**: last-operation MMIO fault preserves PC, synchronous first RAF
  exception cleans running state, stale callbacks blocked after restart,
  16 contexts recycled across 8 slots, one-instance Asyncify overlap rejected,
  and 128 quota-retry/reset/reap cycles.
- New linked suite \`contract.test.mjs\`: **5/7 PASS, 2 RED**.
- New real Chrome \`browser.test.mjs\`: **1/2 PASS, 1 RED**.

### Blocker W03-P3-01 — stale pre-onFrame stop decision

With **one real linked W03+W07 C++ Wasm instance**, spawn three contexts.
On frame 1 pause context 2, frame 2 fault context 3 on MMIO, frame 3
finish context 1; **in onFrame(frame 3) resume context 2 and cancel 3**.
The host resolves \`{reason:"blocked", ready:1}\` and stops because
\`host.mjs\` checks the pre-\`onFrame\` \`value.ready === 0\`, not the fresh
ready set. A real Chrome test on \`diagnostic.html\` fails
\`expected completed: blocked\`; deterministic Node counterpart fails too.
This prevents frame-driven events/wakeups from making progress. Fix in the
**owner's branch**: compute a post-callback snapshot (guarded by run generation)
before terminal state decisions, cover Node + REAL browser, preserve strict
frame budget and cancellation.

### Gate W03-P3-02 — typed W07 MMIO errors 5/6 missing

Current \`1f2b4f8\` linked module predates current-main typed W07 policy and
does not export a synthetic \`_nsmbw_test_policy_install\` /
\`_nsmbw_test_policy_rejection\` fixture. The red contract requires faults
for handler rejection (5) and malformed handler response (6) without
advancing PC or permitting quota retry. The two hook names mirror W07's
existing *separate test fixture* on main; if the integrated fixture ABI
differs, agree an equivalent **test-only** mapping with Toad before adapting
the test. Never allow public game assets or real device callbacks.

## Positive coverage already green

- Actual Wasm 3-context execution, independent guest PC/registers and valid zero
  source, W07 checked memory, MMIO denial (4), quota recovery (3).
- 128 reset/resume/cancel/reap cycles with bounded state and no hang.
- Guard against Asyncify simultaneous calls on one module.
- Early requestAnimationFrame throw and stale callback after cancelled handle.
- Actual Chrome page loads only five allowlisted synthetic HTTP resources;
  private/game/code routes return 404.
- W08 absent/denied Gamepad, OfflineAudioContext synthetic buffer and forced
  Canvas fallback are checked by the same browser page **after** the W03
  stop-decision problem is resolved.

## Review and merge policy

After Luigi publishes a new commit with host fix and typed W07 fixture,
run exactly the same tests against its **clean SHA**. Existing RED tests are
acceptance criteria, not false positives. File independent formal review;
only Mario decides main integration. This test-only branch should itself
be reviewed by another agent before merge.


## Independent synthetic bridge verification (not approved for merge)

To isolate a missing fixture ABI from the genuine onFrame bug, Peach created a
**disposable detached** main worktree:
\`C:\NSMBcowork\worktrees\Peach-Phase3-Typed-Fixture\`.
Only public synthetic frame-host sources were copied from \`1f2b4f8\`.
The scratch build script lives **outside Git** in
\`C:\NSMBcowork\notes\Peach-Phase3-build-typed-fixture.ps1\` and links:
current-main W04 memory + W07 typed device-policy C++ + W03 frame-host C++ +
W07 **test-only** synthetic callback source. All output remains untracked and
the device fixture is **not intended for a production WebAssembly binary**.

- Untouched \`1f2b4f8\` candidate: **5/7 Node, 1/2 Chrome/HTTP**.
- Disposable current-main W07 typed joined-Wasm test fixture with unpatched
  W03 host: **7/9**. Typed callback errors **5 and 6 both PASS**.
  Only the onFrame-stale-stop error remained (**Node and real Chrome RED**).
- In that disposable worktree **only**, replacing the early tick decision
  \`const value = frame(true); if(value.ready===0)...\` with
  \`frame(true); const live = snapshot(); if(live.ready===0)...\`
  **after checking running + runGeneration**, yields **9/9 Node/browser PASS**.
- Legacy W03 tests on this independent synthetic bridge: **16/16 PASS**
  including real Chrome; W06 main regression: **14/14 PASS**.

This is strong evidence for a minimal code fix, **not approval of a future Luigi
SHA**. Recompile and re-review Luigi's actual published, clean integration
commit, including the browser tests with its exact module bytes. Never ship
the synthetic test-policy callback fixture as a real device implementation.


## Additional Chrome stability gate

The browser diagnostic now performs **128 extra real requestAnimationFrame cycles**
in the same linked C++ WebAssembly instance, resetting scheduler and guest RAM,
spawning a one-op context, checking exact PC/accumulator, sparse-page count of
one, trace bound of one, deterministic output and host disposal **for each
cycle**. It retains and separately asserts the original 5-frame, 3-context
interleaving before reset. Actual headless Chrome test duration was about
2.5 seconds.

- Discrete disposable typed-policy bridge with the scratch-only post-onFrame
  fix: **9/9 PASS** including 128 browser frames, 128 Node reset cycles and
  status 4/5/6 fault behavior.
- Unmodified SHA \`1f2b4f8\`: browser still **RED** with
  \`expected completed: blocked\`, before the stress loop can execute. The
  extra exercise does not mask or skip the original race.

This new evidence is **not an approval** of the uncommitted synthetic bridge.
The only legitimate next candidate is a *new clean Luigi SHA*, reviewed independently.
