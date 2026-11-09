# Phase17 Peach — non-privileged Emscripten rebuild gate

**Status on marcos-hpr on 2026-11-09: BLOCKED-ENV.** `emcc` and `em++`
are absent from PATH. This does not prove Emscripten cannot be provisioned
later. No sudo, network download or installation was attempted.

## Why this file exists

`web-runtime/frame-host/build.ps1` is a Windows-specific source list
which builds one bundled W03/W04/W07/input synthetic Wasm using `em++.exe`.
It must not be treated as proof of a 2026-11-09 Phase17 artifact because
there is no Emscripten compiler in the authorized host environment.

The new `web-runtime/frame-host/rebuild_phase17_user.sh` offers an
**explicit opt-in** Linux/Ubuntu translation of that public source list
with the same compiler flags. It writes only to an **absolute, empty
output directory outside the Git worktree**, records toolchain and
input/output hashes and reads binary Wasm imports/exports using Node.
No Nintendo assets, private DOL or generated original Wii C++ are involved.

Probe safely without downloading/installing anything:

```bash
cd /home/marcos/NSMBcowork/worktrees/peach-Phase17
env -u LD_LIBRARY_PATH -u LD_PRELOAD \
  sh web-runtime/frame-host/rebuild_phase17_user.sh --probe
```

On this machine it exits **78** with `BLOCKED-ENV: em++ is not on PATH`.
A non-zero toolchain probe is **not** a failed Phase17 code test, but
neither is it a build success. The script syntax `sh -n` PASSES.

## Future build: authorized user-owned SDK only

After Mario has selected a specific public Emscripten SDK release
(version/commit documented), an authorized operator may install or
activate a user-owned SDK in the home directory (without sudo),
then record `command -v em++` and `em++ --version`.
Do not silently fetch `latest` or grant root permission.

With a pinned SDK already in PATH:

```bash
mkdir -p /tmp/nsmb-phase17-wasm-qa
env -u LD_LIBRARY_PATH -u LD_PRELOAD \
  sh web-runtime/frame-host/rebuild_phase17_user.sh \
  --build /tmp/nsmb-phase17-wasm-qa
```

The destination argument MUST already be **absolute as supplied**.
Before running `realpath`, `--build relative-output`, `./output`,
`../output` and other relative spellings are rejected with exit **64**
without creating directories or invoking `em++`. Normalization must not
silently turn relative paths into allowed absolute destinations.

The destination **must be empty**: the script refuses to overwrite
previous artifacts and refuses directories inside the source checkout,
checking both the path normalized **without** following symlinks and the
fully resolved physical destination. External symlinks into the checkout
are denied; a path under the checkout that aliases elsewhere is also
denied. Paths containing spaces are supported. If GNU `realpath` is
unavailable, the build exits **78/BLOCKED-ENV** before creating a
destination, not a false compilation success.

The RED/GREEN regression suite is:
```bash
env -u LD_LIBRARY_PATH -u LD_PRELOAD node --test \
  tests/phase17/peach/rebuild_phase17_user.test.mjs
```
It uses a controlled fake `em++` that records any invocation and exits
**42**, never a real compiler or a Wii asset. Relative paths must exit
**64** without invoking that stub; a valid new absolute external output
may reach the stub and exit 42, which is **NOT** a Wasm build PASS.
The tests cover relative traversal, spaces, existing nonempty output,
repo roots, external-to-repo symlinks, CLI errors, absent compiler and
absent `realpath`.

Outputs, **if legitimately compiled in a later authorized environment**,
are `frame_loop.mjs`, `frame_loop.wasm` and
`build_manifest.txt` containing source/binary SHA-256 and toolchain
information.

**After a successful build** (not achieved here), Mario and independent
reviewers still need to execute that **new file** through Node and a
real sandboxed browser using a purpose-built Phase17 fixture test,
enumerate typed Wasm ABI imports/exports (REA 6.5 when available),
check no test-only forgery symbols or raw guest pointers are exported,
repeat legacy W03/W04/W07 regression, and review SHA exactness.
The old committed `dist/frame_loop.wasm` must not be overwritten as a
shortcut, and an old Chrome PASS cannot validate new source.

## Outstanding authenticity STOP

Even a fresh successful compile is NOT a game port: W01 DOL checksum
mismatch, recursive C# producer attestation, time64 external ledger
commit, Nintendo native ABI, GX/IOS/IRQ/HLE and actual guest execution
remain blocked. Local W03 clock is synthetic only.
