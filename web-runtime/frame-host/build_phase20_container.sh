#!/bin/sh
# Phase20: opt-in, offline, source-pinned REAL new W03 service Wasm.
# Delegates all absolute/symlink/outside-git/no-pull/image/source clean checks
# to verified Phase19 builder. Never accesses Nintendo original game bytes.
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repo=$(CDPATH= cd -- "$here/../.." && pwd -P)
[ "$#" -eq 2 ] && [ "$1" = '--build' ] || {
 echo 'DENY: Usage --build ABSOLUTE_EXISTING_EMPTY_TMP_OUTPUT' >&2;exit 64;
}
case "$2" in /*) ;; *) echo 'DENY: original output must be absolute' >&2;exit 64;; esac
sh "$here/build_phase19_container.sh" --build "$2"
out=$(realpath -- "$2")
for file in frame_loop.wasm frame_loop.mjs phase18_artifact_manifest.json build_manifest.txt phase19_build_info.txt; do
 [ -s "$out/$file" ] || { echo "BLOCKED-ENV: missing $file" >&2;exit 78; }
done
[ -s "$repo/web-runtime/frame-host/phase20_service_fixture.inc" ] || {
 echo 'BLOCKED-SOURCE: missing real W03 quota service' >&2;exit 78;
}
head=$(git -C "$repo" rev-parse HEAD)
{
 echo 'PHASE20_SOURCE_ONLY_SYNTHETIC_SERVICE_WASM'
 echo "Source_Git_SHA $head"
 echo 'ABI_Version 1'
 echo 'Service_Ids 0x53560001 0x53560002'
 echo 'Private_W03_Quota 1'
 echo 'Docker_Image_ID sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a'
 echo 'W03_Input_Files_SHA256'
 sha256sum "$here/phase20_service_fixture.inc" "$here/frame_loop.cpp" \
  "$here/scheduler_clock.hpp" "$here/trusted_cpu_service.hpp" \
  "$repo/web-runtime/runtime-services/synthetic_service_dispatch.hpp" \
  "$here/build_phase20_container.sh"
 echo 'Output_SHA256'
 sha256sum "$out/frame_loop.wasm" "$out/frame_loop.mjs"
} > "$out/phase20_service_build_info.txt"
echo 'PHASE20_NEW_REAL_WASM_STATIC_BUILD_SUCCEEDED'
echo 'WARNING: build/static only; run dynamic Node + REAL Chromium W03 service'
