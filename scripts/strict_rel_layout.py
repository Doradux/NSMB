"""Fail-closed REL layout parser for the W01 synthetic source-evidence gate.

Public API:
  parse_rel_sections(rel_json: str, *, dol_sections: Iterable[Mapping] | None = None)
      -> list[{"start": int, "end": int, "executable": True}]

The output intentionally matches audit_profile.rel_sections(). In a STRICT
audit Mario MUST supply dol_sections=info["sections"] to reject REL/DOL
overlap. A parser-only call without DOL evidence does NOT prove DOL ownership.
No caller-supplied JSON overlay hint permits overlapping ranges: accepting an
actual Wii REL lifetime overlay requires independently authenticated
relocation/lifetime provenance plus a separately reviewed algorithm.

Only invented / public synthetic JSON is needed. No original Nintendo data.
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Iterable, Mapping
from typing import Any

ADDRESS_SPACE_END = 1 << 32
_HEX = re.compile(r"0[xX][0-9a-fA-F]+\Z")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Reject duplicate JSON keys, including escapes and Unicode aliases.

    JSON unescaping is done before this hook. NFKC also rejects ambiguous
    Unicode compatibility aliases instead of letting another consumer
    reinterpret an apparently distinct key. Preserve the ORIGINAL key after
    validating; do not silently coalesce or rewrite evidence.
    """
    result: dict[str, Any] = {}
    canonical: set[str] = set()
    for key, value in pairs:
        folded = unicodedata.normalize("NFKC", key)
        if folded in canonical:
            raise ValueError(f"Duplicate/ambiguous REL JSON key: {key!r}")
        canonical.add(folded)
        result[key] = value
    return result


def _invalid_constant(value: str) -> None:
    raise ValueError(f"Non-finite REL JSON number is prohibited: {value}")


def _uint(value: Any, field: str) -> int:
    """Require an actual int (not bool) or an explicit unsigned 0xHEX string."""
    if type(value) is int:
        number = value
    elif isinstance(value, str) and _HEX.fullmatch(value):
        number = int(value, 16)
    else:
        raise ValueError(f"{field} requires uint32 int or explicit 0xHEX")
    if not 0 <= number <= 0xFFFFFFFF:
        raise ValueError(f"{field} exceeds uint32 range")
    return number


def _interval(start: Any, size: Any, field: str) -> tuple[int, int]:
    begin = _uint(start, f"{field}.addr")
    length = _uint(size, f"{field}.size")
    if length == 0:
        raise ValueError(f"{field}.size must be positive")
    end = begin + length
    # End is half-open; exactly 2**32 covers last valid uint32 byte.
    if end > ADDRESS_SPACE_END:
        raise ValueError(f"{field} exceeds uint32 address space")
    return begin, end


def _crosses(left: Mapping[str, Any], right: Mapping[str, Any]) -> bool:
    return left["start"] < right["end"] and right["start"] < left["end"]


def _validated_dol(dol_sections: Iterable[Mapping[str, Any]]) -> list[dict[str, int]]:
    if isinstance(dol_sections, (str, bytes, Mapping)) or not isinstance(dol_sections, Iterable):
        raise ValueError("DOL sections must be an iterable of section objects")
    result = []
    for index, item in enumerate(dol_sections):
        if not isinstance(item, Mapping):
            raise ValueError(f"DOL section {index} must be an object")
        start = _uint(item.get("start"), f"DOL section {index}.start")
        # DOL end is EXCLUSIVE and can equal 2**32, unlike an address.
        end = item.get("end")
        if type(end) is not int or not start < end <= ADDRESS_SPACE_END:
            raise ValueError(f"DOL section {index} has invalid half-open interval")
        if type(item.get("executable")) is not bool:
            raise ValueError(f"DOL section {index}.executable must be bool")
        result.append({"start": start, "end": end})
    return result


def _reject_intersections(intervals: list[dict[str, Any]], label: str) -> None:
    """Adjacent [start,end) regions are valid; any overlap is ambiguous."""
    ordered = sorted(intervals, key=lambda x: (x["start"], x["end"]))
    for earlier, later in zip(ordered, ordered[1:]):
        if _crosses(earlier, later):
            raise ValueError(f"Overlapping {label} address ownership")


def parse_rel_sections(
    text: str, *, dol_sections: Iterable[Mapping[str, Any]] | None = None
) -> list[dict[str, int | bool]]:
    """Parse strict REL JSON and return the legacy executable interval shape.

    Do not silently consider REL ownership proven when dol_sections is absent:
    only Mario's full analyze() can provide DOL evidence and make the final
    strict_compatible verdict. For loaded REL-only fragments, no DOL compare
    can be made; always fail any REL-to-REL overlapping virtual address.
    """
    if not isinstance(text, str):
        raise ValueError("REL layout must be JSON text")
    try:
        layout = json.loads(
            text, object_pairs_hook=_unique_object,
            parse_constant=_invalid_constant,
        )
    except json.JSONDecodeError as exc:
        raise ValueError("Malformed REL layout JSON") from exc
    if not isinstance(layout, dict):
        raise ValueError("REL layout root must be an object")
    modules = layout.get("modules")
    if not isinstance(modules, list):
        raise ValueError("REL layout modules must be an array")

    all_intervals: list[dict[str, Any]] = []
    executable: list[dict[str, int | bool]] = []
    for mindex, module in enumerate(modules):
        if not isinstance(module, dict):
            raise ValueError(f"REL module {mindex} must be an object")
        sections = module.get("sections")
        if not isinstance(sections, dict):
            raise ValueError(f"REL module {mindex}.sections must be an object")
        for key, item in sections.items():
            label = f"REL module {mindex}.sections[{key!r}]"
            if not isinstance(item, dict):
                raise ValueError(f"{label} must be an object")
            if type(item.get("exec")) is not bool:
                raise ValueError(f"{label}.exec must be bool")
            if "addr" not in item or "size" not in item:
                raise ValueError(f"{label} missing addr/size")
            begin, end = _interval(item["addr"], item["size"], label)
            all_intervals.append({"start": begin, "end": end})
            if item["exec"]:
                executable.append({"start": begin, "end": end, "executable": True})

    _reject_intersections(all_intervals, "REL/REL")
    if dol_sections is not None:
        dol_intervals = _validated_dol(dol_sections)
        for rel in all_intervals:
            if any(_crosses(rel, dol) for dol in dol_intervals):
                raise ValueError("Overlapping REL/DOL address ownership")
    return executable
