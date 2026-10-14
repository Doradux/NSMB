# W05 — Local-only Wii resource indexing and browser loader plan

Status: **metadata-only proof of concept**, not a game loader or playable browser build.
Owner: Toad. Independent review required before Mario integrates.
**Never commit game data, private manifests, original filenames, or translated copyrighted code.**

## Upstream research and runtime interface

- Upstream runtime/src/game_folder.cpp accepts an extracted-disc directory
  or its DATA child. It checks files/ and sys/fst.bin; sys/boot.bin is read
  to identify the six-byte ID and the revision at offset 7.
- Upstream runtime/src/hle/storage/dvd.cpp maps extracted files/ to the
  virtual Wii DVD root /, with sys/ mapped separately. It registers paths,
  executes exact byte-range reads, and models game DVD command completion.
- Upstream runtime/include/hle/dvd_contract.h canonicalizes slash separators,
  supports case-insensitive virtual path lookup, and builds an FST image with
  parent/subtree indices, file size and disc-offset words. A metadata-only
  extension-filtered index is **NOT a substitute for a complete DVD/FST image**.
- The Windows native runtime may preload up to ~1 GiB privately for quick
  reads. Do not reproduce this unbounded pattern on the browser heap.
- Real game data need never appear on the public site: ownership and user
  action are prerequisites for local access. Identifying SMNE01 Rev 1 does
  not resolve the separate main.dol hash/profile mismatch.

Sources checked locally: upstream BUILDING.md, game_folder.cpp, dvd.cpp,
dvd_contract.h. All these are code, not original Nintendo asset files.

## CLI and private usage

Node.js 20+; no third-party packages or network access. Run from the
isolated Toad worktree:

    node scripts/assets/index.mjs --help
    node --test scripts/assets/test/index.test.mjs

Example PRIVATE inventory; output must remain outside ALL Git checkouts:

    node scripts/assets/index.mjs --source "C:\PRIVATE\EXTRACTED" --private-root "C:\PRIVATE\agent-work\Toad" --out "C:\PRIVATE\agent-work\Toad\manifest.json" --strict-target

A preflight can use --dry-run to suppress writing entirely.
--unknown skip|reject controls unrecognized extension handling (default skip).
--extensions .arc,.bin overrides the indexed extension allowlist, except
for executable/disc-image formats which remain blocked.
--max-files, --max-entries and --max-bytes bound resource consumption
(default 50000 recognized files, 200000 visited entries, 8 GiB total).
--strict-target requires SMNE01 USA Rev 1 but does NOT authenticate the
executable SHA or prove game compatibility.

Manifest schema v1 contains identity, policy, deterministic relative path
entries, accepted extension, sizes represented as decimal strings, and
aggregated counts. The output manifest holds PRIVATE RELATIVE FILENAMES;
the console does not log any names, absolute paths or original contents.
There are no content hashes or timestamps.

estimatedRawPackageBytes = sum(bytes) + 64 * numberOfFiles.
This is a rough uncompressed storage planning heuristic, NOT a measurement
of compressed archive size, Wii FST overhead, or browser RAM needs.

## Security guarantees and remaining risks

- The tool never copies asset bytes and never uploads data. It reads only
  eight bytes from the boot metadata; it obtains asset sizes with lstat.
- Directory symlinks / Windows junctions, file symlinks, nonregular files,
  malformed names, reserved device names, trailing spaces and periods,
  control characters, normalized/case-insensitive name collisions,
  excessively long paths and quota violations are rejected.
- Output requires an existing caller-selected private root outside Git,
  explicit absolute JSON path, no source overlap and no symlink escape.
  It is written via a temporary sibling and rename only after a scan.
- Output JSON and digest are stable across scans of an unchanged tree
  because entries are sorted and timestamps are excluded.

Limitations: the source may mutate during scanning; filesystem races are
not fully guarded. Very wide directories consume readdir memory; hard
links cannot be distinguished from normal files by path alone. Size-only
manifest is not a cryptographic integrity statement. Symlink detection
checks observed paths but cannot prevent a malicious process swapping
objects immediately after checks. For untrusted inputs, isolate the
process and review results before making them loadable.

**Important**: extension-filtering with --unknown skip deliberately
produces an incomplete game inventory. Do not connect this manifest to
the runtime FST without a separate completeness gate. Executables,
RELs and commercial disc-image formats are not public resource formats.

## Private file delivery architecture

| Technique | Benefit | Cost / boundary |
|---|---|---|
| File System Access API | Explicit owner-selected extracted folder; no upload; lazy file reads | Requires user gesture/permission, desktop Chromium support; handles may expire |
| Origin Private File System (OPFS) | Efficient origin-scoped local cache | Copies assets into quota-bound origin storage; clearing site data removes them |
| IndexedDB | Broad browser support for Blob/chunk caching | Import latency, quota, transaction size, duplication and cleanup concerns |
| Loopback HTTP range reader | Predictable DVD-style random range requests | Requires user-run 127.0.0.1 server, strict path sandbox, no permissive CORS, protected endpoints, explicit opt-in |

Preferred investigation: first prove a user-selected directory File
System Access adapter with a private handle map and synthetic reads.
Use IndexedDB/OPFS only if measurements justify local staging.
If a local loopback server is added, NEVER expose a game resource route
through the public demo server, share raw filenames in telemetry, or
serve beyond 127.0.0.1. Prevent CSRF, encoded path traversal, symlink
escape, directory listing and accidental CORS exposure.

## Phases and acceptance criteria

1. Inventory: deterministic private metadata only. Synthetic hostile tests
   cover absent input, identity corruption, size/file limits, names and
   symlink/junction refusal. No proprietary asset content in Git.
2. Completeness study: independently compare private inventory to all
   runtime FST registrations; handle any extensionless assets, unknown
   formats, and directory-only nodes. Summaries stay private.
3. Synthetic browser picker and byte-range adapter: owner gesture and
   permission; precise EOF, integer overflow, zero-length, short-read,
   concurrent reads and cancellation tests.
4. Wii DVD/FST guest contract: preserve case-insensitive lookup, disc
   offsets, callbacks, error codes, guest DMA notification and no
   mutation of guest RAM on failed reads. Test with synthetic resources.
5. Integrate with real translated guest code ONLY after W01/W03/W04/W07
   compatibility and memory-safety gates clear. Browser success means
   authentic gameplay; metadata inventory alone is not a boot.

Out of scope: packaging copyrighted original assets, remote uploading,
gameplay emulation, working runtime DVD interface or playable browser
build. Review threat model and source-directory snapshot consistency
before enabling actual asset reads.
