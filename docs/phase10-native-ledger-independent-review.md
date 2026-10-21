# Luigi — Phase10 Time64 native/legacy negative oracle

Branch: agent/luigi/phase10-time64-native-regression
Source-only test commit: 89312ef (public main 2c2ef26 baseline).
No Nintendo assets, game DOL/REL, proprietary code or private traces.

## Actual compiled Wasm, 2026-10-21 on marcos

The unmodified Node.js test in tests/phase10/time64-native-direct-monotonic.test.mjs
accepts a compiled Emscripten candidate root via NSMB_PHASE10_TIME64_ROOT.
No mocked clock or Javascript-only guest result is accepted.

1. On local integrated main b12af83 before Toad fix, four cases:
   2 normal positives PASS, 2 critical EXPECTED RED: a JS legacy clock publish
   of 0x100000002 was followed by direct native time64_publish(0,0x80008000,0,1);
   native incorrectly accepted and rewound guest lowword from 2 to 1,
   also by using cached/uncached 0xC0008000 alias. No skipped tests.
2. Independently inspected Peach exact e4e087a negative suite against b12af83:
   0/3 pass, three intentional RED; source tests were unchanged.
3. On Toad NEW clean exact 1fe9b04, C++/Emscripten Wasm rebuilt from authorized
   SDK with SHA256 equal to committed artifact:
   6925C38C4CE7532BA890173FD5372071290AA4D852E02E31B996086F771790F1.
   Both external suites now 7/7 GREEN zero skipped, with RAM, CpuContext
   r3/r4 and MMIO callbacks unchanged after denied native regression.
4. Entire runtime-services author suite: 68/68 Node+real Chromium, zero skips,
   including 128 RAF resets; full W03 frame-host/phase3: 111/111
   Node+real Chromium serial, zero skips; independent phase4 integration
   16/16 including real Chrome. Total 202/202.
5. REA 6.5.0 WABT from independent candidate versus normal main:
   baseline 66 exports, Toad clock 77, exactly 11 expected additions,
   zero lost/changed typed exports, same one Emscripten resize_heap import.
   Candidate evidence ev_b27b274db550f38cc4545a1e88663604657bc4789ca136328d2891b3cfbf8bd4.
   Raw JSON proof stored only under local C:\NSMBcowork\notes.

## Code boundary

The fix shares one C++ 64bit monotonic ledger across legacy host and direct
native CpuContext services. Host-only highword staging must be paired with
checked guest lowword commit. A smaller full64 candidate fails BEFORE RAM or
CpuContext mutation; resets require no active W03 contexts/guest pages.
This is only a single-threaded, trusted-host, copyright-free diagnostic.
It does NOT implement Wii OSGetTime, system epoch, interrupts, IOS/GX,
original PowerPC game code or browser gameplay.

Luigi formally APPROVED Toad SHA 1fe9b04 for this narrow synthetic contract
through coord.js. Peach independent approval is still required by Mario.
Mario is the sole integrator of main. W01 original source SHA and strict
REL/translation metadata evidence validation remain STOP.

To reproduce against one candidate:
  set NSMB_PHASE10_TIME64_ROOT=C:\path\to\exact\candidate
  node --test --test-concurrency=1 tests/phase10/time64-native-direct-monotonic.test.mjs
