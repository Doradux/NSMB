import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildManifest, writePrivateManifest, AssetError } from '../index.mjs';

async function setup(t, options = {}) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'nsmb-assets-synthetic-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const source = path.join(base, 'source');
  const root = options.nested ? path.join(source, 'DATA') : source;
  const privateRoot = path.join(base, 'private');
  await mkdir(path.join(root, 'sys'), { recursive: true });
  await mkdir(path.join(root, 'files'), { recursive: true });
  await mkdir(privateRoot);
  const header = Buffer.alloc(options.truncated ? 4 : 8);
  header.write(options.id || 'SMNE01', 0, 'ascii');
  if (!options.truncated) header[7] = options.revision ?? 1;
  await writeFile(path.join(root, 'sys', 'boot.bin'), header);
  await writeFile(path.join(root, 'sys', 'fst.bin'), Buffer.from('synthetic-only'));
  return { base, source, root, privateRoot, files: path.join(root, 'files') };
}

function expectCode(code) {
  return error => error instanceof AssetError && error.code === code;
}

test('deterministic indexing, supported formats, exclusion and privacy-safe packaging estimate', async t => {
  const f = await setup(t, { nested: true });
  await mkdir(path.join(f.files, 'sub'));
  await writeFile(path.join(f.files, 'sub', 'second.tpl'), Buffer.alloc(23));
  await writeFile(path.join(f.files, 'first.arc'), Buffer.alloc(12));
  await writeFile(path.join(f.files, 'ignored.txt'), Buffer.alloc(50));
  const first = await buildManifest({ source: f.source });
  const second = await buildManifest({ source: f.source });
  assert.equal(first.json, second.json);
  assert.equal(first.digest, second.digest);
  assert.deepEqual(first.inventory.entries.map(e => e.path), ['first.arc', 'sub/second.tpl']);
  assert.equal(first.inventory.identity.region, 'USA');
  assert.equal(first.inventory.identity.revision, 1);
  assert.equal(first.inventory.identity.profileMatch, true);
  assert.equal(first.inventory.totals.bytes, '35');
  assert.equal(first.inventory.totals.ignoredFiles, '1');
  assert.equal(first.inventory.totals.estimatedRawPackageBytes, String(35 + 2 * 64));
  assert.equal(first.json.includes(f.base), false);
  const dest = path.join(f.privateRoot, 'out', 'manifest.json');
  await writePrivateManifest({ manifest: first.json, output: dest, privateRoot: f.privateRoot, sourceRoot: first.root });
  assert.equal(await readFile(dest, 'utf8'), first.json);
});

test('absent source and absent identity are rejected', async t => {
  const f = await setup(t);
  await assert.rejects(buildManifest({ source: path.join(f.base, 'absent') }), expectCode('MISSING_INPUT'));
  await rm(path.join(f.root, 'sys', 'boot.bin'));
  await assert.rejects(buildManifest({ source: f.source }), expectCode('MISSING_BOOT_HEADER'));
});

test('truncated and malformed identity headers fail closed', async t => {
  const f = await setup(t, { truncated: true });
  await assert.rejects(buildManifest({ source: f.source }), expectCode('CORRUPT_BOOT_HEADER'));
  await writeFile(path.join(f.root, 'sys', 'boot.bin'), Buffer.from([0, 2, 3, 4, 5, 6, 0, 1]));
  await assert.rejects(buildManifest({ source: f.source }), expectCode('CORRUPT_BOOT_HEADER'));
});

test('reject unknown type or skip by policy, never include executable-like files', async t => {
  const f = await setup(t);
  await writeFile(path.join(f.files, 'accepted.arc'), Buffer.alloc(1));
  await writeFile(path.join(f.files, 'blocked.rel'), Buffer.alloc(1));
  await writeFile(path.join(f.files, 'unknown.thing'), Buffer.alloc(1));
  const result = await buildManifest({ source: f.source });
  assert.equal(result.inventory.entries.length, 1);
  await assert.rejects(buildManifest({ source: f.source, unknown: 'reject' }), expectCode('DISALLOWED_EXTENSION'));
});

