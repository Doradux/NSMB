# Phase 8 — reviewed clock rebuilt with the CURRENT W03 CPU ABI

Public synthetic runtime only. Baseline origin/main 9f000e0; no original Wii content.

## Reproduced linker issue and fix

Applying earlier reviewed W07 clock source to current W03 without source parity caused wasm-ld undefined symbol nsmbw_synthetic_public_scalar in guest_cpu.o.
Current normal frame-host/build.ps1 links translator_abi_fixture.cpp; old runtime-services/build_tick.ps1 omitted it. The corrected build adds this exact public synthetic source, without stubbing or changing frame-host sources.

## REA 6.5.0 static gate

Current Emscripten joined_tick.wasm: 22511 bytes; SHA256 b90618a8fe28211ba186cd51a8d2b45321d02de2bde1a68d1b592c68eb7cf1b8.
REA WABT adapter wabt@1.0.42, evidence ev_4f45b606b22251fcc02ea30afbd21b3cdafa9bbd8b41da6572c8059e3067be35. Validation valid, interface complete, 70 exports, only external import env.emscripten_resize_heap.
Retained four current CPU exports: nsmbw_loop_cpu_spawn_abi, nsmbw_loop_cpu_fpscr, nsmbw_loop_cpu_gqr and nsmbw_loop_cpu_abi_layout.
Added tick exports: nsmbw_services_tick_claim, nsmbw_services_tick_store32, nsmbw_services_tick_status and nsmbw_services_tick_status_reset.
Typed signatures verified: CPU spawn_abi takes 9 i32 returns i32, fpscr i32->i32, gqr (i32,i32)->i32, abi_layout i32->i32; tick claim ()->i32, store (i32,i32)->i32, status ()->i32 and status_reset ()->void.
No named mock/test device handler export in normal joined clock Wasm. REA JSON is stored OUTSIDE GIT at C:\NSMBcowork\notes\Toad-P8-REA-clock-current-abi.json.

## Actual dynamic gates

Combined Node + real Chromium runtime-services/frame-host/interop suite 152/152 PASS zero skips, including 128 frame reset stress, three guest contexts, quota/MMIO, aliases, clock ownership and the four CPU ABI exports.
Independently rebuilt normal and test-only frame-host Wasm via build.ps1 -WithTestFixture; W03 Node+Chrome suite 76/76 PASS.
Peach existing independent timer/ESM owner 4/4, phase6 double-facade 2/2 and phase7 double-facade 2/2 PASS against the new Wasm.

Limits: static WABT interface analysis alone does not prove runtime dataflow or device safety. This is synthetic low32 virtual time in checked guest RAM, NOT original Wii OSGetTime r3/r4, GX/IOS/VI, or game boot. W01 original DOL SHA/profile remains blocked. Keep commercial game originals and translated code OUT of Git and the public web.