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
from pathlib import Path

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
    return dict(entry=entry, bss=bss, bss_size=bss_size, sections=sections)


def profile_info(text):
    """Read explicit inputs.dol.sha256 and translation.entry_points from YAML.

    Deliberately supports only indentation-based plain mapping/scalar syntax
    needed by the upstream profile. Aliases, tags and complex YAML constructs
    are NOT interpreted; relevant values must be plain unquoted scalars.
    Duplicate relevant paths are rejected instead of choosing a first match.
    """
    stack = []
    seen = {}
    wanted = {("inputs", "dol", "sha256"),
              ("project", "game_id")}
    entry_path = ("translation", "entry_points")
    for number, raw in enumerate(text.splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        if "\t" in raw[:len(raw) - len(raw.lstrip())]:
            raise ValueError(f"Tabs in profile indentation on line {number}")
        body = raw[indent:]
        while stack and stack[-1][0] >= indent:
            stack.pop()
        parents = tuple(name for _, name in stack)
        if body.startswith("- "):
            if parents == entry_path and "entry" not in seen:
                value = body[2:].split(" #", 1)[0].strip()
                if not ENTRY_VALUE.fullmatch(value):
                    raise ValueError("Invalid translation entry point")
                seen["entry"] = int(value, 16)
            continue
        match = KEY_VALUE.fullmatch(body)
        if not match:
            # Reject YAML syntax that could redefine a relevant subtree.
            if parents in (("inputs",), ("inputs", "dol"), entry_path):
                raise ValueError(f"Unsupported profile syntax on line {number}")
            continue
        key, value = match.groups()
        path = parents + (key,)
        value = value.split(" #", 1)[0].strip()
        if path in wanted:
            if path in seen:
                raise ValueError(f"Duplicate profile key: {'.'.join(path)}")
            if not value or value.startswith(("!", "&", "*", "{", "[")):
                raise ValueError(f"Invalid profile scalar: {'.'.join(path)}")
            seen[path] = value
        if not value:
            stack.append((indent, key))
    digest = seen.get(("inputs", "dol", "sha256"))
    entry = seen.get("entry")
    if not digest or entry is None:
        raise ValueError("Missing explicit DOL SHA-256 or entry point in profile")
    if not SHA256.fullmatch(digest):
        raise ValueError("Invalid inputs.dol.sha256 value")
    return dict(expected_sha256=digest.lower(), entry=entry,
                game_id=seen.get(("project", "game_id")))


def rel_sections(text):
    layout = json.loads(text)
    if not isinstance(layout.get("modules"), list):
        raise ValueError("Expected modules list in REL layout")
    sections = []
    for module in layout["modules"]:
        for item in module["sections"].values():
            if item.get("exec") is not True:
                continue
            start, size = int(item["addr"], 0), int(item["size"], 0)
            if size <= 0 or start < 0 or start + size > 0x100000000:
                raise ValueError("Invalid executable REL section")
            sections.append(dict(start=start, end=start + size, executable=True))
    return sections


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
    output = []
    for n, line in enumerate(text.splitlines(), 1):
        s = line.strip()
        if s and not s.startswith("#"):
            try:
                output.append(int(s.split()[0], 16))
            except ValueError as error:
                raise ValueError(f"Invalid function-map line {n}") from error
    return output


def analyze(dol_data, profile, map_text=None, rel_text=None, metadata_text=None):
    info = dol_sections(dol_data)
    expected = profile_info(profile)
    dol = info["sections"]
    rel = rel_sections(rel_text) if rel_text else []
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
    # Full static coverage requires BOTH function MAP and translator metadata.
    # A correct DOL checksum by itself is an identity check, never a full audit.
    evidence_complete = map_text is not None and metadata_text is not None
    report["coverage_evidence_complete"] = evidence_complete
    map_addresses = None
    if map_text is not None:
        map_addresses = read_map(map_text)
        report["function_map"] = classify(map_addresses, dol, rel)
        invalid |= bool(report["function_map"]["counts"]["unmapped"])
        if not map_addresses or len(map_addresses) != len(set(map_addresses)):
            invalid = True
    if metadata_text is not None:
        meta = json.loads(metadata_text)
        if not isinstance(meta, dict):
            raise ValueError("Translation metadata must be an object")
        entries = meta.get("functions")
        if not isinstance(entries, list):
            raise ValueError("Translation metadata missing functions list")
        addrs = [int(f["entryPoint"], 0) if isinstance(f["entryPoint"], str)
                 else int(f["entryPoint"]) for f in entries]
        summary = classify(addrs, dol, rel)
        quality = meta.get("quality")
        counters = ("unsupportedInstructionCount", "invalidSsaFunctionCount")
        quality_verified = isinstance(quality, dict) and all(
            type(quality.get(key)) is int and quality[key] >= 0 for key in counters
        )
        # Missing counters are not a zero defect count.
        summary.update(total=len(addrs), unique=len(set(addrs)),
                       quality=quality, quality_verified=quality_verified)
        report["translation"] = summary
        invalid |= not quality_verified
        if quality_verified:
            invalid |= any(quality[k] != 0 for k in counters)
        invalid |= bool(summary["counts"]["unmapped"]) or summary["total"] != summary["unique"]
        invalid |= not addrs
        if map_addresses is not None:
            # Map entries must have an actual translated function at the exact
            # entry address, not merely lie inside a broad executable section.
            missing = sorted(set(map_addresses) - set(addrs))
            report["function_map"]["missing_translation_count"] = len(missing)
            report["function_map"]["missing_translation_sample"] = [
                f"0x{addr:08X}" for addr in missing[:10]
            ]
            invalid |= bool(missing)
    report["strict_compatible"] = match and evidence_complete and not invalid
    report["warning"] = ("Full static coverage is NOT proof of valid runtime "
                         "hooks, ABI, boot or gameplay.")
    return report, (3 if invalid or (evidence_complete is False and match)
                    else 2 if not match else 0)


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
