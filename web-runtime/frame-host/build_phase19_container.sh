#!/bin/sh
# Phase19: opt-in REAL Emscripten in Mario's ALREADY cached image.
# No download, sudo, Docker pull, network, privileged mode or game assets.
# Sources are mounted READ-ONLY; the container's writable ephemeral overlay
# satisfies Emscripten's internal cache and is destroyed by --rm.
# Usage: sh web-runtime/frame-host/build_phase19_container.sh --build /tmp/EXISTING_EMPTY_DIR
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repo=$(CDPATH= cd -- "$here/../.." && pwd -P)
image='sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a'
usage(){ echo "DENY: Usage --build ABSOLUTE_EXISTING_EMPTY_OUTPUT_UNDER_TMP" >&2;exit 64; }
[ "$#" -eq 2 ] && [ "$1" = "--build" ] || usage
case "$2" in
  /*) ;;
  *) echo 'DENY: destination must be absolute as originally supplied' >&2;exit 64 ;;
esac
command -v realpath >/dev/null 2>&1 || { echo 'BLOCKED-ENV: realpath absent' >&2;exit 78; }
lexical=$(realpath -m -s -- "$2")
physical=$(realpath -m -- "$2")
# Accept ONLY an existing empty /tmp subdirectory with no output symlinks.
case "$physical/" in
  /tmp/*) ;;
  *) echo 'DENY: output must be inside /tmp' >&2;exit 64 ;;
esac
for location in "$lexical" "$physical"; do
  case "$location/" in
    "$repo/"*) echo 'DENY: Git checkout destination' >&2;exit 64 ;;
  esac
done
if [ -L "$2" ] || [ ! -d "$physical" ] || [ -n "$(ls -A -- "$physical")" ]; then
  echo 'DENY: destination must exist, not be symlinked and be empty' >&2;exit 64
fi
if [ -n "$(git -C "$repo" status --porcelain=v1)" ]; then
  echo 'BLOCKED-SOURCE: commit source before running Docker build' >&2;exit 65
fi
command -v docker >/dev/null 2>&1 || { echo 'BLOCKED-ENV: Docker unavailable' >&2;exit 78; }
actual=$(docker image inspect --format '{{.Id}}' "$image") || {
  echo 'BLOCKED-ENV: pinned Emscripten image absent; no pull attempted' >&2;exit 78;
}
if [ "$actual" != "$image" ]; then
  echo 'DENY: cached Emscripten image digest mismatch' >&2;exit 65
fi
head=$(git -C "$repo" rev-parse HEAD)
printf 'SOURCE_GIT_SHA %s\nIMAGE_ID %s\n' "$head" "$image"
# Linked Git worktrees store an ABSOLUTE gitdir outside their checkout.
# Bind exactly the known shared metadata location READ-ONLY to make git
# rev-parse/status work inside /work; never change host Git configuration.
# This is required for the source manifest to finish, not for C++ itself.
set -- -v "$repo:/work:ro"
if [ -f "$repo/.git" ]; then
  common=$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)
  case "$common" in
    /home/marcos/NSMB/.git) ;;
    *) echo 'DENY: unrecognized Git common metadata path' >&2;exit 65 ;;
  esac
  [ -d "$common" ] || { echo 'BLOCKED-ENV: linked Git metadata missing' >&2;exit 78; }
  set -- "$@" -v "$common:$common:ro"
fi
# Container root has no writable host mounts except /tmp output; the
# disposable writable container filesystem is needed for em++ cache.
docker run --rm --pull never --network none --cpus=2 --memory=4g \
  -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory \
  -e GIT_CONFIG_VALUE_0=/work \
  "$@" -v "$physical:/output:rw" -w /work \
  "$image" sh web-runtime/frame-host/rebuild_phase18_user.sh --build /output
test -s "$physical/frame_loop.wasm"
test -s "$physical/frame_loop.mjs"
test -s "$physical/phase18_artifact_manifest.json"
{
  echo "PEACH_PHASE19_DOCKER_REAL_SOURCE_BUILD"
  echo "Source_Git_SHA $head"
  echo "Image_ID $image"
  echo "Network none"
  echo "Pull never"
  echo "Source_mount readonly"
  echo "Output_mount /tmp"
  echo "Emscripten compiler inside container see build_manifest.txt"
  echo 'Compile_CXX_Flags -std=c++17 -O2 -Wall -Wextra'
  echo 'Compile_EMCC_Flags -sWASM=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node --no-entry -sALLOW_MEMORY_GROWTH=1 -sABORTING_MALLOC=0 -sFILESYSTEM=0'
  echo "Build_Scripts_SHA256"
  sha256sum "$here/rebuild_phase17_user.sh" \
    "$here/rebuild_phase18_user.sh" \
    "$here/build_phase19_container.sh"
  echo "Output_SHA256"
  sha256sum "$physical/frame_loop.wasm" "$physical/frame_loop.mjs"
} > "$physical/phase19_build_info.txt"
echo 'PHASE19_REAL_EMSCRIPTEN_SOURCE_BUILD_SUCCEEDED'
echo 'IMPORTANT: build+static verification alone does not execute the clock guest'
