# Read-only Wii recompilation profile auditor

`audit_profile.py` checks that a locally extracted Wii DOL has the exact hash
specified by a translator profile, verifies its executable entry point, and
classifies function-map and translated function entry addresses into DOL text,
linked REL executable sections or unmapped regions.

It **does not** decrypt, modify, copy, translate, export or bundle a game image.
Reports contain only checksums, ranges and aggregate counts, not copyrighted
game instructions or assets. Keep reports in a private folder if they include
details of your personal dump.

## Typical invocation (Windows)

From the repository root:

```powershell
python scripts/audit_profile.py `
  --dol 'C:\path\to\private\game\main.dol' `
  --profile upstream-nsmbw/projects/nsmbw/recomp.yml `
  --map upstream-nsmbw/projects/nsmbw/MAP.txt `
  --rel-layout 'C:\path\to\private\game\nsmbw_rel_layout.json' `
  --translation-metadata 'C:\path\to\private\experiments\translation.json'
```

The full static coverage gate is **fail-closed**: both a source function MAP and
translation metadata must be supplied; every MAP function entry point must be
present among translated entries; duplicates/unmapped addresses fail; and
`unsupportedInstructionCount` and `invalidSsaFunctionCount` must both be
present as nonnegative integer counters with value zero. The translator may
report extra generated entries not listed in the source MAP, but missing MAP
entries are incompatible. A correct DOL SHA-256 alone proves binary identity
only, not translation completeness. The source's original pinned SHA-256 is
never replaced during a normal strict check.

The default is **strict**. Exit status 2 means the source hash differs from the
pinned profile (never release with that unchecked); 3 means address coverage,
entry points or translator quality checks failed; 4 means malformed or
unreadable inputs. Status 0 requires all strict checks to pass.

For a controlled, non-production investigation only, add `--probe`; this
allows a hash mismatch to produce exit status 0 **while preserving
`strict_compatible: false` in the report**. This does not validate any
runtime hooks or permit labeling a browser build playable.

Run the synthetic, copyright-free tests:

```powershell
python -m unittest discover -s tests -p test_audit_profile.py -v
```

## Interpretation and limits

The translator output's `size` field describes generated output, not necessarily
the size of source PowerPC instructions. This auditor checks function **entry
addresses only**, NOT instruction-level equivalence, the runtime's hard-coded
hooks, ABI, memory initialization, graphics, storage, or boot. Valid executable
address ranges are a necessary but **insufficient** compatibility signal.

The team must separately reconcile the expected original DOL hash and verify
the runtime at the same version before compiling a genuine web game.

## Native override registration coverage

The additional read-only hook audit compares public WiiCompiled `PPC_NATIVE_OVERRIDE`
registration addresses with a locally held translation metadata file. It masks
C/C++ comments and literals; resolves only literal `#if 0` / `#if 1` branches,
and treats unknown build flags as conditional rather than assuming a particular
platform configuration.

```powershell
python scripts/audit_hooks.py `
  --runtime-root upstream-nsmbw/runtime `
  --translation-metadata 'C:\private\experiments\translation.json' `
  --output 'C:\private\experiments\hook-coverage-report.json'
python -m unittest discover -s tests -p 'test_audit_*.py' -v
```

Exit 0 means at least one eligible active or conditional registration exists,
with every such entry present among translated function start addresses. Exit 2
means coverage is incomplete or there are no hooks to validate. Exit 3 is an
input or parsing error. Disabled/commented registrations are reported but do
not trigger a compatibility failure.

**Scope:** This does not validate hook function signatures, runtime ABI,
register state, side effects, device emulation, compiled guest code, platform
rendering or game boot. It never emits game executable contents. Reports
containing private translation addresses should remain outside public Git.
