# Public pinned C# producer: source-site hooks vs real trust

Reviewed public upstream gitlink:
20f0158dd1d96bd94f821adf80ee361e4fbd414e
in /home/marcos/NSMB/upstream-nsmbw. Do not modify this upstream or
main. Phase18 proposed patch:
docs/phase18/provenance/PublicTranslatorCausalTrace.patch.

Phase19 verified:
    git -C /home/marcos/NSMB/upstream-nsmbw apply --check /full/path/to/Phase18/PublicTranslatorCausalTrace.patch
Exit0. The Phase18 tests also actually apply to a disposable source-only
copy and confirm the patch is reversible with git apply --reverse --check.
This is compatibility with the PINNED TEXT, NOT C# typechecked build.
No local dotnet and no already cached .NET SDK Docker image; no download.

| Actual public source hook | Source fact | What can be honestly observed |
|---|---|---|
| Program.cs RunTranslateRecursive around line431 | root/DOL/map/project loaded | source file physical SHA reported by process only |
| root enqueue around line469 | required walk start and visited | root_declared, one real queued root |
| speculative MAP import around line477 | MAP addresses initially seed queue | map_seed_declared, not all emitted |
| speculative QueueBatch around line550 | visited dedup / queue filter | map_seed_deduplicated and map_seed_queued |
| serial batch intent around line598 | worker attempts may run concurrently | walk_attempted / speculative_attempted in queue order; not completion |
| discovered retry around 633 | rerun of affected front-end | boundary_retry_attempted; not canonical SSA proof |
| serial CommitResult around 720 | committed candidate and target enqueue | translation_committed and target_discovered |
| boundary repair around 830 | final reanalysis updates summaries | boundary_superseded, no final graph SHA |
| bundle writer around 1455 | output waves complete before metadata | bundle_wave_completed |
| metadata published around 1518 | output file hashes compared physically | output_emitted only after durable metadata |
| end of successful run | no earlier error | run_completed; absence means incomplete |

The new Phase19 mini-producer runs only a Python toy interpreter over
invented PPC bytes; it DOES NOT execute the C# source patched above.
Independent subprocess witnesses and reproducible g++/Emscripten code
show how a future C# origin chain could work. They do not establish
the authenticity of this particular public C# build, an authorized
original game input, or the provenance of the real translated function.

A genuine trusted observer must:
- Receive an independently checked owner-authorized original DOL SHA
  and section range witness from an owner-private channel.
- Know the precise source revision and executable producer binary
  BEFORE running; use a separate challenge/nonce and trust root not
  controlled by producer or translator output.
- Observe root, every canonical MAP seed, serial commit, discovered
  child, skip/failure, boundary repair and physical final emitted file.
  Committed and emitted sets can differ during the process but every
  completed output must have an authentic parent chain.
- Compare full source bytes, metadata and output physical bytes at
  one successful completion barrier; invalid or skipped original
  functions remain STOP. No earlier partial trace qualifies.
- Verify the signed challenge and source binding with a trusted public
  verification key anchored OUTSIDE the sidecar. A private key copied
  into an artifact (or HMAC secret shipped with verifier) is NOT trust.
- Keep W01 release gate and Wii ABI/HLE/hardware requirements separate.
  A compiler hash is not an emulation correctness proof.

The existing CLI never returns a Wii release success code. For valid
invented source-to-Wasm chain it returns exit3; corrupted inputs
return exit4. producerAttested and authenticReleaseEligible remain false.
Original Wii DOL owner/profile mismatch is not worked around, and no
original Nintendo content was accessed.
