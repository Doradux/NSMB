# W03 supplemental scheduler regression review — Luigi

Branch: `agent/luigi/w03-adversarial`. Base: `cefb5d9`. Scope is independent additional tests, **not** a replacement for the working `agent/luigi/w03-scheduler` checkout. That checkout contained uncommitted host/browser work and was not changed.

## Verified in the authorized marcos Windows environment (2026-10-14)

- Recompiled `web-runtime/src/scheduler.cpp` with `web-runtime/build_scheduler.ps1`, private Emscripten SDK: PASS, actual scheduler.wasm.
- `node --test web-runtime/test/scheduler.test.mjs web-runtime/test/scheduler_adversarial.test.mjs web-runtime/test/asyncify.test.mjs`: **7/7 PASS**, including 3 new adversarial scheduler checks.
- `node --test web-runtime/test/scheduler_browser.test.mjs`: **1/1 PASS**, launches real headless browser and runs compiled scheduler and async probe.
- `node web-runtime/test/scheduler_benchmark.mjs`: 25,000 cycles, 300,000 synthetic Wasm dispatches in 9.081 ms (~33.04 million/s). This figure is not Wii/game-frame performance.

## Added independent adversarial checks

1. **Eight concurrent contexts / fairness:** verifies 256-entry round-robin trace at all positions (8 contexts x 32 dispatches), no lost IDs, no trace overflow or extra dispatch after all done.
2. **All contexts paused:** four running contexts are paused after partial progress, then 100 repetitions of `step` / `run_budget` must return instantly with unchanged PC and trace; resumes all and completes exactly once.
3. **Invalid transitions:** duplicate spawn, missing suspension, resuming READY/DONE and double suspension must report errors without mutating prior PC, accumulator, or trace.

## Scope limits and next contract

This synthetic scheduler is **not** a replacement for Wii `HostContext::Switch` stackful fibers. Explicit guest task PC and values do not save actual native C++ call frames, PowerPC register files, interrupts, callbacks, memory guards, or resource state. Asyncify probe demonstrates only one nested frame across a delayed callback, not multiple truly simultaneous resumable Wii threads. JSPI remains unproven on the target browser. Priority, timer, retrace, guest locks, wake queues, cancellation and dispatch preemption need separate integration and tests.

Proposed next independent milestone (do not mix with existing uncommitted work): test host-driven event wakeups, await/cancellation and deterministic fairness against a formal reference state machine, then constrain host callback reentrancy. W07 memory interactions require Toad/Mario coordination. This branch contains no Nintendo game data.

Review request: inspect `web-runtime/test/scheduler_adversarial.test.mjs`, run commands above, and confirm real Wasm outputs. Only Mario merges approved work into main.
