#!/usr/bin/env python3
"""Read-only audit of native PPC overrides versus translated function entries.

This checks **address registration coverage only**. It cannot verify the Wii
runtime ABI, correctness of hooks, execution, or a bootable browser game.

C++ preprocessing is deliberately conservative: only literal #if 0/#if 1 and
their #else branches are resolved. Other conditions are classified as
conditional instead of silently assumed active. Source lines are never
included in JSON reports.
"""
from __future__ import annotations

import argparse
import bisect
import json
import re
from pathlib import Path

SOURCE_SUFFIXES = frozenset({".cpp", ".h", ".hpp", ".inc"})
HOOK = re.compile(
    r"\bPPC_NATIVE_OVERRIDE(?:_VOID)?\s*\(\s*(?:0x)?(80[0-9a-fA-F]{6})\s*,",
    re.MULTILINE,
)
TOKEN = re.compile(
    r'//[^\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|\x27(?:\\.|[^\x27\\])*\x27',
    re.MULTILINE,
)
DIRECTIVE = re.compile(r"^\s*#\s*(if|ifdef|ifndef|elif|else|endif)\b(.*)$")


def scrub_comments_and_literals(text: str) -> str:
    """Mask comments and strings without changing newline or character offsets."""
    def mask(m: re.Match) -> str:
        return "".join("\n" if c == "\n" else " " for c in m.group())
    return TOKEN.sub(mask, text)


def tristate_condition(kind: str, expression: str) -> bool | None:
    if kind != "if" and kind != "elif":
        return None
    expression = expression.split("//", 1)[0].strip()
    if expression in ("0", "(0)", "false"):
        return False
    if expression in ("1", "(1)", "true"):
        return True
    return None


def merge_conditions(parent: bool | None, own: bool | None) -> bool | None:
    if parent is False or own is False:
        return False
    if parent is None or own is None:
        return None
    return True


def statuses(clean: str) -> list[str]:
    """One conservative preprocessor status per source line."""
    states: list[str] = []
    branches: list[dict] = []
    current: bool | None = True
    for line in clean.splitlines(keepends=True):
        directive = DIRECTIVE.match(line)
        if directive:
            kind, expression = directive.group(1), directive.group(2)
            if kind in ("if", "ifdef", "ifndef"):
                cond = tristate_condition(kind, expression)
                branches.append({"parent": current, "first": cond, "else": False})
                current = merge_conditions(current, cond)
            elif kind in ("else", "elif"):
                if not branches:
                    raise ValueError("Unmatched C preprocessor #else / #elif")
                branch = branches[-1]
                if branch["else"]:
                    raise ValueError("Repeated #else / #elif after #else")
                if kind == "else":
                    branch["else"] = True
                    first = branch["first"]
                    cond = None if first is None else not first
                else:
                    prior = branch["first"]
                    next_condition = tristate_condition(kind, expression)
                    cond = merge_conditions(None if prior is None else not prior,
                                            next_condition)
                    branch["first"] = None if prior is None or next_condition is None else (
                        prior or next_condition)
                current = merge_conditions(branch["parent"], cond)
            elif kind == "endif":
                if not branches:
                    raise ValueError("Unmatched C preprocessor #endif")
                current = branches.pop()["parent"]
        states.append("active" if current is True else
                      "disabled" if current is False else "conditional")
    if branches:
        raise ValueError("Unterminated C preprocessor conditional")
    return states


def scan_file(filename: Path, root: Path) -> list[dict]:
    content = filename.read_text(encoding="utf-8-sig", errors="replace")
    clean = scrub_comments_and_literals(content)
    line_states = statuses(clean)
    newlines = [-1] + [i for i, ch in enumerate(clean) if ch == "\n"]
    found: list[dict] = []
    for m in HOOK.finditer(clean):
        line = bisect.bisect_right(newlines, m.start()) - 1
        if line >= len(line_states):
            raise ValueError("Internal line offset exceeds source line count")
        found.append({
            "address": int(m.group(1), 16),
            "status": line_states[line],
            "file": filename.relative_to(root).as_posix(),
            "line": line + 1,
        })
    return found


def translated_entries(metadata: str) -> set[int]:
    data = json.loads(metadata)
    functions = data.get("functions")
    if not isinstance(functions, list):
        raise ValueError("Expected translated functions list")
    addresses: set[int] = set()
    for f in functions:
        entry = f["entryPoint"]
        address = int(entry, 0) if isinstance(entry, str) else int(entry)
        if not 0 <= address <= 0xFFFFFFFF:
            raise ValueError("Invalid translated function entry address")
        addresses.add(address)
    return addresses


def audit(root: Path, metadata: str) -> dict:
    if not root.is_dir():
        raise ValueError("Runtime source root does not exist")
    translated = translated_entries(metadata)
    hooks: list[dict] = []
    for filename in sorted(root.rglob("*")):
        if filename.is_file() and filename.suffix.lower() in SOURCE_SUFFIXES:
            hooks.extend(scan_file(filename, root))
    summaries = {}
    mismatch = []
    for state in ("active", "conditional", "disabled"):
        group = [f for f in hooks if f["status"] == state]
        invalid = [f for f in group if f["address"] not in translated]
        summaries[state] = {
            "occurrences": len(group),
            "distinct_addresses": len(set(f["address"] for f in group)),
            "matched": len(group) - len(invalid),
            "unmatched": len(invalid),
        }
        if state != "disabled":
            mismatch.extend({
                "file": f["file"], "line": f["line"],
                "address": f"0x{f['address']:08X}", "status": state
            } for f in invalid[:12])
    return {
        "source_files_scanned": sum(
            filename.is_file() and filename.suffix.lower() in SOURCE_SUFFIXES
            for filename in root.rglob("*")),
        "translated_entry_count": len(translated),
        "hooks": summaries,
        "unmatched_sample": mismatch[:20],
        "active_hook_coverage": (
            summaries["active"]["unmatched"] == 0
            and summaries["conditional"]["unmatched"] == 0
            and summaries["active"]["occurrences"] + summaries["conditional"]["occurrences"] > 0
        ),
        "warning": ("Hook entry coverage only; it does not prove correct hook "
                    "semantics, matching ABI, runnable engine or original gameplay."),
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--runtime-root", type=Path, required=True)
    p.add_argument("--translation-metadata", type=Path, required=True)
    p.add_argument("--output", type=Path, help="Keep reports in a private directory")
    a = p.parse_args()
    try:
        result = audit(a.runtime_root, a.translation_metadata.read_text(encoding="utf-8-sig"))
        payload = json.dumps(result, indent=2) + "\n"
        print(payload, end="")
        if a.output:
            a.output.parent.mkdir(parents=True, exist_ok=True)
            a.output.write_text(payload, encoding="utf-8")
        return 0 if result["active_hook_coverage"] else 2
    except (OSError, ValueError, KeyError, TypeError) as error:
        p.exit(3, f"Hook audit failed: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())