test('enormous total sizes, excessive files and directory entries fail', async t => {
  const f = await setup(t);
  await writeFile(path.join(f.files, 'one.arc'), Buffer.alloc(9));
  await writeFile(path.join(f.files, 'two.arc'), Buffer.alloc(9));
  await assert.rejects(buildManifest({ source: f.source, maxBytes: 12 }), expectCode('ASSET_TOTAL_TOO_LARGE'));
  await assert.rejects(buildManifest({ source: f.source, maxFiles: 1 }), expectCode('TOO_MANY_FILES'));
  await assert.rejects(buildManifest({ source: f.source, maxEntries: 1 }), expectCode('TOO_MANY_ENTRIES'));
  await assert.rejects(buildManifest({ source: f.source, maxBytes: 0 }), expectCode('INVALID_MAX_BYTES'));
});

test('private output cannot escape via parent traversal or symlink', async t => {
  const f = await setup(t);
  const report = await buildManifest({ source: f.source });
  await assert.rejects(writePrivateManifest({
    manifest: report.json, output: path.join(f.base, 'leak.json'), privateRoot: f.privateRoot, sourceRoot: report.root
  }), expectCode('OUTPUT_OUTSIDE_PRIVATE_ROOT'));
  await mkdir(path.join(f.privateRoot, '.git'));
  await assert.rejects(writePrivateManifest({
    manifest: report.json, output: path.join(f.privateRoot, 'no.json'),
    privateRoot: f.privateRoot, sourceRoot: report.root
  }), expectCode('PRIVATE_ROOT_INSIDE_GIT'));
  await rm(path.join(f.privateRoot, '.git'), { recursive: true });
  const link = path.join(f.privateRoot, 'escape');
  try {
    await symlink(f.files, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(writePrivateManifest({
      manifest: report.json, output: path.join(link, 'out.json'),
      privateRoot: f.privateRoot, sourceRoot: report.root
    }), error => error instanceof AssetError && ['OUTPUT_SYMLINK_ESCAPE', 'SYMLINK_NOT_ALLOWED'].includes(error.code));
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
  }
});

test('source symlink and linked asset entries fail closed', async t => {
  const f = await setup(t);
  const pathLink = path.join(f.files, 'link.arc');
  try {
    await symlink(path.join(f.root, 'sys', 'boot.bin'), pathLink, 'file');
    await assert.rejects(buildManifest({ source: f.source }), expectCode('SYMLINK_NOT_ALLOWED'));
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
  }
});

test('corrupted metadata cannot be silently accepted as a revision match', async t => {
  const f = await setup(t, { id: 'SMNP01', revision: 0 });
  const report = await buildManifest({ source: f.source });
  assert.equal(report.inventory.identity.region, 'Europe');
  assert.equal(report.inventory.identity.profileMatch, false);
  assert.equal(report.inventory.identity.revision, 0);
});

test('do not accidentally index private outputs inside source directory', async t => {
  const f = await setup(t);
  const report = await buildManifest({ source: f.source });
  await assert.rejects(writePrivateManifest({
    manifest: report.json, output: path.join(f.root, 'files', 'out.json'),
    privateRoot: f.privateRoot, sourceRoot: report.root
  }), expectCode('OUTPUT_OUTSIDE_PRIVATE_ROOT'));
});

test('malformed filename validation rejects reserved names and traversal', async () => {
  const { checkedName } = await import('../index.mjs');
  for (const unsafe of ['', '..', 'foo.', 'CON.arc', 'a/b.arc', 'a\\b.arc', 'bad?.arc', 'bad\u0000.arc']) {
    assert.throws(() => checkedName(unsafe), expectCode('INVALID_NAME'));
  }
});

test('a linked ancestor of source or private destination is forbidden', async t => {
  const f = await setup(t);
  const link = path.join(f.base, 'linked-parent');
  try {
    await symlink(f.base, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return;
    throw error;
  }
  await assert.rejects(buildManifest({ source: path.join(link, 'source') }),
    expectCode('SYMLINK_NOT_ALLOWED'));
  const manifest = await buildManifest({ source: f.source });
  await assert.rejects(writePrivateManifest({
    manifest: manifest.json, output: path.join(link, 'private', 'out.json'),
    privateRoot: path.join(link, 'private'), sourceRoot: manifest.root
  }), expectCode('SYMLINK_NOT_ALLOWED'));
});
