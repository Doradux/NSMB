#!/usr/bin/env python3
"""Audit a Wii DOL versus an upstream profile, MAP and translation output.

Only reports checksums and address-range counts. Does not copy original
executables or emit translated code. Coverage alone is NOT gameplay support.
"""
import argparse
import hashlib
import json
import re
import struct
import sys
from pathlib import Path

# Direct spec_from_file_location import in peer QA does not add scripts/ to sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from strict_rel_layout import parse_rel_sections
from strict_translation_metadata import parse_translation_metadata, quality_clean

# Parse only the three required scalar paths from a strict indentation-scoped
# subset of YAML. Do not search for an arbitrary sha256 key in another mapping.
KEY_VALUE = re.compile(r"^([A-Za-z_][A-Za-z_0-9-]*):[ \t]*(.*)$")
SHA256 = re.compile(r"^[a-fA-F0-9]{64}$")
ENTRY_VALUE = re.compile(r"^0x[0-9a-fA-F]{1,8}$")


def dol_sections(data):
    if len(data) < 0x100:
        raise ValueError("DOL header truncated")
    offsets = struct.unpack_from(">18I", data, 0)
    addrs = struct.unpack_from(">18I", data, 0x48)
    sizes = struct.unpack_from(">18I", data, 0x90)
    bss, bss_size, entry = struct.unpack_from(">III", data, 0xD8)
    sections = []
    for i, size in enumerate(sizes):
        if not size:
            continue
        offset, addr = offsets[i], addrs[i]
        if offset < 0x100 or offset + size > len(data):
            raise ValueError(f"Section {i} exceeds file or overlaps header")
        if addr + size > 0x100000000:
            raise ValueError("DOL section exceeds 32-bit guest address space")
        sections.append(dict(start=addr, end=addr + size, executable=i < 7,
                             file_start=offset, file_end=offset + size))
    if not sections:
        raise ValueError("DOL has no sections")
    for i, a in enumerate(sections):
        for b in sections[i + 1:]:
            if a["start"] < b["end"] and b["start"] < a["end"]:
                raise ValueError("DOL virtual address ranges overlap")
            if a["file_start"] < b["file_end"] and b["file_start"] < a["file_end"]:
                raise ValueError("DOL file image ranges overlap")

    # The pinned upstream DOL loader uses checked(uint32) for BSS address+size.
    # Therefore even an exclusive end of 2**32 is not representable.
    if bss_size and bss + bss_size > 0xFFFFFFFF:
        raise ValueError("DOL BSS exceeds checked uint32 address range")
    if bss_size:
        bss_end = bss + bss_size
        for section in sections:
            if bss < section["end"] and section["start"] < bss_end:
                raise ValueError("DOL BSS overlaps initialized DOL section")
    return dict(entry=entry, bss=bss, bss_size=bss_size, sections=sections)


