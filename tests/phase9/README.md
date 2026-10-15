# Peach Phase9 W01 REL JSON fail-closed regression

Independent test-only branch agent/peach/phase9-critical-qa based
on public main2c2ef26. Only synthetic DOL bytes in memory.
No private Nintendo game content, owner executable hashes or REL files.

Run against chosen EXACT W01 candidate SOURCE:
    $env:NSMB_W01_AUDIT_ROOT='C:\NSMBcowork\worktrees\Mario-W01-RedTests'
    $env:PYTHONDONTWRITEBYTECODE='1'
    python -B -m unittest discover -s tests/phase9 -p 'test_w01_rel_duplicates.py' -v

NOTE this target currently contains Mario's STAGED UNCOMMITTED work:
the run is READ ONLY and is NOT approval of any clean source SHA.
Do not edit/reset/commit other sessions' files.

Baseline old Phase7 strict gates on staged W01: 18/18 PASS. W01's
existing authored test suite also passed 26/26 in the same read-only
review. New Phase9 REL layout source-ambiguity tests: 1/5 PASS,
4 FAIL. Positive: valid synthetic REL coverage is accepted; four
negative classes incorrectly report strict_compatible true+code0:
1) duplicate top-level JSON modules property (first invalid, last valid);
2) duplicate module.sections property (first bad, last valid);
3) duplicate nested section.addr property (first invalid, last valid);
4) Unicode-escaped duplicate sections property
   sec\u0074ions shadows the first property after JSON decode.

Root cause: scripts/audit_profile.py rel_sections() uses
json.loads(text) WITHOUT already existing and reusable
object_pairs_hook=reject_duplicate_json_keys from metadata parser.
Identical JSON duplicate-key rules must apply at ALL depths to REL
layout evidence, including canonical Unicode escaped key aliases.
Recommended fix solely in Mario-owned W01 clean branch, followed by
independent rerun of author tests, old Phase7 18 strict gates, this
new Phase9 5 cases, and full fake-DOL identity/probe negatives.
No second arbitrary source can silently overwrite the first.

Do not approve W01 before Mario publishes a NEW exact clean SHA.
Even corrected static pass cannot waive the separately mismatched
upstream original SMNE01 Rev1 DOL pinned SHA, nor establish
gameplay/OS/IOS/GX compatibility. Mario controls main merges.
