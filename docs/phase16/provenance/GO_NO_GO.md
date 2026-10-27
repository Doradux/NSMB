# Original Wii leaf: future GO/NO-GO matrix — NO-GO now

All critical gates must independently pass before owner-private execution
of even ONE original Wii translated leaf. Mario alone may authorize.

| Gate | Current evidence | Status | Requirement |
|---|---|---|---|
| W01 static syntax/MAP | Phase14 R6 and main | SYNTHETIC PASS | Preserve existing strict W01 |
| Recursive graph coherency | Luigi Phase16 sidecar | SYNTHETIC PASS | Toad peer review exact SHA |
| MAP/config/metadata byte integrity | Separate hash anchors + actual fake MAP/config bytes | SYNTHETIC PASS | Trusted upstream producer channel, not copied example anchors |
| Real C# event provenance | No committed source-bound root/discovery/skip log in pinned upstream | STOP | Instrument + independently verify C# emitter |
| Authorized original DOL identity | Known private original SHA/profile mismatch | STOP | Owner-only private identity comparison |
| Real executable sections | Only independently pinned invented source ranges | STOP | Authorized private source verifier |
| Recursive producer coverage | Root, MAP speculative, repair and emitted sets differ | STOP | Signed/trusted causal outcomes complete |
| Trusted W03 CpuContext | Peach Phase16 separate mission | STOP | Safe slot/generation/PC/quiescence |
| OSGetTime genuine HLE | Toad Phase16 separate mission | STOP | Safe ABI/r3-r4 and W03 gate |
| ABI imports/real leaf effects | Only public synthetic fixtures | STOP | Vet ONE owner-private leaf after other P0 |
| Rebuilt translator/Wasm/REA | dotnet missing; Phase15 pinned compiled fixtures only | BLOCKED-ENV | Approved toolchain, real emitter experiment/REA |
| Boot/gameplay | No original verified functions | NOT CLAIMED | Beyond this phase |

CLI returns 3 for a structurally self-consistent but not authenticated
sidecar and 4 for evidence rejection. It NEVER returns 0 for release.
Example anchors created by the fixture generator are intentionally
untrusted and cannot be used to authenticate a producer.

Repro (a unique EMPTY output directory, never containing user assets):
    python3 -B -m scripts.phase16.luigi.cli generate-invented --directory /tmp/w16-luigi-synthetic-example
    python3 -B -m scripts.phase16.luigi.cli check --sidecar /tmp/w16-luigi-synthetic-example/sidecar.json --metadata /tmp/w16-luigi-synthetic-example/metadata.json --map-file /tmp/w16-luigi-synthetic-example/invented.map --config-file /tmp/w16-luigi-synthetic-example/invented.config --external-anchors /tmp/w16-luigi-synthetic-example/example-anchors-NOT-TRUSTED.json

Both commands return exit 3, without asserting any original Wii code.
