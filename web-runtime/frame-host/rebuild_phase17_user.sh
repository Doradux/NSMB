#!/bin/sh
# Phase17 reproducible, *opt-in* PUBLIC synthetic W03 rebuild.
# No sudo, downloads, changed Git files, ROM/DOL/REL, or original Wii code.
# Usage: sh rebuild_phase17_user.sh --probe
#        sh rebuild_phase17_user.sh --build /absolute/empty/output/directory
set -eu
self_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
runtime=$(CDPATH= cd -- "$self_dir/.." && pwd -P)
repo=$(CDPATH= cd -- "$runtime/.." && pwd -P)

if [ "${1-}" = "--probe" ] && [ "$#" -eq 1 ]; then
  if ! command -v em++ >/dev/null 2>&1; then
    echo "BLOCKED-ENV: em++ is not on PATH; no installation attempted." >&2
    echo "Activate a pinned, user-owned Emscripten SDK and rerun." >&2
    exit 78
  fi
  echo "EMSCRIPTEN_PRESENT: $(command -v em++)"
  em++ --version | head -n 1
  exit 0
fi

if [ "$#" -ne 2 ] || [ "$1" != "--build" ]; then
  echo "Usage: sh rebuild_phase17_user.sh --probe | --build ABSOLUTE_EMPTY_OUTDIR" >&2
  exit 64
fi
# Check the ORIGINAL CLI argument first: realpath -m would otherwise
# convert a relative argument into an absolute path, violating the contract.
# This denial must happen before mkdir, em++, or even normalizing the path.
case "$2" in
  /*) ;;
  *) echo "DENY: output path must be absolute" >&2; exit 64 ;;
esac
# Two containment checks are intentional: the lexical path catches paths
# physically under the checkout that traverse symlinks OUT of it; the physical
# path catches external aliases/symlinks INTO the checkout. Never write to
# either spelling of the Git worktree. -s is GNU realpath --no-symlinks.
if ! command -v realpath >/dev/null 2>&1; then
  echo "BLOCKED-ENV: realpath required to validate destination" >&2
  exit 78
fi
out_lex=$(realpath -m -s -- "$2")
out=$(realpath -m -- "$2")
for destination in "$out_lex" "$out"; do
  case "$destination/" in
    "$repo/"*) echo "DENY: output may not be under NSMB Git worktree" >&2; exit 64 ;;
  esac
done
if ! command -v em++ >/dev/null 2>&1; then
  echo "BLOCKED-ENV: em++ unavailable, no build attempted" >&2
  exit 78
fi
if ! command -v node >/dev/null 2>&1; then
  echo "BLOCKED-ENV: Node needed for byte-level Wasm checks" >&2
  exit 78
fi
if [ -e "$out" ]; then
  if [ ! -d "$out" ] || [ -n "$(ls -A -- "$out")" ]; then
    echo "DENY: output directory exists and is not empty" >&2
    exit 64
  fi
else
  mkdir -p -- "$out"
fi

# Source list matches the exact W03/W04/W07/input single-Wasm build.ps1.
# No test-only device callback/forgery macro, private producer or game bytes.
em++ "$runtime/src/guest_memory.cpp" \
  "$runtime/interop/synthetic_guest.cpp" \
  "$runtime/interop/device_policy.cpp" \
  "$runtime/runtime-services/input_snapshot.cpp" \
  "$self_dir/guest_cpu.cpp" \
  "$self_dir/translator_abi_fixture.cpp" \
  "$self_dir/frame_loop.cpp" \
  -std=c++17 -O2 -Wall -Wextra \
  -sWASM=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node \
  --no-entry -sALLOW_MEMORY_GROWTH=1 -sABORTING_MALLOC=0 \
  -sFILESYSTEM=0 -o "$out/frame_loop.mjs"

test -s "$out/frame_loop.wasm"
node --input-type=module - "$out/frame_loop.wasm" <<'JS'
import {readFileSync} from 'node:fs';
const path = process.argv[2];
const data = readFileSync(path);
if(!WebAssembly.validate(data)) throw Error('Invalid compiled Phase17 Wasm');
const wasm=new WebAssembly.Module(data);
const imports=WebAssembly.Module.imports(wasm);
const exports=WebAssembly.Module.exports(wasm);
if(imports.some(x=>x.module!=='env' || x.name!=='emscripten_resize_heap')) {
  throw Error('Unexpected raw/native Wasm import: '+JSON.stringify(imports));
}
if(exports.some(x=>/OS__GetTime|forgeForNativeTest|Time64PermitIssuer|test_policy/.test(x.name))) {
  throw Error('Test forge or pretend-native HLE export detected');
}
console.log('WASM_STATIC_VALID',data.length,'bytes',
  'imports',imports.length,'exports',exports.length);
JS

{
  echo "Source tree (Git commit; commit may be dirty):"
  git -C "$repo" rev-parse HEAD
  echo "Toolchain:"
  command -v em++
  em++ --version | head -n 1
  echo "Input SHA-256:"
  sha256sum "$runtime/src/guest_memory.cpp" \
    "$runtime/interop/synthetic_guest.cpp" \
    "$runtime/interop/device_policy.cpp" \
    "$runtime/runtime-services/input_snapshot.cpp" \
    "$self_dir/guest_cpu.cpp" \
    "$self_dir/translator_abi_fixture.cpp" \
    "$self_dir/frame_loop.cpp"
  echo "Output SHA-256:"
  sha256sum "$out/frame_loop.mjs" "$out/frame_loop.wasm"
} > "$out/build_manifest.txt"
echo "BUILT_SOURCE_ONLY_SYNTHETIC_WASM in $out"
echo "IMPORTANT: this alone is NOT a browser proof, a typed REA6.5 gate,"
echo "a Nintendo original function or a working Wii HLE."
