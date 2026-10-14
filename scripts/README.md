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
