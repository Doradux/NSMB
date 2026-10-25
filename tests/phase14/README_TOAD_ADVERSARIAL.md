# Phase 14 — Toad deterministic W01 structural adversarial suite

**ONLY synthetic invented DOL/REL/MAP/metadata/profile material.**
Original Nintendo executable and profile identity remain separate STOPs.
Not a real game boot, no translation source, no sudo.

## Exact source and repeatability

- Source audited: Mario integrated `audit_profile.py` initial exact commit
  `faa7a219fb5bde27b0d96f430cc5620f4bf2bb9b`.
- Test file `tests/phase14/test_w01_structural_adversarial.py` explicitly
  loads a selected exact `audit_profile.py` via `NSMB_W01_AUDIT_ROOT`.
  It calls the ACTUAL analyze(), dol_sections() and subprocess CLI.
  No fake audit implementation or patching.
- 25 unittest methods, deterministic PRNG seed `14025`, 128 separate
  random REL interval pairs with an independent half-open overlap oracle,
  plus typed/Unicode/JSON/YAML/MAP/metadata/CLI boundary subtests.
- Negative structural input must yield a controlled `ValueError` / CLI4.
  Semantic quality nonzero gives report code3; incomplete coverage code3,
  wrong SHA with otherwise complete evidence gives code2 or --probe
  process exit0 while strict_compatible remains false.
- Clean positive controls include DOL/REL text+data adjacency, DOL-only
  full coverage with REL absent, finite unknown fields, correct MAP
  provenance, and BSS half-open uint32 EOF exactly `2**32`.

Run on own source checkout:

```sh
env -u LD_LIBRARY_PATH -u LD_PRELOAD PYTHONDONTWRITEBYTECODE=1 \
  NSMB_W01_AUDIT_ROOT=/home/marcos/NSMBcowork/worktrees/Mario-P14-W01 \
  python3 -B -m unittest discover -s tests/phase14 \
  -p test_w01_structural_adversarial.py -v
```

## RED-first genuine defects / unproven semantics

Initial integrated `faa7a21`: **25 methods: 20 PASS, 5 FAIL, 0 ERROR,
0 SKIP**; all 128 deterministic REL pair subcases passed. Three failures
are BSS allocation collisions (with DOL loaded code, DOL loaded data and
REL section); one is a 32-bit BSS overflow; one is a YAML multi-document
stream silently ignored by `profile_info`.

1. `dol_sections()` reads `bss`/`bss_size` but never checks
   `bss+bss_size <= 0x100000000`. A synthetic BSS at `0xFFFFFFF0`
   with size `0x20` is silently accepted. This is arithmetic overflow
   outside the guest address space and should be rejected.
2. `dol_sections()` accepts BSS overlapping code and data loaded
   sections. Since the auditor claims unambiguous static provenance,
   the collision must either be rejected or subject to an independently
   reviewed, loader-source-backed exception. No such loader lifetime
   evidence is presently available. No synthetic `allowOverlay` waiver.
3. `analyze()` supplies DOL file-loaded sections to
   `parse_rel_sections` but NOT DOL BSS. A synthetic nonempty DOL
   BSS `[0x80500004,0x80500014)` overlapping loaded REL text
   produces strict_compatible=true. Classifying a function in this
   ambiguous address as REL-owned without authenticated load timing
   is unsafe for a strict static compatibility claim.
4. `profile_info` quietly ignores trailing YAML `---`
   and a second document with unknown keys, although compliant YAML
   stream consumers may return two documents or error. The audit
   should reject ambiguity instead of interpreting a different source
   than another consumer. Rejecting a *second* document need not reject
   ordinary comments, whitespace or a single initial YAML document
   marker if the upstream profile uses one.

**Only Mario edits `scripts/audit_profile.py`.** Do not rewrite history
or weaken positives to manufacture green. If Wii DOL loader semantics
permit BSS collisions with valid section reuse, document exact upstream
implementation and require explicit independent peer review before
changing the expected result. BSS overflow does not require that
interpretation and should be a straightforward hard error.

## Subsequent gate

Rerun unchanged against Mario's fresh clean exact implementation SHA
and also run author110, Phase7, Phase9/10/12/13 and all new Phase14 QA
(0 skips). A red-only baseline is not a substitute for W01 approval.
