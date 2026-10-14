#!/usr/bin/env node
// Local-only inventory. Public branches contain this code and synthetic tests, never private manifests.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ALLOWED_EXTENSIONS = Object.freeze([
  '.arc', '.ash', '.bck', '.bcsar', '.bcsv', '.bmg', '.brlan', '.brlyt',
  '.brres', '.bti', '.btk', '.carc', '.dat', '.kcl', '.kmp', '.lz',
  '.ogg', '.sarc', '.szs', '.tpl', '.wav', '.bin'
]);
const BLOCKED_SUFFIX = /(?:\.rel(?:\.lz)?|\.dol(?:\.lz)?|\.elf|\.exe|\.wad|\.iso|\.rvz|\.wbfs)$/i;
const REGION = { E: 'USA', P: 'Europe', J: 'Japan', K: 'Korea' };
const DEFAULT_LIMITS = { maxFiles: 50000, maxEntries: 200000, maxBytes: 8n * 1024n ** 3n };

export class AssetError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function requireCondition(condition, code) {
  if (!condition) throw new AssetError(code);
}
function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}
async function noLinks(file, kind) {
  let st;
  try { st = await fs.lstat(file, { bigint: true }); }
  catch (error) {
    if (error.code === 'ENOENT') throw new AssetError('MISSING_INPUT');
    throw error;
  }
  requireCondition(!st.isSymbolicLink(), 'SYMLINK_NOT_ALLOWED');
  if (kind === 'directory') requireCondition(st.isDirectory(), 'NOT_A_DIRECTORY');
  if (kind === 'file') requireCondition(st.isFile(), 'NOT_A_FILE');
  return st;
}
// Reject links in existing ancestors, including Windows directory junctions.
// Leaves may be absent only when preparing a new private output directory.
async function assertNoLinkedAncestors(filename) {
  const absolute = path.resolve(filename);
  const root = path.parse(absolute).root;
  let cursor = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = await fs.lstat(cursor).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!stat) break;
    requireCondition(!stat.isSymbolicLink(), 'SYMLINK_NOT_ALLOWED');
  }
}
export function checkedName(name) {
  requireCondition(name.length > 0 && name.length <= 255, 'INVALID_NAME');
  requireCondition(!/[<>:"/\\|?*\u0000-\u001f\u007f]/u.test(name), 'INVALID_NAME');
  requireCondition(!/[. ]$/u.test(name) && name !== '.' && name !== '..', 'INVALID_NAME');
  requireCondition(!/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name), 'INVALID_NAME');
  requireCondition(!/[\uD800-\uDFFF]/u.test(name), 'INVALID_NAME');
  return name.normalize('NFC');
}
function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
async function gameRoot(source) {
  const absolute = path.resolve(source);
  await assertNoLinkedAncestors(absolute);
  await noLinks(absolute, 'directory');
  const directBoot = path.join(absolute, 'sys', 'boot.bin');
  const dataBoot = path.join(absolute, 'DATA', 'sys', 'boot.bin');
  const direct = await fs.access(directBoot).then(() => true, () => false);
  const nested = await fs.access(dataBoot).then(() => true, () => false);
  requireCondition(direct !== nested, direct ? 'AMBIGUOUS_GAME_ROOT' : 'MISSING_BOOT_HEADER');
  const resolved = direct ? absolute : path.join(absolute, 'DATA');
  await noLinks(resolved, 'directory');
  await noLinks(path.join(resolved, 'sys'), 'directory');
  await noLinks(path.join(resolved, 'sys', 'boot.bin'), 'file');
  await noLinks(path.join(resolved, 'sys', 'fst.bin'), 'file');
  await noLinks(path.join(resolved, 'files'), 'directory');
  return await fs.realpath(resolved);
}
async function readIdentity(root) {
  const file = await fs.open(path.join(root, 'sys', 'boot.bin'), 'r');
  const header = Buffer.alloc(8);
  try {
    const { bytesRead } = await file.read(header, 0, 8, 0);
    requireCondition(bytesRead === 8, 'CORRUPT_BOOT_HEADER');
    const id = header.subarray(0, 6).toString('ascii');
    requireCondition(/^[A-Z0-9]{6}$/.test(id), 'CORRUPT_BOOT_HEADER');
    requireCondition(id.slice(0, 3) === 'SMN', 'UNEXPECTED_GAME_ID');
    return { gameId: id, region: REGION[id[3]] || 'unknown', revision: header[7],
      profileMatch: id === 'SMNE01' && header[7] === 1 };
  } finally { await file.close(); }
}
function checkedLimit(value, name) {
  const limit = typeof value === 'bigint' ? value : BigInt(value);
  requireCondition(limit > 0n && limit <= BigInt(Number.MAX_SAFE_INTEGER), 'INVALID_' + name);
  return limit;
}
export async function buildManifest({ source, unknown = 'skip', extensions = ALLOWED_EXTENSIONS,
  maxFiles = DEFAULT_LIMITS.maxFiles, maxEntries = DEFAULT_LIMITS.maxEntries,
  maxBytes = DEFAULT_LIMITS.maxBytes } = {}) {
  requireCondition(typeof source === 'string' && source.length > 0, 'MISSING_SOURCE');
  requireCondition(unknown === 'skip' || unknown === 'reject', 'INVALID_UNKNOWN_POLICY');
  requireCondition(Array.isArray(extensions) && extensions.length > 0, 'INVALID_EXTENSION_LIST');
  requireCondition(extensions.every(ext => typeof ext === 'string' && /^\.[a-z0-9]{1,12}$/.test(ext)
    && !BLOCKED_SUFFIX.test('example' + ext)), 'INVALID_EXTENSION_LIST');
  const allowed = new Set(extensions);
  const maxF = checkedLimit(maxFiles, 'MAX_FILES');
  const maxE = checkedLimit(maxEntries, 'MAX_ENTRIES');
  const maxB = checkedLimit(maxBytes, 'MAX_BYTES');
  const root = await gameRoot(source);
  const identity = await readIdentity(root);
  const entries = [];
  const seen = new Set();
  let total = 0n, visited = 0n, ignored = 0n;
  async function walk(folder, parents) {
    const children = (await fs.readdir(folder)).sort(compare);
    for (const raw of children) {
      visited++;
      requireCondition(visited <= maxE, 'TOO_MANY_ENTRIES');
      const segment = checkedName(raw);
      const components = [...parents, segment];
      const relative = components.join('/');
      requireCondition(relative.length <= 1024, 'PATH_TOO_LONG');
      const collision = relative.toLowerCase();
      requireCondition(!seen.has(collision), 'CASE_OR_UNICODE_COLLISION');
      seen.add(collision);
      const full = path.join(folder, raw);
      const stat = await noLinks(full);
      if (stat.isDirectory()) {
        await walk(full, components);
      } else {
        requireCondition(stat.isFile(), 'UNSUPPORTED_FILE_TYPE');
        const ext = path.extname(segment).toLowerCase();
        if (BLOCKED_SUFFIX.test(segment) || !allowed.has(ext)) {
          if (unknown === 'reject') throw new AssetError('DISALLOWED_EXTENSION');
          ignored++;
          continue;
        }
        requireCondition(stat.size >= 0n, 'INVALID_FILE_SIZE');
        total += stat.size;
        requireCondition(total <= maxB, 'ASSET_TOTAL_TOO_LARGE');
        requireCondition(BigInt(entries.length + 1) <= maxF, 'TOO_MANY_FILES');
        entries.push({ path: relative, extension: ext, bytes: String(stat.size) });
      }
    }
  }
  await walk(path.join(root, 'files'), []);
  entries.sort((a, b) => compare(a.path, b.path));
  const inventory = { schemaVersion: 1, identity, policy: 'metadata-only-no-file-contents',
    entries, totals: { indexedFiles: entries.length, ignoredFiles: String(ignored),
      bytes: String(total), estimatedRawPackageBytes: String(total + BigInt(entries.length) * 64n) } };
  const json = JSON.stringify(inventory, null, 2) + '\n';
  const digest = createHash('sha256').update(json).digest('hex');
  return { root, inventory, json, digest };
}
async function gitAncestor(start) {
  let current = start;
  while (true) {
    if (await fs.access(path.join(current, '.git')).then(() => true, () => false)) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}
export async function writePrivateManifest({ manifest, output, privateRoot, sourceRoot }) {
  requireCondition(typeof output === 'string' && typeof privateRoot === 'string', 'PRIVATE_OUTPUT_REQUIRED');
  requireCondition(path.isAbsolute(output) && path.isAbsolute(privateRoot), 'ABSOLUTE_PRIVATE_PATHS_REQUIRED');
  requireCondition(path.extname(output).toLowerCase() === '.json', 'JSON_OUTPUT_REQUIRED');
  await assertNoLinkedAncestors(privateRoot);
  await noLinks(privateRoot, 'directory');
  const safeRoot = await fs.realpath(privateRoot);
  requireCondition(!(await gitAncestor(safeRoot)), 'PRIVATE_ROOT_INSIDE_GIT');
  const outputPath = path.resolve(output);
  requireCondition(inside(safeRoot, outputPath) && outputPath !== safeRoot, 'OUTPUT_OUTSIDE_PRIVATE_ROOT');
  requireCondition(!inside(sourceRoot, outputPath), 'OUTPUT_INSIDE_SOURCE');
  const parent = path.dirname(outputPath);
  await assertNoLinkedAncestors(parent);
  await fs.mkdir(parent, { recursive: true });
  await assertNoLinkedAncestors(parent);
  const canonicalParent = await fs.realpath(parent);
  requireCondition(inside(safeRoot, canonicalParent), 'OUTPUT_SYMLINK_ESCAPE');
  const final = path.join(canonicalParent, path.basename(outputPath));
  requireCondition(!inside(sourceRoot, final), 'OUTPUT_INSIDE_SOURCE');
  const existing = await fs.lstat(final).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  requireCondition(!existing || existing.isFile(), 'INVALID_OUTPUT_TARGET');
  requireCondition(!existing || !existing.isSymbolicLink(), 'OUTPUT_SYMLINK_ESCAPE');
  const temporary = path.join(canonicalParent, '.asset-manifest-' + randomUUID() + '.tmp');
  try {
    await fs.writeFile(temporary, manifest, { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, final);
  } finally { await fs.rm(temporary, { force: true }); }
}
function usage() {
  return 'Usage: node scripts/assets/index.mjs --source EXTRACTED --private-root PRIVATE_DIR --out PRIVATE_DIR/manifest.json [--extensions .arc,.bin] [--unknown skip|reject] [--max-files N] [--max-entries N] [--max-bytes N] [--strict-target] [--dry-run]';
}
function argumentsFrom(argv) {
  const opts = {};
  const options = new Set(['source', 'private-root', 'out', 'unknown', 'extensions', 'max-files', 'max-entries', 'max-bytes']);
  const flags = new Set(['strict-target', 'dry-run', 'help']);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].startsWith('--') ? argv[i].slice(2) : '';
    requireCondition((options.has(key) || flags.has(key)) && !Object.hasOwn(opts, key), 'INVALID_OPTION');
    if (flags.has(key)) opts[key] = true;
    else {
      requireCondition(i + 1 < argv.length && !argv[i + 1].startsWith('--'), 'MISSING_OPTION_VALUE');
      opts[key] = argv[++i];
    }
  }
  return opts;
}
export async function cli(argv) {
  const opts = argumentsFrom(argv);
  if (opts.help) { console.log(usage()); return; }
  if (!opts['dry-run']) requireCondition(opts['out'] && opts['private-root'], 'PRIVATE_OUTPUT_REQUIRED');
  const report = await buildManifest({
    source: opts.source, unknown: opts.unknown,
    extensions: opts.extensions ? opts.extensions.split(',') : ALLOWED_EXTENSIONS,
    maxFiles: opts['max-files'] ?? DEFAULT_LIMITS.maxFiles,
    maxEntries: opts['max-entries'] ?? DEFAULT_LIMITS.maxEntries,
    maxBytes: opts['max-bytes'] ?? DEFAULT_LIMITS.maxBytes
  });
  if (opts['strict-target']) requireCondition(report.inventory.identity.profileMatch, 'TARGET_PROFILE_MISMATCH');
  if (!opts['dry-run']) {
    await writePrivateManifest({ manifest: report.json, output: opts.out,
      privateRoot: opts['private-root'], sourceRoot: report.root });
  }
  // Do not leak original filenames, source paths, game contents, or manifest JSON to the console.
  console.log('OK: metadata-only; files=' + report.inventory.totals.indexedFiles
    + '; skipped=' + report.inventory.totals.ignoredFiles
    + '; bytes=' + report.inventory.totals.bytes
    + '; targetProfile=' + report.inventory.identity.profileMatch
    + '; sha256=' + report.digest);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).catch(error => {
    console.error('ASSET_INDEX_ERROR: ' + (error.code || 'UNEXPECTED_ERROR'));
    process.exitCode = 1;
  });
}
