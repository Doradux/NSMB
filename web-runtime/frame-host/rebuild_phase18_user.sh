#!/bin/sh
# PHASE18 PUBLIC-SOURCE ONLY, opt-in new Wasm artifact. No sudo, no downloads,
# no private Nintendo code, no binary replacement inside tracked repository.
# Exit 78 is a BLOCKED-ENV/PEER gate, never a fake compilation success.
set -eu
host=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repo=$(CDPATH= cd -- "$host/../.." && pwd -P)
usage(){
  echo "Usage: sh rebuild_phase18_user.sh --probe | --build ABSOLUTE_EMPTY_OUTDIR" >&2
  exit 64
}
if [ "${1-}" = "--probe" ] && [ "$#" -eq 1 ]; then
  for header in time64_pure_candidate.hpp time64_pure_clock.hpp; do
    if [ ! -f "$repo/web-runtime/runtime-services/$header" ]; then
      echo "BLOCKED-PEER-API: Toad pure header $header not yet integrated by Mario" >&2
      exit 78
    fi
  done
  exec sh "$host/rebuild_phase17_user.sh" --probe
fi
[ "$#" -eq 2 ] && [ "$1" = "--build" ] || usage
# Validate ORIGINAL argument prior to realpath so relative paths cannot be
# silently normalized into permitted absolute destinations.
case "$2" in
  /*) ;;
  *) echo "DENY: --build output must be absolute as supplied" >&2; exit 64 ;;
esac
if ! command -v realpath >/dev/null 2>&1; then
  echo "BLOCKED-ENV: realpath unavailable" >&2
  exit 78
fi
lexical=$(realpath -m -s -- "$2")
output=$(realpath -m -- "$2")
for candidate in "$lexical" "$output"; do
  case "$candidate/" in
    "$repo/"*) echo "DENY: output inside checked-out Git source" >&2; exit 64 ;;
  esac
done
for header in time64_pure_candidate.hpp time64_pure_clock.hpp; do
  if [ ! -f "$repo/web-runtime/runtime-services/$header" ]; then
    echo "BLOCKED-PEER-API: $header absent; do not pretend Phase18 bridge was linked" >&2
    exit 78
  fi
done
if ! command -v em++ >/dev/null 2>&1; then
  echo "BLOCKED-ENV: no authorized em++ in PATH (no install attempted)" >&2
  exit 78
fi
if ! command -v node >/dev/null 2>&1; then
  echo "BLOCKED-ENV: Node not available for SHA+ABI product audit" >&2
  exit 78
fi
if [ -n "$(git -C "$repo" status --porcelain=v1)" ]; then
  echo "BLOCKED-SOURCE: commit/review all source before compiling" >&2
  exit 65
fi
# The checked existing Phase17 builder prevents symlink/repo writes,
# rejects nonempty output directories and only compiles public sources.
sh "$host/rebuild_phase17_user.sh" --build "$2"
# This gate MUST inspect the exact files that the compiler just wrote,
# binding ALL Phase18 headers (including Toad) plus compiled cpp and ABI.
node "$host/verify_phase18_wasm.mjs" --create "$2"
node "$host/verify_phase18_wasm.mjs" --verify "$2"
echo "NEW_PHASE18_SOURCE_WASM_STATIC_NODE_VERIFIED"
echo "IMPORTANT: browser/Phase18 scheduler-event execution still needs separate"
echo "exact-digest real Chromium proof; NOT Nintendo original game/HLE."
