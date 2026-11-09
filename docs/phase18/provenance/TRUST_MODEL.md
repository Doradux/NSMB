# Phase18 Luigi — independent observer threat model

No real C# producer attestation exists in this phase. The public C# patch
is an opt-in **SELF-REPORTED JSONL** writer. The synthetic witness is
a **different Python process** and verifies byte replay, but has no
cryptographically independent C# process identity or owner-approved original
source. Every path ends in STOP, never an authentic release.

## Actors, authority and evidence

| Actor | Supplied/observed bytes | Control | What can honestly be concluded |
|---|---|---|---|
| Owner (future) | original DOL/profile/identity | private, NOT accessed | still SHA mismatch, STOP |
| Public upstream C# pin | translator Program.cs and Core | public gitlink 20f0158..., READ-ONLY | known source line locations, not compiled in this phase |
| C# trace patch (proposal) | source/MAP/config file SHA, queue/commit/output JSONL | same process as producer | observations only if later compiled and opted in; self-reported and forgeable |
| Phase18 toy emitter subprocess | wholly invented PPC source, MAP/config, event JSONL, output files | untrusted process under tests | events actually emitted as toy work proceeds, not post-hoc metadata |
| Phase18 toy observer subprocess parent | predeclared input+toy producer-code SHA pins and nonce, receives stdout and reads artifacts | separate OS process but same untrusted user | checks exact captured bytes against deterministic independent toy replay |
| Future trusted observer | source revision, verified emitter binary, owner challenge, event/output digest, signature key | NOT IMPLEMENTED | could attest event ORIGIN only if independent trust root really exists |
| W03/Time64 and Wii HLE | CPU ticket, GPR3/4, time ledger, device imports, native guest semantics | other agents, separate gates | NOT proven by source provenance |

A pinned SHA (even from an external JSON file) proves equality to bytes,
not why the source was produced. If the attacker controls the source
fixture, pin JSON and toy producer code, that attacker can recompute every
SHA and replay a different consistent toy run. The observer deliberately
returns producerAttested=false and authenticReleaseEligible=false.

A random run nonce supplied by the observer process can bind a particular
toy session, but is not itself signed or independently trusted. The C#
opt-in patch uses Guid-generated runId in the PRODUCER process; it is
explicitly *not* the independent challenge required for real attestation.

## Deterministic event ordering and failure rules

- Producer child emits source_identity, root, MAP inventory, then actual
  queue attempts / serial translation commits / discoveries / skips; only
  after all attempts finish does it write output bytes, emit final output
  events, durable metadata and run_completed.
- Observer consumes each line while the producer process runs, rejecting
  duplicate or Unicode-ambiguous JSON keys, non-finite numbers, oversized
  lines/logs, noncontiguous counters, wrong nonce, forged event content,
  premature output, omitted file and truncated stream.
- Observer independently calls Phase17 invented PPC source redecoder,
  verifies complete ordered event sequence, metadata and each output body.
  The process must exit 3 (TOY STOP), end with run_completed and have no
  missing/orphan artifact. Code pin mismatch rejects BEFORE launching child.
- A child that fails after some valid prefix cannot be accepted: absence
  of final run_completed is fail-closed, even if early events are consistent.
- No Phase18 code modifies scripts/audit_profile.py or weakens W01.
  There is no success exit 0 authorizing a Wii function.

## Real source-witness prerequisites (NOT IMPLEMENTED)

1. Owner-only approved original executable revision/region and locally
   trusted SHA, verified by independent reader. Current mismatch is STOP.
2. Public C# translator binary built from EXACT public source pin and
   recorded build flags, verified independently from a trusted root.
3. Observer controlled run challenge from a separate protected process
   BEFORE input decode and full causal event observation from trusted
   instrumented process, not sidecar reconstruction or self-signed file.
4. Complete canonical accounts of MAP seeds, walk discovery, parallel batch
   attempts (serial commit), failed speculative descendants, boundary
   retries/SSA supersession and final output file SHA by physical re-read.
5. Independent signature or OS-protected authenticated channel and a
   verifier with known pinned public trust key. No demo keys masquerading
   as productive secrets, no HMAC key stored alongside report.
6. A separate W01 structural check, native CPU/ABI W03 quiescence and
   W03/Time64 single-owner transaction, W07 device-policy, full import/
   export review, newly built Wasm and browser test.
7. Explicit owner authorization for a SINGLE original leaf only after all
   above. Not a permission to boot gameplay or emulate the entire console.

Until then, **UNATTESTED / NO-GO**. Synthetic tests and public source
patch compatibility are useful engineering evidence, not game execution.

## Bounded observer against untrusted-stream denial-of-service

Initial independent peer pre-review by Toad on 9 Nov identified that
Python iteration over child.stdout implicitly uses an UNBOUNDED readline
and a child stderr PIPE left unread could deadlock a producer. Both were
fixed before the final Luigi SHA. Our observer now uses selectors,
bounded os.read chunks and a monotonic wall deadline; it limits the
entire stream, each newline-delimited event, and total event count
BEFORE parsing. stderr is discarded (no deadlock). A child that stalls,
emits an oversized line, sends ambiguous Unicode JSON keys, floods
stderr or aborts before completion cannot become authenticated.
Negative-only flags in the invented producer exist solely to reproduce
these failures, and do NOT enable real Nintendo execution.

See STRESS_AND_BENCHMARK.md for measured counts and the exact command.
