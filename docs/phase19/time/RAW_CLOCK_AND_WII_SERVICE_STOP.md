# P19 — raw synthetic Time64 services vs genuine Wii runtime

## Proven right now, from public/invented sources only
Source-pinned public Wiicompiled timebase reference models raw
OS__GetTime with 243 MHz / 4 = 60,750,000 tick/s. The P18 pure
converter performs floor(unsignedNanoseconds * 243 / 4000) using
quotient/remainder, not double, with GPR3 high32 and GPR4 low32.
P19 invented ServiceId 0x53560001 computes a raw ClockCandidate from
host-supplied unsigned nanoseconds; 0x53560002 uses raw unsigned ticks.
Neither knows authoritative Nintendo Wii calendar/RTC, IRQ/VI ticks,
IOS system-time adjustment or original guest context.

Native W03 owns exactly ONE mutable synthetic clockTicks and
clockRevision, and private guest generation/owner, epoch, serial,
expected PC and Token/Ticket. Toad's public Request and GateView are
public-data echoes; they carry no cryptographic secret, native capability,
buffer pointer, mutable ledger or executive permission. A producer can
fake all fields including Origin::nativeScheduler and remainingBudget.
Pure candidateOnly means calculation possible, NOT that W03 authorized
it, not that quota was consumed, and not that any guest executed code.

## Native service call stages and no-tear point
1. Privileged native W03 scheduler validates its actual guest context
   and current PC matches ONLY synthetic 0x80010000.
2. It creates an invented Request/GateView and calls the pure dispatcher.
   Unsupported ID/version or violated policy yields zero Candidate and
   zero CPU/RAM/clock/trace effects.
3. W03 revalidates REAL owner, epoch, private serial, quota, phase, PC,
   revision and monotonicity (never from JS flags), grants a ONE-USE
   native Ticket. Copied tickets cannot be used again. A quota counter
   must be authoritative in W03, NOT a fabricated GateView value.
4. armCanonicalClock authenticates its OWN Ticket and stage-writes no
   registers. W03 native tick rechecks identity/epoch/revision and
   performs one callback-free r3/r4 + canonical ticks/revision commit.
   The older isolated P17 Time64 TransactionService ledger stays
   standalone test-only and MUST NOT be committed sequentially.
5. Resulting W03 native or exact fresh-Wasm readback is evidence of a
   fictional guest service ONLY, not Nintendo HLE.

## Cases requiring future evidence before any Wii HLE
- Actual owner DOL identity, instruction/code scope, authenticated
  compiler provenance and correct original function entrypoint.
- C# Translator.Cli real build + independently sourced event witness,
  not self-reported source/hash/nonce or hand-written toy producer.
- Real PPC guest CPU GPR/FPR/GQR state transitions, interrupts,
  privileged vs user execution, IOS time synchronization, system RTC,
  timer IRQ/VI scheduling, device/MMIO callbacks, native host clock
  monotonic source and cross-device state consistency.
- Memory authorization for game-code pointers, no ambient JS exports,
  non-reentrant W03 timebase publication, rollback before commit,
  authorized guest update under lifecycle recycle/resume/suspend.
- Genuine emcc build of same source/manifest, typed import/export
  listing, Node dynamic guest operation and real Chromium dynamic guest
  operation on exact SAME fresh artifact SHA. Browser module
  initialization alone (Mario's first successful bootstrap) is
  explicitly insufficient to demonstrate service execution.
- Benchmarks may measure host synthetic arithmetic throughput only;
  cannot establish Wii timebase fidelity, game framerate or playability.

## Current tests and honest limitations
P19 Toad native dispatcher 107 labeled checks; 4096 seeded mixed
three-guest operations included as ONE assertion; full actual
W03/W04/W07 native linked 31 labeled checks including 512 real
scheduler clock commits and 1024 resets/recycle loops. Separate Node
wrapper detects 11 deliberately compromised source variants (RED) while
clean base GREEN. Real 8-pthread PURE 32768 calls + serial oracle,
not concurrent W03. ASan/UBSan of native source verify memory issues
within executed branches. Source-only fresh 2526-byte TEST-ONLY WASM
with zero imports has functional evidence in Node and Chromium but has
NO W03 issuer/ledger inside it; do not call it a W03 functional Wasm.

Peach's own separate fresh-Wasm synthetic W03 fixture is expected
to prove guest execution on his source SHA. It must still be separately
reviewed for no new raw C++ authority/CPU pointer exports and any
serviceId allowlist/quotas W03 wishes to implement. The user did not
authorize originals, sudo, downloading dependencies or unverified
Wii service logic; no HLE implementation is claimed.
