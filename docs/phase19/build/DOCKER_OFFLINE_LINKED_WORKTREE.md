# Phase19 offline, SHA-pinned Docker build from an existing linked Git worktree

The opt-in `web-runtime/frame-host/build_phase19_container.sh` must be
run from an already committed, clean Phase19 Peach branch (not a Docker
service). Use only the existing Mario-approved cached image ID
`sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a`,
Emscripten 6.0.13. No `docker pull`, network, privileged container, sudo,
third-party download, or Wii game sources.

The wrapper requires an absolute, **existing empty** /tmp destination and
rejects symlinked destination, nonempty directory, outside /tmp and
checked-out Git location using lexical and resolved paths. It checks
`docker image inspect` against exact image ID, and source cleanliness
before any container run. Source `/work:ro` and output `/output:rw`;
container overlay writable but discarded by `--rm` to satisfy Emscripten
cache. Resource limit 2 CPUs/4GiB; `--network none --pull never`.

The script also explicitly supports *linked* Git worktrees: their
`.git` is a text pointer containing an absolute host path into the
parent repository's `.git/worktrees`. With only `/work:ro` mounted,
C++ can compile but the final Git source/manifest verification fails with
`fatal: not a git repository: .../.git/worktrees/... `. **This was a
real RED attempt on Phase19 first commit**: a new Wasm file was produced
but the build exited 128, so it was NOT a successful artifact. The
revised runner mounts the single expected host common Git metadata path
`/home/marcos/NSMB/.git` **read-only** at the same absolute path inside
the container, and uses `GIT_CONFIG_COUNT` to mark only `/work` safe
without changing host/global config. The exact source HEAD and `git
status` then work. No other arbitrary Git metadata path is permitted.
This mount contains Git metadata; it is used only in the trusted cached
offline container, never uploaded or included in output artifacts.

Reproduce after committing:

```sh
cd /home/marcos/NSMBcowork/worktrees/peach-Phase19
out=$(mktemp -d /tmp/nsmb-peach19-real-wasm-XXXXXX)
sh web-runtime/frame-host/build_phase19_container.sh --build "$out"
```

Expected output `frame_loop.wasm`, `frame_loop.mjs`,
`build_manifest.txt`, `phase18_artifact_manifest.json` and
`phase19_build_info.txt`. The Phase19 build info also records the
pinned image ID, offline/source-readonly constraints, declared compiler
flags, and SHA-256 of all three public builder scripts; the C++ builder's
own log records the actual Emscripten6.0.13 version and seven compiled
input-file byte hashes. The Phase19 dynamic Node verifier requires these
values to agree with the CURRENT clean Git working tree before calling
any W03 export. Any changed image ID, build flags, source script hash,
compiler version, C++ input hash, Wasm/MJS bytes or functional test count
fails closed. Eleven original adversarial tamper tests plus two added
flags/script-hash controls test these denials in throwaway /tmp copies.

The existing static verifier binds Git
source SHA, hashes of all public frame-host/Time64 input files, byte SHA
of the Wasm/MJS and typed imports/exports. A self-generated manifest is
NOT an independent signature of source->binary lineage or the C#
translator. A clean compile+static verify still does NOT demonstrate any
W03 clock event until the new source's OWN dynamic Node and REAL
Chromium tests execute the same artifact by exact digest.

Never write a compiled artifact back into tracked `dist`, never reuse
an old Phase15/18 Wasm for a Phase19 functional claim, and never
represent successful synthetic operations as original Nintendo code.
