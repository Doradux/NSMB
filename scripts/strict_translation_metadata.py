"""Fail-closed validation of PUBLIC synthetic translation metadata for W01.

Importer contract (Mario's audit_profile.py remains independently owned):

    from strict_translation_metadata import parse_translation_metadata
    parsed = parse_translation_metadata(metadata_text, map_addresses=map_addresses)
    addrs = parsed["addresses"]                 # list[int] of verified uint32
    quality = parsed["quality"]                 # required, exact nonnegative ints

``parse_translation_metadata(text)`` can run without MAP to validate
the translation file alone; it MUST NOT be taken as proof of complete static
coverage. Passing a MAP requires exact address equality and no duplicates.
All violations raise ValueError (including malformed JSON, deep recursion,
duplicate unicode-unescaped keys, bad scalar types or incomplete coverage).
Positive nonzero quality counters are PARSEABLE, not release-eligible:
the audit MUST check quality_clean(parsed) before declaring compatibility.

No original Wii bytes, symbols, hashes or file reads in this module.
"""
from __future__ import annotations

import json
import math
import re
import unicodedata
from collections.abc import Iterable
from typing import Any

UINT32_MAX = 0xFFFFFFFF
QUALITY_COUNTERS = ("unsupportedInstructionCount", "invalidSsaFunctionCount")
_CANONICAL_HEX32 = re.compile(r"0[xX][0-9a-fA-F]{1,8}\Z")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """json unescapes Unicode keys BEFORE passing them to this hook."""
    result: dict[str, Any] = {}
    canonical_keys: set[str] = set()
    for key, value in pairs:
        # JSON escape decoding happens first. NFKC also prevents fullwidth
        # Unicode aliases from silently shadowing later consumers' keys.
        normalized = unicodedata.normalize("NFKC", key)
        if normalized in canonical_keys:
            raise ValueError("Duplicate or ambiguous Unicode JSON object key")
        canonical_keys.add(normalized)
        result[key] = value
    return result


def _reject_constant(value: str) -> None:
    """Python accepts JSON NaN/Infinity by default, contrary to RFC 8259."""
    raise ValueError("Nonfinite JSON constant is not valid translation evidence")


def load_translation_json(text: str) -> dict[str, Any]:
    """Parse JSON with recursive duplicate and nonfinite rejection.

    Invalid UTF-8 surrogates, malformed source, invalid root and recursion
    overflow produce controlled ValueError rather than an uncaught crash.
    """
    if not isinstance(text, str):
        raise ValueError("Translation metadata must be UTF-8 JSON text")
    try:
        data = json.loads(
            text, object_pairs_hook=_unique_object, parse_constant=_reject_constant
        )
    except (RecursionError, UnicodeError) as exc:
        raise ValueError("Invalid translation metadata JSON structure") from exc
    if not isinstance(data, dict):
        raise ValueError("Translation metadata root must be a JSON object")
    # Reject incomplete Unicode scalars anywhere, including extra evidence;
    # duplicate keys have already been detected after JSON escape decoding.
    pending = [data]
    while pending:
        value = pending.pop()
        if isinstance(value, dict):
            pending.extend(value.keys())
            pending.extend(value.values())
        elif isinstance(value, list):
            pending.extend(value)
        elif isinstance(value, str) and any(0xD800 <= ord(ch) <= 0xDFFF for ch in value):
            raise ValueError("Unpaired Unicode surrogate in metadata JSON")
        elif type(value) is float and not math.isfinite(value):
            raise ValueError("Nonfinite JSON numeric value is not valid metadata")
    return data


def strict_uint32(
    value: object, *, field: str = "entryPoint", allow_canonical_hex: bool = False
) -> int:
    """Require uint32, optionally accepting ONLY an unambiguous 0xHEX string.

    Parsed translator metadata may legitimately encode the entry point in
    canonical hexadecimal form. MAP addresses supplied by the audit must
    already be parsed uint32 integers, never arbitrary textual input.
    """
    if type(value) is int:
        result = value
    elif (allow_canonical_hex and isinstance(value, str) and
          _CANONICAL_HEX32.fullmatch(value)):
        result = int(value, 16)
    else:
        raise ValueError(f"{field} must be an integer uint32 or canonical 0xHEX")
    if not 0 <= result <= UINT32_MAX:
        raise ValueError(f"{field} must be an integer uint32 or canonical 0xHEX")
    return result


