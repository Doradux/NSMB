# TOAD P20 — independent W03 PRIVATE quota RED/GREEN cross-check

One immutable-source **preliminary** peer SHA check, NOT declaration
that Toad's public V2 runs in Peach's W03 production source.

Source EXACT Peach P20 first immutable Git object:
39ef45cecdf270bcb2b3d704b48f6a733bdaef21.
Peer source exported via git archive to external /tmp, not modified.
Eight W03/W04/W07 native source files byte-for-byte matched against
Git SHA, including phase20_service_fixture.inc and frame_loop.cpp.

Tests authored by Toad (not Peach tests duplicated):
- tests/phase20/toad/service_v2_private_quota_native.cpp:
  24 native C++ labeled checks, incl 512 W03 real PRIVATE quota1->0
  commits+denials and 1024 guest reset/recycle ABA cycles nested.
- tests/phase20/toad/peer_private_quota.test.mjs:
  5/5 Node methods PASS: exact SHA byte source verification,
  native g++ -Werror, actual ASan+UBSan, TWO source-mutant RED.
  Evidence notes/Toad-P20-PeachPrelimPrivateNode.log.
- tests/phase20/toad/service_v2_w03_native.cpp:
  31 W03 native labeled checks with 512 genuine native clock commits
  +1024 reset cycles using private Ticket, NOT new quota route.
  tests/phase20/toad/peer_gate_w03.test.mjs: 5/5 SHA-backed Node
  methods PASS, native mutation and sanitizer included.
  Combined 10/10 Node, 0 fail/error/skip in the above tests.
  Evidence notes/Toad-P20-PeachPrelimCombinedNode.log.

## Security observations
A caller can forge every PUBLIC ViewV2 field, including
claimedBudget UINT32_MAX, OriginClaim.nativeScheduler, epoch,
revision, PC. compute(...) can return status candidateOnly, which
is mathematically valid but NEVER a permission. W03's dedicated
native P20 synthetic fixture creates only a fresh fixed-PC guest
with its OWN private quota=1, not from the caller's ViewV2.
W03 tick writes GPR3/GPR4, ONE canonical clockTicks,
clockRevision and decrements serviceQuota in one no-throw,
no-callback internal update. After quota=0, retry is denied even
with a forged positive quota hint; native CPU, W04 RAM, canonical
clock, revision and private quota remain unchanged. Even a
separately obtained actual C++ Ticket cannot arm the generic
clock path on a service-fixture guest with exhausted quota.
No raw W03 CpuContext* or native Ticket issuer is JS-exported.

## RED test anti-masking correction
A first intentionally broken peer-source variant that removed the
serviceFixture guard did not fail the test: the original Toad
hostile candidate used a forged sourceEpoch=7, so W03's independent
epoch guard rejected it anyway. This was a TEST DESIGN oversight,
not proof that disabling the guard was safe. Corrected OWN negative
test to read the REAL W03 native clock epoch/revision, create an
otherwise valid CanonicalClockPlan and lease an actual native Ticket
after quota exhaustion. Clean W03 rejects it. Mutating the
serviceFixture-vs-phase20Service guard in a temporary clone now
produces an unexpected accepted outcome and makes the suite RED.
Separately suppressing the --serviceQuota operation on the
actual W03 commit also makes the suite RED. Both original clean
source and correct two-layer guard are GREEN. No peer source edited.

## V2 integration limitation
Peach's first P20 W03 native fixture expects PUBLIC P19 ABI
version1, although Toad P20 V2 shares the same two service IDs.
Our attempted ABI version2 native fixture is explicitly DENIED.
Real W03 private quota fixture currently invokes P19 pure dispatcher,
NOT P20 V2. This is a tracked interoperability BLOCKER pending
Peach's separately reviewed owned W03 implementation. Future
new SHA requires a fresh source-pinned independent review.

No Nintendo original ROM/DOL/REL/PPC code, original Wii
OSGetTime/HLE/IOS/GX/VI or authentic C# translator attestation.
