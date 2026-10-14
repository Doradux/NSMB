import test from 'node:test';
import assert from 'node:assert/strict';
import { planPackages } from '../plan.mjs';

const valid = {
  schemaVersion: 1,
  entries: [
    { path: 'z/final.arc', extension: '.arc', bytes: '12' },
    { path: 'a/first.tpl', extension: '.tpl', bytes: '9' },
    { path: 'b/second.arc', extension: '.arc', bytes: '3' }
  ],
  totals: { bytes: '24' }
};

test('sorted grouping is reproducible irrespective of input order', () => {
  const a = planPackages(valid, { targetBytes: '12' });
  const b = planPackages({ ...valid, entries: [...valid.entries].reverse() }, { targetBytes: '12' });
  assert.deepEqual(a, b);
  assert.deepEqual(a.packs.map(p => p.bytes), ['12', '12']);
  assert.deepEqual(a.assignments.map(e => e.path), ['a/first.tpl', 'b/second.arc', 'z/final.arc']);
  assert.equal(a.totals.estimatedUncompressedPackBytes, String(24 + 3 * 64 + 2 * 128));
  assert.equal(a.packs[0].oversized, false);
});

test('single larger-than-target package is isolated and warned about', () => {
  const plan = planPackages(valid, { targetBytes: 10 });
  assert.deepEqual(plan.packs.map(p => p.bytes), ['9', '3', '12']);
  assert.equal(plan.packs[2].oversized, true);
});

test('unsafe traversal, paths, and unexpected extensions fail closed', () => {
  for (const name of ['../secret.arc', '/abs.arc', 'C:/drive.arc', 'dir//x.arc', 'dir/./x.arc',
    'dir/../x.arc', 'bad\\file.arc', 'CON.arc', 'bad?.arc']) {
    assert.throws(() => planPackages({ schemaVersion: 1,
      entries: [{ path: name, extension: '.arc', bytes: '1' }] }), /Error/);
  }
  assert.throws(() => planPackages({ schemaVersion: 1,
    entries: [{ path: 'private.rel', extension: '.rel', bytes: '1' }] }), /PACK_DISALLOWED_EXTENSION/);
});

test('corrupt totals and metadata, collisions and enormous totals are rejected', () => {
  assert.throws(() => planPackages({ ...valid, totals: { bytes: '999' } }), /PACK_TOTAL_MISMATCH/);
  assert.throws(() => planPackages({ ...valid, entries: [valid.entries[0], valid.entries[0]] }),
    /PACK_PATH_COLLISION/);
  assert.throws(() => planPackages({ ...valid, entries: [
    { path: 'a.arc', extension: '.arc', bytes: '-1' }] }), /PACK_INVALID_SIZE/);
  assert.throws(() => planPackages({ ...valid }, { targetBytes: '999999999999999999999999999999' }),
    /PACK_INVALID_TARGET/);
  assert.throws(() => planPackages(valid, { targetBytes: '1', maxPacks: 2 }), /PACK_TOO_MANY_PACKS/);
});
