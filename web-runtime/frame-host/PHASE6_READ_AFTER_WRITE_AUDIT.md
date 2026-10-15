# Phase 6 — generated PPC STW → LWZ dependency: fail-closed gate

Owner Luigi. Base `ed6170f`; independent branch `agent/luigi/phase6-read-after-write-audit`. Public copyright-free fixture ONLY. No original Nintendo code, DOL/REL or generated game function.

## Genuine translator output
`translator-fixture/build_readwrite_fixture.mjs` creates a 268-byte synthetic DOL containing three known public PPC instruction words, `0x90640000` (`stw r3,0(r4)`), `0x80A40000` (`lwz r5,0(r4)`) and `0x4E800020` (`blr`). SHA256 is `ba4c995252767e6645d46b705d032fddebfa19a309b546f80f3e796f25a539a0`. The fake DOL, generated C++ and dummy SDA are in ignored `translator-fixture/out/readwrite_fixture`.

The actual locally installed upstream public .NET8 Translator.Cli generated `extern "C" void func_80001000(CpuContext* MKW_RESTRICT ctx)` with EXACT source:
```cpp
MemoryInline::FlatWrite32(r4, r3);
r5 = MemoryInline::FlatRead32(r4);
ctx->gpr[5] = r5;
```

## Why this is an unsupported hazardous pattern
The Phase6 journal `transactional_store.h` currently exports ONLY `MemoryInline::FlatWrite32` in the store fixture. Its first store is deliberately **staged**, not committed to shared checked guest RAM until the generated function returns and W04 atomic pair preflight succeeds.

A naive `FlatRead32` implemented by calling `nsmbw_interop_read32` alone would load the ORIGINAL pre-store guest word, contradicting guest PPC STW-LWZ read-after-write ordering. Incorrect `r5` could subsequently cause control-flow or device side effects. Host CpuContext-copy alone does NOT fix stale RAM visibility.

For this exact 3-op test a correct implementation must first detect a matching physical guest word in the pending journal (W04 cached/uncached aliases must coalesce), return its staged value, fall back only for ordinary checked RAM with W07 immediate status, and preserve strict rollback of BOTH memory bytes/pages and CpuContext on any later failure. It must refuse MMIO, unsupported widths, unaligned and overlapping input layouts. This safety logic is **NOT** implemented by this branch.

`audit_translator_readwrite.ps1` asserts the actual translator emitted source then runs real Emscripten `-fsyntax-only` with `NSMB_PHASE6_TRANSLATED_STORE_FIXTURE` against the existing restrictive memory shim. The expected error is `no member named 'FlatRead32' in namespace 'MemoryInline'`. The audit exits PASS only on that exact error, and fails if the build unexpectedly succeeds or fails for another reason. This is a **negative fail-closed compiler audit**, NOT a runnable translated read/write fixture, and no Chrome success is claimed for these unsupported opcodes.

## Validation commands
```powershell
& web-runtime/frame-host/audit_translator_readwrite.ps1 -Emsdk <authorized SDK> -TranslatorCli <public upstream Translator.Cli.dll>
# Expected: PASS: source-generated STW->LWZ requires missing journal-aware FlatRead32
```

Next step: a separate safely reviewed *positive* transaction implementation with read-your-own-write forwarding, alias and budget rollback tests; do not retrofit the broader native `MemoryInline` ABI, fake game HLE, or native pointer mapping. W01 original owner DOL source-identity gate remains blocked; real Wii game does not boot.
