#!/usr/bin/env python3
"""Peach Phase11 REA 6.5/WABT typed ABI oracle, public synthetic Wasm only.

REA evidence files are generated independently with:
 REA_WABT_BIN_DIRECTORY=<absolute WABT 1.0.42 bin> \
    rea inspect-wasm-artifact <binary> --format json
No copyrighted game binary or private original hash is accepted.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

NORMAL_SHA = "32d4313e0ab8c27a6146d132492bd2f773fdb7c817534d2d4fb54e5fc6d185a1"
TIME64_SHA = "698d9aec000498f67869c1aeb8443edd3f7e3ed948f996bf8554c324fdd86a3c"
ADDITIONS = {
    "nsmbw_services_tick_is_claimed",
    "nsmbw_services_tick_claim",
    "nsmbw_services_tick_store32",
    "nsmbw_services_tick_status",
    "nsmbw_services_tick_status_reset",
    "nsmbw_services_time64_publish",
    "nsmbw_services_time64_status",
    "nsmbw_services_time64_gpr",
    "nsmbw_services_time64_context_bytes",
    "nsmbw_services_time64_context_alignment",
    "nsmbw_services_time64_reset",
}
SHARED_IMPORT = ("import", "env", "emscripten_resize_heap")


def evidence(path: Path, wasm_path: Path, expected_sha: str):
    report = json.loads(path.read_text(encoding="utf-8-sig"))
    normalized = report["normalized_result"]
    assert report["provider"]["id"] == "wabt-artifact", "Not real WABT REA evidence"
    assert normalized["validation"] == "valid", "Wasm binary failed WABT validation"
    assert normalized["interface"]["state"] == "complete", "Incomplete REA interface"
    digest = hashlib.sha256(wasm_path.read_bytes()).hexdigest()
    assert digest == expected_sha, "Checked candidate hash drifted from reviewed SHA"
    assert report["subject"]["digest"]["sha256"].lower() == digest
    assert normalized["artifact"]["sha256"].lower() == digest
    assert str(report["evidence_id"]).startswith("ev_"), "Missing retained REA evidence"
    entries = normalized["interface"]["entries"]
    mapping = {}
    for entry in entries:
        direction = entry["direction"]
        assert direction in {"import", "export"}
        key = (direction, entry["module"] if direction == "import" else None, entry["name"])
        assert key not in mapping, "Duplicated REA typed interface key"
        mapping[key] = (entry["kind"], entry["signature"])
    assert len(mapping) == len(entries)
    return mapping, report["evidence_id"]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--candidate-root", type=Path, required=True)
    p.add_argument("--normal-rea-json", type=Path, required=True)
    p.add_argument("--time64-rea-json", type=Path, required=True)
    a = p.parse_args()
    normal, base_id = evidence(
        a.normal_rea_json, a.candidate_root / "web-runtime/frame-host/dist/frame_loop.wasm", NORMAL_SHA
    )
    time64, tick_id = evidence(
        a.time64_rea_json, a.candidate_root / "web-runtime/runtime-services/dist/joined_tick.wasm", TIME64_SHA
    )
    assert len(normal) == 67, "Expected 66 exports and one import"
    assert len(time64) == 78, "Expected 77 exports and one import"
    assert SHARED_IMPORT in normal and time64
    assert normal[SHARED_IMPORT] == time64[SHARED_IMPORT]
    for key, kind_sig in normal.items():
        assert key in time64, f"Production export/import disappeared: {key!r}"
        assert time64[key] == kind_sig, f"Existing ABI typed signature changed: {key!r}"
    added = set(time64).difference(normal)
    assert added == {("export", None, name) for name in ADDITIONS}, added
    assert all(time64[key][0] == "func" for key in added)
    assert not any(
        "test_policy" in key[2] or "atomic_pair" in key[2] or "translated_store" in key[2]
        for key in time64 if key[0] == "export"
    ), "Test-only export leaked into compiled normal Time64"
    print("REA typed PASS: normal 66 exports + 1 import; time64 77 exports + 1 import")
    print("All 66 preserved exports and shared import match exact kind + parameter/result signature")
    print("Exact 11 tick/time64 additions; no mock fixture exports")
    print(f"Hashes: baseline={NORMAL_SHA} candidate={TIME64_SHA}")
    print(f"Evidence: normal={base_id} time64={tick_id}")


if __name__ == "__main__":
    main()
