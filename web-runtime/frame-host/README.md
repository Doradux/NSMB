# W03 Phase 2 — Host-driven synthetic WebAssembly / W07 checked RAM

Owner: Luigi | Branch: `agent/luigi/w03-browser-host-loop` | Base: public Toad W07 commit `7138a64`.

**Evidence boundary:** This is a **synthetic source-independent demonstration**, not the original Wii scheduler, translated Mario functions or gameplay. The public C++ files contain no Nintendo binaries, assets or generated original game code. The W01 profile/hash gate remains unresolved.

## Independent review checkpoint

Peach independently reviewed W03 `fd4c83e` and issued CHANGES REQUESTED:
1. Concurrent `ccall({async:true})` on a *single* Emscripten Asyncify instance caused an uncaught WebAssembly memory out-of-bounds error.
2. The original scheduler exhausted eight slots after the tasks finished, because no explicit lifecycle reclamation existed.

The previous W03 branch and its dirty worktree **are not modified by this phase**. The new isolated host loop addresses the concerns in new modules:
- `asyncify-guard.mjs` rejects concurrent entry BEFORE invoking Emscripten, keeps its lock until the prior Promise settles, and has an actual Asyncify compiled-Wasm regression (`test/lifecycle.test.mjs`). This does not retrofit the original module's raw unsafe calls; downstream callers **must use the guard**.
- `nsmbw_loop_reap(id)` reclaims only DONE/FAULT/CANCELLED contexts, refuses READY/PAUSED, and has slot recycling + prolonged trace tests.
- The ring trace retains the latest 256 events and counts evictions via `nsmbw_loop_trace_dropped()`. A trace ID reused after reap may refer to different incarnations; host code must add its own generation/epoch if historical uniqueness matters.

## Module boundary agreed with Toad

Toad confirmed that W07's public ABI remains stable:

| Function | Semantics |
|---|---|
| `nsmbw_interop_step(srcGuest:u32,dstGuest:u32,addend:u32)->u32` | Copies checked source word + unsigned addend to checked destination; returns 1/0 |
| `nsmbw_interop_status()->u32` | 0 OK, 1 unmapped, 2 32-bit wrap, 3 sparse page/quota failure, 4 MMIO/device denied |
| `nsmbw_mem_read32(guestAddress)->u32`, `nsmbw_mem_error()->int` | Host sees validated guest-memory results; zero data is not failure |
| `nsmbw_mem_set_page_budget(u32)`, `nsmbw_interop_reset()` | Host-selected sparse quota, reset preserves quota |

Toad is separately extending W07 with optional typed MMIO/GX callbacks; **no handler must still fail closed**. This work does not register, override or fake such callbacks. Wii 8/16/64-bit and paired-single/float CPU operations remain unported.

The new `frame_loop.cpp` links **the unchanged public sources** `src/guest_memory.cpp` and `interop/synthetic_guest.cpp` into one Wasm module, ensuring all contexts share the same checked guest RAM. No cross-module raw pointer exchange or unvalidated 4 GiB mapping is used. Each scheduled synthetic step invokes W07 C++ directly, then records a validated result in its own registers.

## Host-scheduler ABI

- `nsmbw_loop_spawn(id,src,dst,addend,limit)`: IDs 1..65535 (trace ABI), 1..32 operations; up to eight simultaneous slots.
- Context state: READY=1, PAUSED=2, DONE=3, FAULT=4, CANCELLED=5; exported `state,pc,reg_a,guest_error,yields`.
- `nsmbw_loop_tick()` executes **at most one** W07 operation; `nsmbw_loop_frame(budget)` executes at most 1..64 ticks; `suspend/resume/cancel/reap` manage lifecycle.
- A guest fault records the W07 error and marks **only that context** FAULT. Its PC/guest accumulator do not advance. Other contexts continue round-robin. Two-page destination writes retain W04 atomic guarantees. A fault attempt is logged with trace bit 15 set.
- `host.mjs` owns `requestAnimationFrame` scheduling, per-frame instruction cap, max frame count, host stop/restart, cancellation and JS error propagation. It rejects manual or nested dispatch while already running. It stops when all contexts are DONE/CANCELLED or blocked (PAUSED/FAULT); host code must explicitly resume paused contexts.
- `diagnostic.html` creates three actual Wasm contexts, suspends/resumes one between real Chrome animation frames, faults another via MMIO and verifies two healthy contexts finish. It checks the real wasm trace/order, memory values and bounded work.

**This explicit state-machine PC is not a saved CPU stack frame**. On Windows the upstream `runtime/src/host_context.cpp` uses `ConvertThreadToFiber/CreateFiber/SwitchToFiber`. Other native targets use cooperative stacks via libco or manually saved stack pointers with guard pages. Ordinary WebAssembly browser exports cannot transparently implement those native semantics. `emscripten_sleep` + Asyncify proves a single nested call continuation; it cannot safely switch concurrent native-like guest fibers. JSPI has not been evaluated for deployment here.

## Build and tests (Windows marcos)

Using an authorized private **toolchain only**, never staging toolchain contents:

```powershell
cd C:\NSMBcowork\worktrees\Luigi-Phase2
.\web-runtime\frame-host\build.ps1 -Emsdk 'C:\path\to\private\emsdk'
.\web-runtime\frame-host\build_asyncify.ps1 -Emsdk 'C:\path\to\private\emsdk'
node --test web-runtime/frame-host/test/*.test.mjs
```

Independently run on `marcos` on 2026-10-14:
- Both Emscripten compilations **PASS** and emit real `.wasm` and browser ESM assets.
- **12/12 PASS** (11 Node regressions + 1 actual Chrome headless test using a localhost-only allowlist HTTP server and Chrome DevTools Protocol).
- Browser test checks three independent guest functions interleaved across **4 actual animation frames**, budget ≤2 per frame, deterministic trace `[1,2,3,1,2,1,2]`, MMIO error 4, two completed threads and successful checked RAM results 13 and 26.
- Regression checks cover sparse quota failure isolation, cancellation, explicit host pause/restart, invalid transitions, safe context recycling, ring buffer, Asyncify non-reentrancy, reentrant frame denial, and 16-bit trace IDs.

Browser test uses unique ephemeral loopback port and private temporary browser profile, requires actual Chrome/Brave, and verifies no uncaught browser runtime exception. Do not count a skipped browser test as hardware/browser success on another machine.

## Next private-compatible HostContext integration contract

Proposed host interface for Mario's future *single privately checked original translated guest function*, gated on W01:
1. Validate the original DOL profile/hash, HLE hooks, ABI calling convention and memory map privately. Never publish generated original game functions.
2. Introduce checked `CpuContext` register snapshots and explicit guest PC/SP + interrupt state; replace synthetic `source/destination/addend` with a typed checked guest step, not a JS pointer.
3. Deliver `RunSlice(maxGuestSteps)` to the browser host with statuses RUNNING/YIELDED/WAITING/FAULTED/DONE and deterministic wake reasons. All quota/MMIO failures propagate per guest context, never get treated as ordinary RAM.
4. Preserve non-reentrant continuations and guard bounded main-thread work; implement real VI retrace timing, host events, thread priorities, safe stack lifecycle, DMA/GX device policies and cancellation separately.
5. Independently test native-vs-browser register/memory/observable results. This document **does not claim that any original game function has been invoked**.

Limitations: single-thread synthetic CPU state only; max eight active contexts, 32 guest steps/context, trace last 256 events; script-driven deterministic work, not frame-perfect emulation, rendering, audio, or Wii OS scheduling. Host cancellation does not forcibly unwind arbitrary native guest call stacks.
