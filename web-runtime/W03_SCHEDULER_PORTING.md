# W03 — Portable browser scheduling / Asyncify experiment

Owner: Luigi | Branch: `agent/luigi/w03-scheduler` | Reviewed source: upstream WiiCompiled host-context and guest fiber manager.

## Purpose and evidence boundary

This is a runnable **synthetic WebAssembly demonstration**, not an implementation of Wii OS threads or a playable game. No Nintendo binaries, ROMs, translated game functions, assets, memory images, credentials or private toolchains are committed.

The main deliverable is `web-runtime/src/scheduler.cpp`, a deterministic single-thread cooperative state machine with:
- Eight fixed context slots; 1–32 synthetic instructions per slot; bounded 256-entry execution trace.
- Explicit per-context PC, accumulator, READY/PAUSED/DONE state and yield count.
- One instruction per `nsmbw_sched_step()` call; round-robin cursor advances deterministically.
- `suspend(id)` / `resume(id)` and no spinning when all unfinished contexts are paused (`step=-1`).
- `run_budget(1..1024)` host-owned dispatch cap, input errors and reproducible reset.
- Exported C functions compiled to actual `scheduler.wasm` through Emscripten, called by Node and an actual headless Chrome DOM test.

A separate `src/asyncify_probe.cpp` preserves a nested C++ call frame across `emscripten_sleep(1)` and validates after resumption that a local `volatile uint32_t` survived. **Correct host usage is `module.ccall(name, ..., {async:true})`**. Calling the raw `_nsmbw_async_nested_probe` synchronously returned an initial 0 before resume in the experiment; the regression now asserts the resolved async value (83) and both phases (1 -> 2).

## Original HostContext compatibility audit

References, read from original upstream only:
- `runtime/include/host_context.h`: `InitializeScheduler`, `Create(stackSize,entry,arg)`, `IsCurrent`, `Switch(target)`, `Destroy`, opaque stackful Handle.
- `runtime/src/host_context.cpp`: on Windows the backend uses `ConvertThreadToFiber`/`CreateFiber`/`SwitchToFiber`. On Linux it uses libco, and on ARM64 custom `mkw_co_switch` with saved stack pointers and `mmap/mprotect` guard pages.
- `runtime/include/fiber_manager.h`: one host stackful context per guest OSThread, per-thread `CpuContext`, guest READY/RUNNING/WAITING/MORIBUND, scheduler-context handoffs, guest thread creation/exit and VI retrace input.

**A simple WebAssembly export cannot implement native `HostContext::Switch` semantics**: there is no native OS host stack/fiber to switch to under ordinary browser Wasm, nor direct `mprotect` guard pages. The synthetic state-machine stores an **explicit PC**, not an arbitrary C++ call stack or full PowerPC CpuContext.

## Verified execution

Build, on Windows `marcos`:
```powershell
cd C:\NSMBcowork\worktrees\Luigi-W03
.\web-runtime\build_scheduler.ps1 -Emsdk 'C:\Users\kakyg\Documents\NSMBW-Private\toolchain\emsdk'
.\web-runtime\build_asyncify.ps1 -Emsdk 'C:\Users\kakyg\Documents\NSMBW-Private\toolchain\emsdk'
node --test web-runtime/test/scheduler.test.mjs web-runtime/test/asyncify.test.mjs web-runtime/test/scheduler_browser.test.mjs
node web-runtime/test/scheduler_benchmark.mjs
```

- Generated scheduler module: `dist/scheduler.wasm` **3122 bytes**, plus ESM glue; Asyncify nested frame probe: `dist/asyncify_probe.wasm` **7615 bytes**. Modules implement different work, so sizes **do not** quantify Asyncify's overhead on the same program.
- **5/5 automated tests PASS**: three Node tests verify interleaving of 3 contexts (expected [1,2,3,1,3,1,3,1,3,2,2,2]), multiple yields and a real pause/resume, bounding/error cases; fourth test verifies real nested Asyncify suspension/resumption in Node; fifth launches **real Chrome headless** with the Wasm modules via the allowlisted HTTP server and verifies 12 async host turns, all 3 done, and Asyncify nested result=83.
- Browser page: `/web-runtime/scheduler-lab.html` served locally (use port 3018 or another non-3000 port). The page displays PASS only if both actual Wasm paths complete; fallback is NOT counted as PASS.
- Smoke server allows only the new diagnostic HTML and two generated ESM/Wasm pairs; no user assets are hosted.
- Indicative Node microbenchmark: **25,000 cycles / 300,000 dispatched synthetic instructions in 8.707 ms (~34.5M/s)** on marcos at one run. This is **not** a real workload, frame rate, per-instruction emulation cost, or validated throughput in a browser; no confidence interval or baseline. Rerun on target hardware.

## Asyncify, JSPI and next actual integration barriers

**Asyncify path:** Emscripten `-sASYNCIFY=1` instruments Wasm functions so approved asynchronous imports or `emscripten_sleep` can unwind/rewind. A JS host must await its Promise via `ccall(...,{async:true})`. This proves a *single* nested C++ stack can resume, **not** several concurrently switchable Wii fibers inside the same runtime. Long-lived/nested guest fibers require explicit scheduler-mediated ownership of continuation, correct recovery on cancellation and no simultaneous conflicting unwind operations.

**JSPI alternative:** explore JS Promise Integration with the actual target browser + Emscripten version; no JSPI module has been compiled/tested in this work. JSPI's deployment compatibility, Promise exports/imports, scheduling limits and performance must be measured before adopting. Do not claim universal browser support.

**Still missing vs Wii**:
1. Full PowerPC registers/stack `CpuContext` save/restore, cancellation, exceptions and exact `HostContext::Switch` API emulation.
2. Guest OSThread priority, dispatcher queues, condition/sleep primitives, VI retrace timers/interrupts and HLE reentrancy.
3. Browser event-loop time slicing under work exceeding frame budgets; pauses on async I/O, watchdogs, repeatable guest clock semantics.
4. Exact integration into translated code and checked sparse memory; W04/W07 memory policy, thread safe guest writes and executable pages.
5. Stack-limit/overflow policy, file/controller/audio services, testing real function yield from deeply nested guest frames, and non-reentrant Asyncify access.
6. Actual game boot, visible level rendering and controller gameplay. NONE are demonstrated.

## Proposed next milestone (requires cross-team architecture decision)

A supervised host adapter should expose `spawn/wake/sleep/slice/event` around a checked guest CpuContext and a call-graph of translated yield points. Prototype two *interleaved* synthetic translated functions that can resume after host callbacks without JSPI or Asyncify reentrancy violations; then test real guest register snapshots, timing, memory errors and teardown. Mario must approve the HostContext/Fiber API migration design and coordinate W07 before integration.

## Independent review request

Inspect `src/scheduler.cpp`, `src/asyncify_probe.cpp`, test harness and generated modules. Check deterministic fairness, all-paused exit, WAsm C ABI, timer yields, JS async Promise correctness, wasm MIME, cancellation/errors and adversarial transitions. Reviewer must rerun Node + headless browser; do not infer playable status. Only Mario merges to `main`.
