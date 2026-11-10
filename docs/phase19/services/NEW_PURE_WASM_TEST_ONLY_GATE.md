# Phase19 Toad — independent actual NEW pure dispatcher WebAssembly

**Different and additive to Mario's previously built 25,904-byte
W03 Emscripten module.** This is an expressly TEST-ONLY pure service
diagnostic, NOT an authorized W03 guest operation or Wii HLE.

## Exact source and compiler
- Git branch: agent/toad/phase19-services-abi from integrated main
  62553f2c73a3bea271f1a7b75519737180c99a74.
- Header synthetic_service_dispatch.hpp source SHA256:
  0cbb4466a6ae77eccad40da3bdc15b12dccc0c4db1cb6148d93dc331cdbec980
- Probe source tests/phase19/toad/dispatcher_wasm_probe.cpp SHA256:
  fedc3439134f64d309a24f69df4858b201f331fffcd9d172d2fd3cd0feb7f436
- Container image ALREADY CACHED on marcos-hpr:
  sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a,
  em++ 6.0.13.
- No sudo, no network, no Docker pull, no --privileged, source volume :ro;
  output ONLY a new external /tmp dir, container --rm, max 2 CPUs/3GB RAM.
- Actual fresh output 2526 bytes, SHA256 EXACT:
  b9bd8b47f405597052700fa66f627ddbc9ce5d88ce219b478843fdb605e6feba
- Actual build log: /home/marcos/NSMBcowork/notes/Toad-P19-PureWasmBuild.log.
  Actual output at time of test:
  /tmp/nsmb-p19-toad-ownwasm-Cl1TWq/toad_p19_probe.wasm,
  TEMPORARY (do not claim persistence).

## Reproduce clean build

From /home/marcos/NSMBcowork/worktrees/toad-Phase19:

  out=$(mktemp -d /tmp/nsmb-p19-toad-ownwasm-XXXXXX)
  docker run --rm --pull never --network none --cpus=2 --memory=3g \
    -v /home/marcos/NSMBcowork/worktrees/toad-Phase19:/work:ro \
    -v "$out":/output:rw -w /work \
    sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a \
    sh -c 'em++ -std=c++17 -O2 -Wall -Wextra -Werror -pedantic \
    -DNSMB_P19_TOAD_TEST_PROBE=1 -I web-runtime/runtime-services \
    -sSTANDALONE_WASM=1 --no-entry \
    -Wl,--export=nsmbw_p19_test_only_status \
    -Wl,--export=nsmbw_p19_test_only_ticks \
    -Wl,--export=nsmbw_p19_test_only_low32 \
    -Wl,--export=nsmbw_p19_test_only_high32 \
    tests/phase19/toad/dispatcher_wasm_probe.cpp \
    -o /output/toad_p19_probe.wasm'
  sha256sum "$out/toad_p19_probe.wasm"

The source wrapper ONLY exists under tests/phase19/toad, with a required
NSMB_P19_TOAD_TEST_PROBE compiler flag and guarded preprocessor #error.
It manufactures an input GateView for the public pure calculation;
the returned status 0 means candidateOnly, NEVER native W03 permission.
It cannot lease/arm a W03 guest or write CPU/clock: no W03 symbol
linked in the helper, no imported host functions.

## Exact artifact functional tests
With NSMB_P19_TOAD_WASM set to the resulting absolute path and
NSMB_P19_TOAD_WASM_SHA256 to reviewed 64-hex digest:

  env -u LD_LIBRARY_PATH -u LD_PRELOAD /usr/bin/node --test \
    tests/phase19/toad/dispatcher_wasm.test.mjs

Node 4/4 named methods PASS with WebAssembly.validate, SHA match, ZERO
module imports, exact allowed diagnostic exports and no raw Ticket/
CpuContext/W03 symbols; 1-second nanos 60750000 ticks, raw 2^32
high32=1 low32=0, JS/W07/MMIO/IRQ, wrong version/unknown ID/no quota
return DENY and zero candidate. Independent BigInt 4096 sample
arithmetic checks in ONE Node test method.
Measured: notes/Toad-P19-WasmProbeNode.log.

Actual Chromium for SAME exact digest:

  NSMB_BROWSER=/home/marcos/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome \
  NSMB_BROWSER_NO_SANDBOX=1 \
  env -u LD_LIBRARY_PATH -u LD_PRELOAD /usr/bin/node \
    tests/phase19/toad/browser_wasm_probe.mjs

Also set exact NSMB_P19_TOAD_WASM/NSMB_P19_TOAD_WASM_SHA256 above.
Uses ephemeral localhost 127.0.0.1 origin and fresh Chrome profile
removed afterward, serving ONLY the test HTML and WASM, path
allowlist 404; Chromium independently fetches and hashes same bytes,
validates/instantiates, invokes 1-second and 2^32, denied origins/
versions/IDs/quota, plus 256 BigInt arithmetic cases.
ACTUAL RESULT RC0:
TOAD_P19_NEW_PURE_WASM_CHROMIUM_FUNCTIONAL_PASS, digest
b9bd8b47f405597052700fa66f627ddbc9ce5d88ce219b478843fdb605e6feba.
No leftover toad19-browser- process found.
Measured: notes/Toad-P19-PureWasmChromium.log.

## STOP
This proves an original C++17 PURE candidate helper compiled to a
NEW, signed-by-hash source-test WASM and actually ran in Node+Chromium.
It does NOT mean original Nintendo OSGetTime, any real Wii code,
C# producer attestation, W03 private Ticket or canonical W03 ledger
has executed in this standalone diagnostic. THAT requires Peach's
separate fresh-Wasm scheduler fixture and SHA-pinned native guest
snapshots. No changes to checked-in dist or main.
