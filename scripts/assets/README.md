# Local-only extracted-resource inventory (W05)

**Not a ROM unpacker, content packer, game loader or playable web release.**
This tool inventories metadata from an already-extracted game on the owner's
machine. It never copies, uploads, compresses or embeds asset payload bytes.
It only reads the identity header, filesystem metadata, and optionally writes
a **private** JSON manifest. Asset relative names can be confidential:
never commit generated manifests or plans.

## Constraints and preflight

- Source must be a local extracted directory with the expected identity header,
  filesystem index and resource hierarchy. It detects an extracted game root
  or a parent containing the expected data subdirectory.
- The identity probe checks a six-character game ID, region and revision.
  Use --strict-target to require the supported USA Rev 1 profile; this is
  **not** an ABI/hook or full game binary compatibility assertion.
- Symlinks, Windows junctions, linked ancestors, malformed filenames,
  duplicate case-folded names, unexpected special files, truncated headers,
  invalid structure and excessive file counts/sizes are rejected.
- Extensions are configurable. Game-image containers, DOL/REL executables
  and unrecognized files are excluded; --unknown reject instead fails.
- Output and private root must be absolute, outside Git, inside the owner's
  private workspace; parent traversal and symlink escapes are rejected.
  The final manifest directory is also checked for a nested Git checkout
  (both standard .git directory and linked-worktree .git file), preventing
  a private manifest from accidentally landing in a nested repository.
- CLI prints aggregate counts, total size, a profile match and a metadata-only
  digest, not private source paths or original filenames.

## CLI (PowerShell)

All path values are placeholders. Supply your own legitimate extracted copy
and a private output directory, not a Git checkout.

    $source = 'C:\PRIVATE\EXTRACTED'
    $private = 'C:\PRIVATE\agent-work\Toad'
    New-Item -ItemType Directory -Force $private | Out-Null
    node scripts/assets/index.mjs --source $source --dry-run --strict-target
    node scripts/assets/index.mjs --source $source --private-root $private --out "$private\assets-manifest.json" --strict-target --max-files 50000 --max-entries 200000 --max-bytes 8589934592

Optional --extensions .arc,.tpl narrows the allowed types.
Generated JSON includes original relative names and sizes: NEVER commit it,
upload it or copy it into a public webserver directory.

## Deterministic package proposal

plan.mjs exports planPackages(inventory, { targetBytes, maxPacks }).
It validates paths/size/type/collisions, sorts entries bytewise and assigns
sequential pack IDs deterministically, with a default target of 64 MiB.
Oversized files are isolated and flagged. Estimated uncompressed space =
raw bytes + 64 bytes per indexed item + 128 bytes per pack. This is only
a planning estimate: it does not predict compression, alignment, HTTP overhead,
GPU upload expansion or browser quotas. It writes no archive or resource bytes.

A local caller may read the generated private manifest, call planPackages
with a chosen targetBytes, and retain the result IN MEMORY or outside Git.
Pack assignments include original names and are just as private as the manifest.

## Browser data-loading options

| Approach | Benefits | Caveats | Suggested use |
|---|---|---|---|
| File API / file picker | Player selects local copy; server distributes no assets | User activation, permissions, uneven directory access support | Best privacy-first first boot |
| Origin Private File System (OPFS) | Origin-scoped cached data, random access | Requires import and explicit quota/eviction handling, not a backup | Cached imported chunks |
| IndexedDB | Broad support, asynchronous catalog storage | Large blobs/transactions cost memory, quota limits | Manifests and small cache entries |
| Lazy HTTP (localhost only) | Streams/ranges/cache headers | Private source must never be served publicly, CORS/Content-Type/path-traversal guards | Locked-down loopback prototype |

Recommended staged architecture: local identity/structure check; request
player permission; read original resources through File objects on demand;
store metadata in IndexedDB and optional derived chunks in OPFS.
Avoid eagerly copying a whole game into browser RAM. A localhost adapter
must bind only to loopback and explicitly validate all relative paths.
A real loader will still require decompression, integrity checks,
Wii resource decoding, versioning and error handling.

## Tests

    node --test scripts/assets/test/*.test.mjs
    node --check scripts/assets/index.mjs
    node --check scripts/assets/plan.mjs
    git status --short
    git diff --cached --name-only

Tests use synthetic temporary files and clean up automatically.
They cover malformed paths, missing game input, invalid identity,
aggregate size/count limits, allowlists, deterministic output, malicious
metadata, symlinks/junctions and metadata-only pack planning.

**Limitations:** No source-file content checksums, no playable page,
no asset format translation, no real packfile writer, no browser adapter.
Files could mutate between stat calls: index an immutable extraction for
reproducible inventories. No Nintendo-owned game contents belong in Git.

Private summary-only preview (no names or packfile output):

    node scripts/assets/preview.mjs "C:\\PRIVATE\\agent-work\\Toad\\assets-manifest.json" 67108864

The preview rejects in-Git or oversized manifests, reports aggregate pack estimates only and does not persist package assignments.
