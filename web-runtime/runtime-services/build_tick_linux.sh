#!/usr/bin/env bash
# Rebuild copyright-free W03/W04/W07/W08/Time64 joined Wasm from CURRENT source.
# Linux counterpart of the original Windows build_tick.ps1.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo"
mkdir -p web-runtime/runtime-services/dist
src=(
 web-runtime/src/guest_memory.cpp
 web-runtime/interop/synthetic_guest.cpp
 web-runtime/interop/device_policy.cpp
 web-runtime/runtime-services/input_snapshot.cpp
 web-runtime/runtime-services/tick_snapshot.cpp
 web-runtime/runtime-services/time64_cpu.cpp
 web-runtime/frame-host/guest_cpu.cpp
 web-runtime/frame-host/translator_abi_fixture.cpp
 web-runtime/frame-host/frame_loop.cpp
)
flags=( -std=c++17 -O2 -Wall -Wextra -sWASM=1 -sMODULARIZE=1
 -sEXPORT_ES6=1 '-sENVIRONMENT=web,node' --no-entry
 -sALLOW_MEMORY_GROWTH=1 -sABORTING_MALLOC=0 -sFILESYSTEM=0
 -o web-runtime/runtime-services/dist/joined_tick.mjs )
if command -v em++ >/dev/null 2>&1; then
 em++ "${src[@]}" "${flags[@]}"
elif command -v docker >/dev/null 2>&1; then
 # Reproduce in an isolated container; no Nintendo game data enters the image.
 docker run --rm --user "$(id -u):$(id -g)" \
  -v "$repo:/work" -w /work \
  -e EM_CACHE=/tmp/emscripten-cache \
  "${EMSDK_DOCKER_IMAGE:-emscripten/emsdk@sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a}" em++ "${src[@]}" "${flags[@]}"
else
 echo "Emscripten em++ or Docker required (no stale binary fallback)" >&2
 exit 1
fi
sha256sum web-runtime/runtime-services/dist/joined_tick.wasm