def profile_info(text):
    """Extract ONLY approved scalar fields from a fail-closed YAML subset.

    Reject repeated maps or scalar paths, implicit parser-specific aliases,
    unsupported direct child syntax and all but one pinned entry. This does
    not pretend to be a general YAML parser.
    """
    if not isinstance(text, str):
        raise ValueError("Profile must be YAML text")
    stack = []
    seen_paths = set()
    seen = {}
    entry_path = ("translation", "entry_points")
    relevant_roots = {"project", "inputs", "translation"}
    document_marker_seen = False
    document_content_seen = False
    for number, raw in enumerate(text.splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        if "\t" in raw[:len(raw) - len(raw.lstrip())]:
            raise ValueError(f"Tabs in profile indentation on line {number}")
        body = raw[indent:]
        # Support one optional leading YAML start marker, but never consume
        # only the first document of a multi-document evidence stream.
        if re.fullmatch(r"---(?:[ \t]+#.*)?", body):
            if indent or document_marker_seen or document_content_seen:
                raise ValueError(f"Multiple YAML profile documents on line {number}")
            document_marker_seen = True
            continue
        if re.fullmatch(r"\.\.\.(?:[ \t]+#.*)?", body):
            raise ValueError(f"Unsupported YAML profile document end on line {number}")
        document_content_seen = True
        while stack and stack[-1][0] >= indent:
            stack.pop()
        parents = tuple(name for _, name in stack)
        if body.startswith("- "):
            if parents == entry_path:
                value = body[2:].split(" #", 1)[0].strip()
                if "entry" in seen:
                    raise ValueError("Multiple translation entry points require separate evidence")
                if not ENTRY_VALUE.fullmatch(value):
                    raise ValueError("Invalid translation entry point")
                seen["entry"] = int(value, 16)
            elif parents and parents[0] in relevant_roots:
                raise ValueError(f"Unexpected YAML list in profile line {number}")
            continue
        match = KEY_VALUE.fullmatch(body)
        if not match:
            if parents and parents[0] in relevant_roots:
                raise ValueError(f"Unsupported profile syntax on line {number}")
            continue
        key, value = match.groups()
        path = parents + (key,)
        value = value.split(" #", 1)[0].strip()
        if path in seen_paths:
            raise ValueError(f"Duplicate profile key: {'.'.join(path)}")
        seen_paths.add(path)
        if path == ("inputs", "dol", "sha256"):
            if not SHA256.fullmatch(value):
                raise ValueError("Invalid inputs.dol.sha256 value")
            seen["sha256"] = value.lower()
        elif path == ("project", "game_id"):
            if not value or value.startswith(("!", "&", "*", "{", "[")):
                raise ValueError("Invalid profile game_id scalar")
            seen["game_id"] = value
        elif path == entry_path and value:
            raise ValueError("Translation entry points require explicit list entries")
        if not value:
            stack.append((indent, key))
    if "sha256" not in seen or "entry" not in seen:
        raise ValueError("Missing explicit DOL SHA-256 or entry point in profile")
    return dict(expected_sha256=seen["sha256"], entry=seen["entry"],
                game_id=seen.get("game_id"))


def rel_sections(text):
    """Backward-compatible parser entry point for isolated REL tests only.

    This does NOT establish REL vs DOL ownership. analyze() must use
    parse_rel_sections with all actual DOL sections explicitly provided.
    """
    try:
        return parse_rel_sections(text)
    except ValueError as error:
        raise ValueError(f"Invalid executable REL layout: {error}") from error


def executable(address, sections):
    return any(s["executable"] and s["start"] <= address < s["end"] for s in sections)


def classify(addresses, dol, rel):
    counts = dict(dol=0, rel=0, unmapped=0)
    examples = []
    for addr in addresses:
        if not 0 <= addr <= 0xFFFFFFFF:
            raise ValueError("Function address out of uint32 range")
        if executable(addr, dol):
            counts["dol"] += 1
        elif executable(addr, rel):
            counts["rel"] += 1
        else:
            counts["unmapped"] += 1
            if len(examples) < 10:
                examples.append(f"0x{addr:08X}")
    return dict(counts=counts, unmapped_sample=examples)


def read_map(text):
    """Read canonical uint32 function addresses, not Python integer syntax."""
    output = []
    for n, line in enumerate(text.splitlines(), 1):
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        parts = s.split()
        if not parts or not re.fullmatch(r"[0-9A-Fa-f]{1,8}", parts[0]):
            raise ValueError(f"Invalid function-map line {n}")
        output.append(int(parts[0], 16))
    return output


def analyze(dol_data, profile, map_text=None, rel_text=None, metadata_text=None):
    """Strict source-evidence audit; fail closed on ambiguous structure.

    Structural/schema failures are ValueError (CLI exit 4). Well-formed
    but incomplete or low-quality evidence returns code 3. Hash-only
    mismatch on otherwise fully validated evidence returns code 2.
    None means evidence absent; an explicitly supplied empty JSON is invalid.
    """
    info = dol_sections(dol_data)
    expected = profile_info(profile)
    dol = info["sections"]
    # REL ownership must account for initialized DOL sections AND nonempty BSS.
    # Without authenticated loader lifetimes, any static collision is ambiguous.
    dol_ownership = list(dol)
    if info["bss_size"]:
        dol_ownership.append(dict(start=info["bss"],
                                  end=info["bss"] + info["bss_size"],
                                  executable=False))
    rel = (parse_rel_sections(rel_text, dol_sections=dol_ownership)
           if rel_text is not None else [])
    actual_hash = hashlib.sha256(dol_data).hexdigest()
    match = actual_hash == expected["expected_sha256"]
    report = dict(game_id=expected["game_id"], expected_sha256=expected["expected_sha256"],
                  actual_sha256=actual_hash, hash_match=match,
                  entry_point=f"0x{info['entry']:08X}",
                  entry_matches_profile=info["entry"] == expected["entry"],
                  entry_executable=executable(info["entry"], dol),
                  dol_executable_sections=sum(s["executable"] for s in dol),
                  rel_executable_sections=len(rel))
    invalid = not report["entry_matches_profile"] or not report["entry_executable"]
    evidence_complete = map_text is not None and metadata_text is not None
    report["coverage_evidence_complete"] = evidence_complete
    map_addresses = None
    if map_text is not None:
        map_addresses = read_map(map_text)
        report["function_map"] = classify(map_addresses, dol, rel)
        invalid |= bool(report["function_map"]["counts"]["unmapped"])
        invalid |= not map_addresses or len(map_addresses) != len(set(map_addresses))
    if metadata_text is not None:
        parsed = parse_translation_metadata(
            metadata_text, map_addresses=map_addresses
        )
        addrs = parsed["addresses"]
        summary = classify(addrs, dol, rel)
        quality = parsed["quality"]
        summary.update(total=parsed["total"], unique=parsed["unique"],
                       quality=quality, quality_verified=parsed["quality_verified"])
        report["translation"] = summary
        invalid |= not quality_clean(parsed)
        invalid |= bool(summary["counts"]["unmapped"])
        if map_addresses is not None:
            # Helper rejects unmatched, extra or repeated MAP vs translation.
            report["function_map"]["missing_translation_count"] = 0
            report["function_map"]["missing_translation_sample"] = []
    report["strict_compatible"] = bool(match and evidence_complete and not invalid)
    report["warning"] = ("Full static coverage is NOT proof of valid runtime "
                         "hooks, ABI, boot or gameplay.")
    if not evidence_complete or invalid:
        code = 3
    elif not match:
        code = 2
    else:
        code = 0
    return report, code


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--dol", required=True, type=Path)
    cli.add_argument("--profile", required=True, type=Path)
    cli.add_argument("--map", type=Path)
    cli.add_argument("--rel-layout", type=Path)
    cli.add_argument("--translation-metadata", type=Path)
    cli.add_argument("--output", type=Path, help="Private JSON output path")
    cli.add_argument("--probe", action="store_true",
                     help="Explicitly allow hash mismatch for read-only investigation")
    args = cli.parse_args()
    try:
        report, code = analyze(
            args.dol.read_bytes(),
            args.profile.read_text(encoding="utf-8-sig"),
            args.map.read_text(encoding="utf-8-sig") if args.map else None,
            args.rel_layout.read_text(encoding="utf-8-sig") if args.rel_layout else None,
            args.translation_metadata.read_text(encoding="utf-8-sig") if args.translation_metadata else None)
        output = json.dumps(report, indent=2) + "\n"
        print(output, end="")
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(output, encoding="utf-8")
        return 0 if args.probe and code == 2 else code
    except (OSError, ValueError, KeyError, TypeError) as error:
        cli.exit(4, f"Audit failed: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())
