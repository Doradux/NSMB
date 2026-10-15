# Phase 7 — canonical synthetic clock ownership per Wasm instance

This is a PUBLIC SYNTHETIC clock transport only. It is not Nintendo OSGetTime, VI, IOS, GX FIFO, authentic game execution or gameplay.

## Failure and fix

In Phase6 a nonconfigurable Symbol.for property on the JS "module" object enforced one clock for a raw Emscripten module, even for distinct ESM URL imports. But two distinct legitimate forwarding JS facades of the SAME compiled Wasm each had their own property and could publish clock 200 then clock 100 through cached/uncached aliases without reset.

The authority is now a native lifetime-only C++ static flag, tickClaimed, inside the actual Emscripten compiled module (tick_snapshot.cpp). All host adapters, raw module or legitimate structural forwarding facades, register via the SAME native control request using their store32 export:

    nsmbw_services_tick_store32(0xFFFFFFFC, 0x5449434B) // ASCII "TICK"

This exact pair is a HOST-ONLY SERVICE CONTROL REQUEST, NOT a Wii guest-memory address or opcode. It is processed before guest-address classification. First claim returns 1 with service status 0; later claims return 0 with host-registration-only status 8. Neither allocates a W04 page, writes the guest clock, invokes MMIO or acknowledges a GX FIFO write. All ordinary addresses not mapped to MEM1/MEM2 are rejected, including this address with any nonmagic value (status 7). Do not treat this registration control as evidence of a functional Wii hardware register or a guest service.

An additive C++ export, nsmbw_services_tick_claim(), uses the exact same flag for native callers. The JS adapter deliberately does NOT trust an optional claim function supplied by a facade because a facade could forge a response while forwarding real clock-store calls. It ALWAYS uses the native control request via checked store32/status. The nonconfigurable JS Symbol.for property remains merely an EARLY per-object guard; the shared C++ flag is the real ownership test.

The native claim stays set for the ENTIRE lifetime of the compiled Wasm instance, even when W03 loop_reset clears all guest RAM and contexts. There is no release/reacquire or unowned interval that could admit a stale JS clock. Different Emscripten instances have independent owners.

## Guest epoch reset

clock.reset(lowerBigInt) never clears guest RAM. It rejects a rewind until zero resident W04 pages, zero W03 ready/paused/done/faulted/cancelled contexts, and zero trace length indicate a completed module-wide guest reset. Failed reset leaves both host ticks and guest RAM unchanged. A subsequent legitimate module-wide reset permits the SAME owner to publish an earlier new epoch.

This is a synthetic reset predicate only. No real guest 64-bit timebase, native OSGetTime r3/r4, alarm, DMA, VI/IOS callback scheduling or original Wii game code is implemented or validated.

## Trust boundary

The adapter is for authorized host JavaScript whose forwarded store32/status functions genuinely invoke the SAME intended checked Wasm. Arbitrarily malicious JavaScript that forges store32 responses or calls native exports directly is OUTSIDE the protection contract; this is not an untrusted-provider security sandbox. The optional native claim export cannot replace the genuine C++ store32 control handshake in the JS adapter.

## Reproduce real C++/Wasm and browser

Run build_tick.ps1 -Emsdk <authorized SDK> from web-runtime/runtime-services.
Run node --test over web-runtime/runtime-services/test/*.test.mjs, web-runtime/frame-host/test/*.test.mjs and web-runtime/interop/test/*.test.mjs.

Run Peach independent tests/phase5/tick-ownership.test.mjs with NSMB_TOAD_PHASE5_ROOT set to this worktree and tests/phase6/clock-facade-ownership.test.mjs with NSMB_PHASE6_TICK_ROOT. The latter deliberately constructs two distinct structural facades sharing the same underlying actual C++ Wasm and requires no guest tick regression. Other test cases verify native same-owner reset, frozen provider failure, duplicate ESM URLs, two cached/uncached aliases, 3 CPU contexts, quotas and 128 genuine browser RAF cycles. Nothing depends on commercial Nintendo content.

See docs/wii-runtime-service-gaps.md for other source-grounded translator/CpuContext, MemoryInline, OS/HLE/IOS/GX prerequisites and W01 source-identity blocker. Mario alone may integrate independently approved code into main.