def _quality_counts(raw: object) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("Translation quality must be a JSON object")
    for field in QUALITY_COUNTERS:
        value = raw.get(field)
        if type(value) is not int or value < 0:
            raise ValueError(f"{field} must be a present nonnegative integer")
    # Preserve extra upstream translator evidence fields, but never trust them
    # as replacements for either required counter.
    return dict(raw)


def require_complete_map_coverage(
    map_addresses: Iterable[int], translated_addresses: Iterable[int]
) -> None:
    """Fail closed on missing/extra/duplicate MAP addresses.

    Neither a MAP-only address nor a translation-only address can count as
    verified evidence of a complete one-to-one static function mapping.
    Importers must still separately check DOL/REL executable ownership,
    source identity SHA, translator quality and runtime ABI.
    """
    if isinstance(map_addresses, (str, bytes)):
        raise ValueError("Function MAP must contain uint32 addresses, not text")
    try:
        mapped = list(map_addresses)
        translated = list(translated_addresses)
    except (TypeError, OverflowError) as exc:
        raise ValueError("Function MAP or translated addresses are not iterable") from exc
    if not mapped or not translated:
        raise ValueError("Function MAP and metadata must be nonempty")
    for value in mapped:
        strict_uint32(value, field="MAP address")
    for value in translated:
        strict_uint32(value, field="translated address")
    if len(mapped) != len(set(mapped)):
        raise ValueError("Repeated MAP function address")
    if len(translated) != len(set(translated)):
        raise ValueError("Repeated translation function address")
    if set(mapped) != set(translated):
        # No private source function addresses should appear in diagnostics.
        raise ValueError("Incomplete MAP/translation one-to-one coverage")


def parse_translation_metadata(
    text: str, *, map_addresses: Iterable[int] | None = None
) -> dict[str, Any]:
    """Return verified metadata with normalized numeric entryPoint values.

    API:
        {
          "functions": [...],  # copy of every entry; validated numeric uint32
          "addresses": [int, ...],  # ordered, unique
          "quality": {...},  # both required nonnegative int counters
          "quality_verified": True,
          "total": int,
          "unique": int,
          "map_coverage_verified": bool,
        }

    Raises ValueError for ALL invalid JSON/schema/addresses/duplicate entries
    and map mismatch. Nonzero, structurally valid quality values remain
    in the report so the auditor can issue a meaningful status 3 instead of
    incorrectly claiming that the counters are zero.
    """
    obj = load_translation_json(text)
    raw_functions = obj.get("functions")
    if not isinstance(raw_functions, list) or not raw_functions:
        raise ValueError("Translation functions must be a nonempty JSON list")
    quality = _quality_counts(obj.get("quality"))
    entries: list[dict[str, Any]] = []
    addresses: list[int] = []
    seen: set[int] = set()
    for index, item in enumerate(raw_functions):
        if not isinstance(item, dict):
            raise ValueError("Translation function must be a JSON object")
        if "entryPoint" not in item:
            raise ValueError("Translation function missing entryPoint")
        address = strict_uint32(item["entryPoint"], field="entryPoint",
                                allow_canonical_hex=True)
        if address in seen:
            raise ValueError("Repeated translation function address")
        seen.add(address)
        addresses.append(address)
        normalized_function = dict(item)
        normalized_function["entryPoint"] = address
        entries.append(normalized_function)
    if map_addresses is not None:
        require_complete_map_coverage(map_addresses, addresses)
    return {
        "functions": entries,
        "addresses": addresses,
        "quality": quality,
        "quality_verified": True,
        "total": len(addresses),
        "unique": len(seen),
        "map_coverage_verified": map_addresses is not None,
    }


def quality_clean(metadata: dict[str, Any]) -> bool:
    """Separate syntactic quality evidence from eligibility (both ZERO)."""
    try:
        quality = metadata["quality"]
        return all(
            type(quality[key]) is int and quality[key] == 0
            for key in QUALITY_COUNTERS
        )
    except (KeyError, TypeError):
        return False
