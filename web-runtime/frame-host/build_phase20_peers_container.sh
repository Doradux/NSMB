#!/bin/sh
# PHASE20: compose EXACT 3 public Git commit snapshots into disposable /tmp,
# compile REAL invented W03+Toad V2+Luigi translated C++ via offline cached
# Docker Emscripten. DOES NOT modify any worktree, branch, main or Nintendo asset.
# Usage: sh build_phase20_peers_container.sh --build /tmp/EMPTY_DIR TOAD_SHA40 LUIGI_SHA40
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repo=$(CDPATH= cd -- "$here/../.." && pwd -P)
image='sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a'
deny(){ echo "DENY: $1" >&2;exit 64; }
[ "$#" -eq 4 ] && [ "$1" = '--build' ] || deny 'Usage --build ABSOLUTE_EMPTY_TMP_DIR TOAD_SHA40 LUIGI_SHA40'
case "$2" in /*) ;; *) deny 'output must be original absolute path';; esac
for sha in "$3" "$4"; do
 case "$sha" in
  *[!0123456789abcdef]*|'') deny 'peer sha must be lowercase 40 hex';;
 esac
 [ "${#sha}" -eq 40 ] || deny 'peer sha must be full 40 hex'
 git -C "$repo" cat-file -e "$sha^{commit}" 2>/dev/null ||
  { echo 'BLOCKED-PEER: exact immutable peer commit absent' >&2;exit 78; }
done
command -v realpath >/dev/null 2>&1 ||
 { echo 'BLOCKED-ENV: realpath' >&2;exit 78; }
lexical=$(realpath -m -s -- "$2")
out=$(realpath -m -- "$2")
case "$out/" in /tmp/*) ;; *) deny 'must output into external /tmp';; esac
for dest in "$lexical" "$out"; do
 case "$dest/" in "$repo/"*) deny 'Git source output';; esac
done
[ ! -L "$2" ] && [ -d "$out" ] && [ -z "$(ls -A -- "$out")" ] ||
 deny 'destination must be an existing empty non-symlink directory'
[ -z "$(git -C "$repo" status --porcelain=v1)" ] ||
 { echo 'BLOCKED-SOURCE: own public branch not clean/committed' >&2;exit 65; }
actual=$(docker image inspect --format '{{.Id}}' "$image") ||
 { echo 'BLOCKED-ENV: cached pinned Docker image absent, NO pull' >&2;exit 78; }
[ "$actual" = "$image" ] || { echo 'DENY: image digest mismatch' >&2;exit 65; }
head=$(git -C "$repo" rev-parse HEAD)
stage=$(mktemp -d /tmp/nsmb-peach20-combined-sources-XXXXXX)
trap 'rm -rf -- "$stage"' EXIT HUP INT TERM
# Only these specific public source files are materialized from THREE Git
# commits. NO ROM/DOL/REL or proprietary artifacts, no repo/peer edits.
git -C "$repo" archive "$head" \
 web-runtime/frame-host/frame_loop.cpp \
 web-runtime/frame-host/phase20_service_fixture.inc \
 web-runtime/frame-host/guest_cpu.cpp \
 web-runtime/frame-host/guest_cpu.hpp \
 web-runtime/frame-host/trusted_cpu_service.hpp \
 web-runtime/frame-host/scheduler_clock.hpp \
 web-runtime/frame-host/translator_abi_fixture.cpp \
 web-runtime/src/guest_memory.cpp \
 web-runtime/interop/synthetic_guest.cpp \
 web-runtime/interop/device_policy.cpp \
 web-runtime/interop/device_policy.hpp \
 web-runtime/runtime-services/time64_pure_candidate.hpp \
 web-runtime/runtime-services/time64_pure_clock.hpp \
 web-runtime/runtime-services/synthetic_service_dispatch.hpp \
 web-runtime/runtime-services/input_snapshot.cpp \
 | tar -xf - -C "$stage"
git -C "$repo" archive "$3" \
 web-runtime/runtime-services/synthetic_service_v2.hpp \
 | tar -xf - -C "$stage"
git -C "$repo" archive "$4" \
 scripts/phase20/luigi/toy_leaf_abi.hpp \
 scripts/phase20/luigi/toy_leaf_generated.cpp \
 | tar -xf - -C "$stage"
{
 echo 'P20 THREE-BRANCH INVENTED SOURCE-ONLY SNAPSHOT, NOT SIGNED PRODUCER'
 echo "Peach_HEAD $head"
 echo "Toad_HEAD $3"
 echo "Luigi_HEAD $4"
 echo "Docker_Image_ID $image"
 echo 'Network none / Pull never / Source read-only'
 echo 'Compiler em++6.0.13 cached'
 echo 'Macros -DNSMB_P20_ENABLE_TOY_LEAF -DNSMB_P20_ENABLE_SERVICE_V2'
 echo 'Source_SHA256'
 (cd "$stage" && find web-runtime scripts/phase20/luigi \
   -type f \( -name '*.cpp' -o -name '*.hpp' -o -name '*.inc' \) \
   | sort | xargs sha256sum)
} > "$out/phase20_three_sha_build_manifest.txt"
docker run --rm --pull never --network none --cpus=2 --memory=4g \
 -v "$stage:/work:ro" -v "$out:/output:rw" -w /work "$image" \
 em++ web-runtime/src/guest_memory.cpp \
 web-runtime/interop/synthetic_guest.cpp \
 web-runtime/interop/device_policy.cpp \
 web-runtime/runtime-services/input_snapshot.cpp \
 web-runtime/frame-host/guest_cpu.cpp \
 web-runtime/frame-host/translator_abi_fixture.cpp \
 web-runtime/frame-host/frame_loop.cpp \
 scripts/phase20/luigi/toy_leaf_generated.cpp \
 -DNSMB_P20_ENABLE_TOY_LEAF -DNSMB_P20_ENABLE_SERVICE_V2 \
 -std=c++17 -O2 -Wall -Wextra \
 -sWASM=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node \
 --no-entry -sALLOW_MEMORY_GROWTH=1 -sABORTING_MALLOC=0 \
 -sFILESYSTEM=0 -o /output/frame_loop.mjs
test -s "$out/frame_loop.wasm"
test -s "$out/frame_loop.mjs"
{
 echo 'Output_SHA256'
 sha256sum "$out/frame_loop.wasm" "$out/frame_loop.mjs"
} >> "$out/phase20_three_sha_build_manifest.txt"
node --input-type=module - "$out/frame_loop.wasm" <<'JS'
import {readFileSync} from 'node:fs';
const m=new WebAssembly.Module(readFileSync(process.argv[2]));
const imports=WebAssembly.Module.imports(m);
const exports=WebAssembly.Module.exports(m);
if(imports.length!==1||imports[0].module!=='env'||
   imports[0].name!=='emscripten_resize_heap')
 throw Error('DENY: unexpected W03/Wasm imports');
const names=exports.map(e=>e.name);
for(const name of ['nsmbw_loop_synthetic_toy_leaf_fixture_spawn',
                   'nsmbw_loop_synthetic_service_fixture_spawn',
                   'nsmbw_loop_synthetic_service_quota',
                   'nsmbw_loop_cpu_gpr','nsmbw_loop_tick'])
 if(!names.includes(name))throw Error('DENY: missing real translated W03 '+name);
if(names.some(n=>/leaseSynthetic|armCanonicalClock|CpuContext|forgeForNativeTest|OSGetTime/.test(n)))
 throw Error('DENY: W03 private issuer or pretend Wii HLE exported');
console.log('PHASE20_THREE_SHA_NEW_WASM_TYPED_ABI_PASS',names.length);
JS
echo 'PHASE20_THREE_SHA_OFFLINE_REAL_EMSCRIPTEN_BUILD_PASS'
echo 'NOTE: self-generated SHA manifest is consistency, NOT external trust/signature'
