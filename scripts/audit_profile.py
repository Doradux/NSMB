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

HASH = re.compile(r"^\s*sha256:\s*([a-fA-F0-9]{64})\s*$", re.M)
ENTRY = re.compile(r"entry_points:\s*\n\s*-\s*(0x[0-9a-fA-F]+)")
REGION = re.compile(r"^\s*game_id:\s*(\S+)\s*$", re.M)


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
        sections.append(dict(start=addr, end=addr + size, executable=i < 7))
    if not sections:
        raise ValueError("DOL has no sections")
    for i, a in enumerate(sections):
        for b in sections[i + 1:]:
            if a["start"] < b["end"] and b["start"] < a["end"]:
                raise ValueError("DOL virtual address ranges overlap")
    return dict(entry=entry, bss=bss, bss_size=bss_size, sections=sections)


def profile_info(text):
    digest, entry, region = HASH.search(text), ENTRY.search(text), REGION.search(text)
    if not digest or not entry:
        raise ValueError("Missing DOL SHA-256 or entry point in profile")
    return dict(expected_sha256=digest[1].lower(), entry=int(entry[1], 16),
                game_id=region[1] if region else None)


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
    if map_text is not None:
        report["function_map"] = classify(read_map(map_text), dol, rel)
        invalid |= bool(report["function_map"]["counts"]["unmapped"])
    if metadata_text is not None:
        meta = json.loads(metadata_text)
        entries = meta.get("functions")
        if not isinstance(entries, list):
            raise ValueError("Translation metadata missing functions list")
        addrs = [int(f["entryPoint"], 0) if isinstance(f["entryPoint"], str)
                 else int(f["entryPoint"]) for f in entries]
        summary = classify(addrs, dol, rel)
        summary.update(total=len(addrs), unique=len(set(addrs)), quality=meta.get("quality", {}))
        report["translation"] = summary
        invalid |= bool(summary["counts"]["unmapped"]) or summary["total"] != summary["unique"]
        invalid |= any(summary["quality"].get(k, 0) != 0 for k in
                       ("unsupportedInstructionCount", "invalidSsaFunctionCount"))
    report["strict_compatible"] = match and not invalid
    report["warning"] = "Address coverage is NOT proof of valid runtime hooks, ABI, boot or gameplay."
    return report, (3 if invalid else 2 if not match else 0)


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
