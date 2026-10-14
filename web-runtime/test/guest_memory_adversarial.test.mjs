import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import createGuestMemory from '../dist/guest_memory.mjs';

const wasmPath = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/guest_memory.wasm');

async function backend() {
  const instance = await createGuestMemory({ locateFile: () => wasmPath });
  const call = (name, ...args) => instance['_nsmbw_mem_' + name](...args);
  return { call, instance };
}
test('guest memory exposes a bounded sparse-page budget', async () => {
  const { call, instance } = await backend();
  assert.equal(typeof instance._nsmbw_mem_set_page_budget, 'function',
    'Missing page budget: uncontrolled sparse guest writes can exhaust browser memory');
  call('reset');
  assert.equal(call('set_page_budget', 1), 1);
  assert.equal(call('write8', 0x80000000, 0xA5), 1);
  assert.equal(call('pages'), 1);
  assert.equal(call('write8', 0x80001000, 0xCD), 0);
  assert.equal(call('error'), 3, 'page budget exhaustion should be a recoverable allocation error');
  assert.equal(call('read8', 0x80000000), 0xA5, 'old resident pages remain accessible');
  assert.equal(call('read8', 0x80001000), 0, 'unallocated pages still read as zero');
  assert.equal(call('pages'), 1);
});
test('failed cross-page write does not partially commit or allocate pages', async () => {
  const { call } = await backend();
  call('reset');
  assert.equal(call('set_page_budget', 1), 1);
  assert.equal(call('write32', 0x80000FFF, 0xDEADBEEF), 0);
  assert.equal(call('error'), 3);
  assert.equal(call('pages'), 0, 'must not leave an empty first page on failure');
  assert.equal(call('read32', 0x80000FFF), 0, 'must not change guest memory on failure');
  assert.equal(call('set_page_budget', 2), 1);
  assert.equal(call('write32', 0x80000FFF, 0xDEADBEEF), 1);
  assert.equal(call('pages'), 2);
  assert.equal(call('read32', 0xC0000FFF) >>> 0, 0xDEADBEEF);
});
test('failed cross-page write preserves pre-existing bytes, status and limits', async () => {
  const { call } = await backend();
  call('reset');
  assert.equal(call('set_page_budget', 1), 1);
  assert.equal(call('write8', 0x80000FFF, 0x72), 1);
  assert.equal(call('write32', 0x80000FFE, 0xAABBCCDD), 0);
  assert.equal(call('error'), 3);
  assert.equal(call('read8', 0x80000FFF), 0x72);
  assert.equal(call('pages'), 1);
  assert.equal(call('set_page_budget', 0), 0, 'cannot lower budget below active allocations');
  assert.equal(call('error'), 4);
  assert.equal(call('pages'), 1);
  assert.equal(call('set_page_budget', 38913), 0, 'cannot grant more than physically mapped pages');
  assert.equal(call('error'), 4);
});
test('invalid boundary and MMIO stores are all-or-nothing', async () => {
  const { call } = await backend();
  call('reset');
  assert.equal(call('write8', 0x817FFFFF, 0x78), 1);
  assert.equal(call('write32', 0x817FFFFE, 0x11223344), 0);
  assert.equal(call('error'), 1);
  assert.equal(call('read8', 0x817FFFFF), 0x78);
  assert.equal(call('write8', 0xCC000000, 0x55), 0);
  assert.equal(call('error'), 1);
  assert.equal(call('write32', 0xFFFFFFFE, 0x12345678), 0);
  assert.equal(call('error'), 2);
  assert.equal(call('read8', 0x00000000), 0);
});
test('MEM2 aliasing counts unique physical pages and zeroes on reset', async () => {
  const { call } = await backend();
  call('reset');
  assert.equal(call('set_page_budget', 1), 1);
  assert.equal(call('write32', 0x90001FFE, 0x11223344), 0);
  assert.equal(call('error'), 3);
  assert.equal(call('pages'), 0);
  assert.equal(call('write8', 0x90001000, 0x8D), 1);
  assert.equal(call('read8', 0xD0001000), 0x8D);
  assert.equal(call('read8', 0x10001000), 0x8D);
  assert.equal(call('pages'), 1, 'cached/uncached and physical mirrors share allocation');
  call('reset');
  assert.equal(call('pages'), 0);
  assert.equal(call('read8', 0x90001000), 0);
});
