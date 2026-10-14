import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import createScheduler from '../dist/scheduler.mjs';

const wasm = fileURLToPath(new URL('../dist/scheduler.wasm', import.meta.url));
async function fresh() {
  const module = await createScheduler({ locateFile: () => wasm });
  const api = (name, ...args) => module['_nsmbw_sched_' + name](...args);
  api('reset');
  return api;
}

test('round-robin fairness with eight runnable contexts and bounded traces', async () => {
  const c = await fresh();
  for (let id = 1; id <= 8; id++) assert.equal(c('spawn', id, 32), 1);
  assert.equal(c('run_budget', 1024), 256, 'must stop without over-reading bounded trace');
  assert.equal(c('trace_length'), 256);
  assert.equal(c('done'), 8);
  for (let n = 0; n < 256; n++) {
    const id = (n % 8) + 1;
    const pc = Math.floor(n / 8) + 1;
    assert.equal(c('trace_at', n), (id << 8) | pc, 'fair dispatch at event ' + n);
  }
  assert.equal(c('run_budget', 1024), 0);
  assert.equal(c('error'), 0);
});

test('pausing every runnable context returns promptly and preserves exact PCs', async () => {
  const c = await fresh();
  for (const id of [3, 5, 7, 9]) assert.equal(c('spawn', id, 32), 1);
  assert.equal(c('run_budget', 7), 7);
  const before = [3, 5, 7, 9].map(id => c('pc', id));
  for (const id of [3, 5, 7, 9]) assert.equal(c('suspend', id), 1);
  for (let i = 0; i < 100; i++) {
    assert.equal(c('step'), -1);
    assert.equal(c('run_budget', 1024), 0);
  }
  assert.deepEqual([3, 5, 7, 9].map(id => c('pc', id)), before);
  assert.equal(c('trace_length'), 7);
  for (const id of [3, 5, 7, 9]) assert.equal(c('resume', id), 1);
  assert.equal(c('run_budget', 1024), 121);
  assert.equal(c('done'), 4);
});

test('invalid transitions leave the visible task and trace unchanged', async () => {
  const c = await fresh();
  assert.equal(c('spawn', 44, 3), 1);
  assert.equal(c('step'), 44);
  const snap = [c('pc', 44), c('value', 44), c('trace_length')];
  assert.equal(c('resume', 44), 0, 'ready task is not suspended');
  assert.equal(c('error'), 3);
  assert.equal(c('suspend', 999), 0, 'missing task');
  assert.equal(c('error'), 3);
  assert.equal(c('spawn', 44, 3), 0, 'duplicate ID');
  assert.equal(c('error'), 1);
  assert.deepEqual([c('pc', 44), c('value', 44), c('trace_length')], snap);
  assert.equal(c('suspend', 44), 1);
  assert.equal(c('suspend', 44), 0);
  assert.equal(c('error'), 3);
  assert.equal(c('resume', 44), 1);
  assert.equal(c('step'), 44);
  assert.equal(c('step'), 44);
  assert.equal(c('resume', 44), 0, 'completed task cannot be restarted');
  assert.equal(c('error'), 3);
});
