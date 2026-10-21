# Luigi — Phase10 independent Time64 ledger regression and final review

Branch: agent/luigi/phase10-time64-native-regression
Initial test commit: 89312ef; source-only synthetic test, public origin/main baseline 2c2ef26.
Review updated 21 October 2026 after exact independent Emscripten + real Chromium + REA verification.
No Nintendo original DOL/REL, game source bytes, private symbols, credentials or traces.

## Real red-first proof on marcos

Run tests/phase10/time64-native-direct-monotonic.test.mjs on ONE independently selected
candidate with NSMB_PHASE10_TIME64_ROOT pointing to its CLEAN exact source checkout.
Wasm is real compiled public C++/Emscripten, not JavaScript-simulated guest output.

- OLD local Mario integration b12af83: our 4 tests were 2 PASS / 2 deliberate RED,
  unmodified Peach early Time64 suite e4e087a was 0 PASS / 3 deliberate RED.
  After JS legacy publish(0x100000002), direct native _time64_publish with
  hi=0,lo=1 was incorrectly accepted, guest lowword rewound 2 to 1 even
  using 0xC0008000 cached/uncached alias.
- Toad initial fix 1fe9b04 introduced one canonical native u64 ledger and
  rebuilt byte-identical Emscripten Wasm SHA256
  6925C38C4CE7532BA890173FD5372071290AA4D852E02E31B996086F771790F1.
  Our 4 and Peach early 3 external tests became 7/7 GREEN. Author service
  68/68, full W03 host 111/111 and phase4 integration16/16 real Node/Chrome
  initially passed. REA6.5 static 66 normal/77 clock typed exports unchanged.
  BUT an additional UNMODIFIED historical Peach Phase7
  clock-native-claim.test.mjs was 2/3: malformed native claim magic on
  0xFFFFFFFC returned status12 rather than historical typed status7.
  Luigi therefore recorded a SUPERSEDING formal W07 CHANGES REQUESTED
  for FULL INTEGRATION of 1fe9b04. It is NOT the final approved SHA.
- Toad revised fix ddcd3dad6d0a4332bdf2ff4c1e9160609238b514: explicit invalid
  address check before checking unpaired highword. Malformed claim magic
  returns status7; valid unpaired lowword returns status12.
  Fresh Luigi detached checkout at this EXACT SHA produced a bit-identical
  source Emscripten Wasm SHA256:
  698D9AEC000498F67869C1AEB8443EDD3F7E3ED948F996BF8554C324FDD86A3C.
  Distinct 22/22 selected adversarial test invocations GREEN (our4,
  Peach current cross-api3, Peach current direct-lowword3, Peach historic
  Phase7 claim3, Toad new phase10 ledger9), all with 0 skips.
  Full runtime-services 69/69 real Node+Chromium 128 RAF cycles;
  full W03 frame-host/phase3 111/111 real Node+Chromium serial;
  phase4 real joined integration 16/16; zero skipped in all.
  Some adversarial tests overlap with runtime author tests; counts
  are per suite, not necessarily unique test identities.
- Exact REA6.5 WABT reference normal Wasm SHA256
  32d4313e0ab8c27a6146d132492bd2f773fdb7c817534d2d4fb54e5fc6d185a1,
  candidate ddcd3da SHA256 above, evidence:
  ev_701db4ee19dcb9670605f50090db48657244f94f4ad6c421ba97dbae0d1ea24f.
  Static validation valid/complete; 66 normal -> 77 clock exports with
  exactly eleven expected tick/time64 additions; zero lost or changed typed
  signatures, same one imported env.emscripten_resize_heap. REA confirms
  static ABI only, not temporal semantics. JSON evidence is local only
  under C:\NSMBcowork\notes.

## Exact contract and remaining gates

Both LEGACY host publication and direct native CpuContext64 now use one
native u64 monotonic ledger. Legacy host controls pair a HOST-ONLY high32 stage
at 0xFFFFFFF8 with a checked low32 W04 RAM commit. Native direct calls cannot
rewind it; rejected requests leave guest bytes/page count, CpuContext
r3/r4, callbacks and ledger unchanged. Original external typed status7 for
invalid guest/control addresses is restored; legitimate unpaired lowword
is typed status12. Reset does not surrender the clock owner.

Formal Luigi W07 review APPROVED exact ddcd3da SYNTHETIC ONLY. This is a
single-threaded trusted-host 64-bit sampled-time diagnostic with three
CpuContext sidecars, NOT the original Wii 60,750,000Hz timebase,
OSGetTime/OSGetSystemTime, memory-mapped 64-bit transaction, IOS/GX/VI,
interrupts, Wii original function or actual game boot.

Mario alone may integrate main after independent Peach exact-SHA approval.
The local main b12af83 remains unpushed. W01 original DOL version/SHA
mismatch, REL recursive Unicode JSON duplicates, metadata quality,
malformed schema and probe audit continue HARD STOP; no original Nintendo
game function should be attempted before proven private source provenance.
