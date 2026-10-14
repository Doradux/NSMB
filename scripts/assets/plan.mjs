// Metadata-only deterministic browser packaging estimate; never handles source bytes.
import { AssetError, checkedName, ALLOWED_EXTENSIONS } from './index.mjs';

function check(ok, code) { if (!ok) throw new AssetError(code); }

function bigintDecimal(input, code) {
  check((typeof input === 'string' && /^[0-9]+$/u.test(input)) ||
    (typeof input === 'number' && Number.isSafeInteger(input) && input >= 0) ||
    (typeof input === 'bigint' && input >= 0n), code);
  return BigInt(input);
}

function safeEntry(entry) {
  check(entry && typeof entry === 'object' && !Array.isArray(entry), 'PACK_INVALID_ENTRY');
  check(typeof entry.path === 'string' && entry.path.length > 0 && entry.path.length <= 1024,
    'PACK_INVALID_PATH');
  check(!entry.path.includes('\\') && !entry.path.startsWith('/') &&
    !entry.path.includes(':') && !entry.path.includes('\0'), 'PACK_INVALID_PATH');
  const segments = entry.path.split('/');
  check(segments.every(segment => segment && segment !== '.' && segment !== '..'),
    'PACK_INVALID_PATH');
  segments.forEach(checkedName);
  check(typeof entry.extension === 'string' && ALLOWED_EXTENSIONS.includes(entry.extension),
    'PACK_DISALLOWED_EXTENSION');
  check(entry.path.toLowerCase().endsWith(entry.extension), 'PACK_EXTENSION_MISMATCH');
  const bytes = bigintDecimal(entry.bytes, 'PACK_INVALID_SIZE');
  return { path: entry.path, bytes };
}

// Stable first-fit-in-order grouping. Large single files remain isolated and flagged;
// this creates only an estimate and must not be mistaken for a packfile writer.
export function planPackages(inventory, { targetBytes = '67108864', maxPacks = 50000 } = {}) {
  check(inventory && inventory.schemaVersion === 1 && Array.isArray(inventory.entries),
    'PACK_INVALID_MANIFEST');
  check(inventory.entries.length <= 200000, 'PACK_TOO_MANY_ENTRIES');
  const target = bigintDecimal(targetBytes, 'PACK_INVALID_TARGET');
  check(target > 0n && target <= BigInt(Number.MAX_SAFE_INTEGER), 'PACK_INVALID_TARGET');
  check(Number.isSafeInteger(maxPacks) && maxPacks > 0, 'PACK_INVALID_MAX_PACKS');

  const entries = inventory.entries.map(safeEntry);
  const paths = new Set();
  entries.forEach(entry => {
    const canonical = entry.path.normalize('NFC').toLowerCase();
    check(!paths.has(canonical), 'PACK_PATH_COLLISION');
    paths.add(canonical);
  });
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

  const packs = [];
  const assignments = [];
  let pack = null;
  let total = 0n;
  for (const entry of entries) {
    if (!pack || (pack.fileCount !== 0 && pack.total + entry.bytes > target)) {
      check(packs.length < maxPacks, 'PACK_TOO_MANY_PACKS');
      pack = { id: 'pack-' + String(packs.length + 1).padStart(5, '0'),
        fileCount: 0, total: 0n, oversized: false };
      packs.push(pack);
    }
    pack.fileCount++;
    pack.total += entry.bytes;
    pack.oversized ||= entry.bytes > target;
    assignments.push({ path: entry.path, packId: pack.id, bytes: entry.bytes.toString() });
    total += entry.bytes;
  }

  if (inventory.totals?.bytes !== undefined) {
    check(bigintDecimal(inventory.totals.bytes, 'PACK_INVALID_TOTAL') === total, 'PACK_TOTAL_MISMATCH');
  }
  const fixedMetadataBytes = BigInt(entries.length) * 64n + BigInt(packs.length) * 128n;
  return {
    schemaVersion: 1,
    source: 'synthetic-or-private-inventory',
    targetBytes: target.toString(),
    packs: packs.map(p => ({ id: p.id, files: p.fileCount,
      bytes: p.total.toString(), oversized: p.oversized })),
    assignments,
    totals: { sourceBytes: total.toString(), estimatedMetadataBytes: fixedMetadataBytes.toString(),
      estimatedUncompressedPackBytes: (total + fixedMetadataBytes).toString() }
  };
}
