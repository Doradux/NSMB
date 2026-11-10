# P20 Toad — real fresh Emscripten V2 PURE probe (NOT guest W03)

Source tree: OWN branch agent/toad/phase20-service-contracts, based
on integrated main c97e1e5e73515c18a1d0060c13c61d8e088f685f.
Source tested with g++ native, and cached Docker Emscripten6.0.13,
no network/pull/new SDK/sudo/original Nintendo code.
Runtime-service V2 header sha256:
9d277b1b72ff006665a2349b6635e7783346655aefa3dcf31cd6acb11012cad8.
Test-only probe source sha256:
0bcbdac83abc5e542a9dc69eff073735bab35277ee4c4bb0eb627258dff8b499.

Only under tests/phase20/toad, explicitly guarded with
NSMB_TOAD_P20_TEST_ONLY_PROBE=1 (#error otherwise), C wrappers expose
status/ticks/high32/low32/proposed_cost as **mathematical diagnostics**.
No import from JS/host and no W03 Ticket/CPU/grant/clock ledger. An
attacker can construct all request fields: status candidateOnly does
not grant anything, even when origin=nativeScheduler and claimedBudget
is 999999. Cost1 is only an estimate, not a quota decrement.

Cached image sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a,
with --pull never --network none --rm --cpus=2 --memory=3g,
source /work:ro, external new /output:rw, em++6.0.13 -O2 -Werror.
Reproduction:

  out=$(mktemp -d /tmp/nsmb-toad20-ownwasm-XXXXXX)
  docker run --rm --pull never --network none --cpus=2 --memory=3g \
    -v /home/marcos/NSMBcowork/worktrees/toad-Phase20:/work:ro \
    -v "$out":/output:rw -w /work \
    sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a \
    sh -c 'em++ -std=c++17 -O2 -Wall -Wextra -Werror -pedantic \
     -DNSMB_TOAD_P20_TEST_ONLY_PROBE=1 \
     -I web-runtime/runtime-services -sSTANDALONE_WASM=1 --no-entry \
     -Wl,--export=nsmbw_p20_test_only_status \
     -Wl,--export=nsmbw_p20_test_only_ticks \
     -Wl,--export=nsmbw_p20_test_only_high32 \
     -Wl,--export=nsmbw_p20_test_only_low32 \
     -Wl,--export=nsmbw_p20_test_only_proposed_cost \
     tests/phase20/toad/service_v2_wasm_probe.cpp \
     -o /output/toad_p20_probe.wasm'

ACTUAL new output: 2473 bytes, sha256
0812e471fb3dd957a57406ac9b4c63ff5628438530368e6ab2533b82c39dc26e.
Physical temporary file observed:
/tmp/nsmb-toad20-ownwasm-r2-hRYXQU/toad_p20_probe.wasm.
This is disposable /tmp state, not published dist nor a joint W03 build.

With NSMB_TOAD_P20_WASM set to absolute artifact path,
NSMB_TOAD_P20_WASM_SHA256 set to 64hex digest above, run:

  env -u LD_LIBRARY_PATH -u LD_PRELOAD /usr/bin/node --test \
    tests/phase20/toad/service_v2_wasm.test.mjs

Result 4/4 Node methods PASS 0 SKIP/F/E, verifies exact sha,
WebAssembly.validate, ZERO imports, explicit exports only, actual
60,750,000Hz, 2^32 GPR halves and cost1, denies unknown ID/old
ABI/JS/W07/MMIO/IRQ/zero claimed quota. 4096 deterministic independent
BigInt quotient/remainder inputs inside ONE Node test method.
Logs notes/Toad-P20-V2WasmBuildR2.log,
notes/Toad-P20-V2WasmNodeR2.log.

Same exact artifact REAL Chromium (not simulator) with localhost
127.0.0.1 ephemeral profile server, WebCrypto SHA256 from fetched
binary, WebAssembly.validate/instantiate/function calls +256 separate
BigInt oracle values; zero forbidden imports; browser closed/profile
and server removed:

  NSMB_BROWSER=/home/marcos/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome \
  NSMB_BROWSER_NO_SANDBOX=1 \
  env -u LD_LIBRARY_PATH -u LD_PRELOAD /usr/bin/node \
    tests/phase20/toad/browser_v2_probe.mjs

ACTUAL RC0 marker TOAD_P20_NEW_V2_PURE_WASM_CHROMIUM_FUNCTIONAL_PASS,
same 0812e471... digest; notes/Toad-P20-V2WasmChromiumR2.log.
NO Nintendo code, native W03 ledger or guest IPC in this probe.
Only Peach's freshly compiled later joint W03 native service fixture
can show actual W03 private quota/ServiceId enforcement.

Native ABI layout under both GCC and em++6.0.13:
RequestV2 size40 align8 value offset32, ViewV2 size48 align8
claimedBudget offset32, CandidateV2 size56 align8 rawTicks offset32
hi32 offset40 low32 offset44 proposedCost offset48,
ResultV2 size64 align8. Explicit byte shifts test big-endian guest
scalar order; never raw struct memcpy to Nintendo or Wii PPC memory.
Cross-TU GCC+Wasm frontend compile PASS with strict
-Wconversion/-Wsign-conversion. Native C++ 8 threads x4096 PURE
calls verified against independent serial numeric oracle; this does
not test real W03 scheduler concurrency.

Single diagnostic -O2 host run of 2,000,000 pure V2 math calls:
elapsed_host_ns=16080732 checksum=76963717532
(notes/Toad-P20-V2Benchmark.log). Not guaranteed timing or gameplay.

## Test-driven V2 denial payload fix (2026-11-10)
First V2 review showed CandidateV2::service initialized to the allowed
nanos ID even in denied() results. A new source-native assertion
required service=0 and produced a REAL RED failure after a wrong ABI
request: "FAIL all denied response fields are zero". Fixed the default
CandidateV2.service to static_cast<ServiceId>(0u), leaving RequestV2
unchanged and all allowed service ID constants unchanged. Recompiled
native 108/108 and 18/18 Node including 12 mutation RED controls.
The source and output hashes above correspond to the corrected bytes,
NOT the superseded first-pass test artifact (2590B, sha0b492bce...);
no false claims about the older artifact. Recompiled offline Docker
fresh corrected Wasm to 2473B sha0812e471...; Node 4/4 and actual
Chromium same SHA 256 numerical oracle checks PASS.

## Independent Git object rebuild + physical Wasm tamper RED controls
After fixing the denied service-ID payload, the exact V2 source and
test wrapper were snapshotted from own committed Git SHA
923cfcdc9c4e8797e675ad9d2d79fe7ad3332e02 via git archive
to a fresh external /tmp source tree. Recompiled in the SAME cached
Docker image, source bind READ-ONLY, output writable only in /tmp,
no internet/pulls/sudo/privileged. The resulting actual Wasm file
matched 0812e471fb3dd957a57406ac9b4c63ff5628438530368e6ab2533b82c39dc26e
BIT-FOR-BIT with the first corrected fresh module, independently
from an immutable Git object. Evidence:
notes/Toad-P20-GitPinnedRebuild.log and original proof above.
Final source commit after appending tests has IDENTICAL header/probe
Git blob bytes; a new rebuild must pin any newer final Git SHA as
well when used for integration.

Additional tests/phase20/toad/artifact_integrity.test.mjs:
two real standalone negative controls take the VALID, exact-SHA
physical Wasm, copy it to /tmp and flip its last byte. This cannot
pass the four Node SHA-pinned functional methods: their child Node
test runner must exit NONZERO with four individual SHA failures
(no SKIP). The same corrupted Wasm fed to the actual Chromium
verifier must fail before starting Chrome, so browser startup itself
is not a substitute for artifact identity.
The inner Node process must NOT inherit the parent test runner's
NODE_TEST_CONTEXT environment variable: inheriting it silently
prevented nested Node test execution in the first version of this
test harness, a TEST-HARNESS bug corrected by explicitly stripping
that key before spawning child. After correction both independent
adversarial checks PASS, 0 FAIL/ERROR/SKIP. Evidence:
notes/Toad-P20-ArtifactIntegrityNode.log.

This verifies SHA binding only and never grants W03 service permission,
quota, native Ticket, original Nintendo Wii HLE or real guest source.
