import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const provided = process.env.NSMB_W03_HOST_ROOT;
const root = provided ? resolve(provided) : null;

async function load() {
  const folder = join(root, 'web-runtime', 'frame-host');
  const create = (await import(pathToFileURL(join(folder, 'dist', 'frame_loop.mjs')).href)).default;
  const instance = await create({
    locateFile: () => join(folder, 'dist', 'frame_loop.wasm')
  });
  const call = (name, ...args) => {
    const fn = instance['_nsmbw_' + name];
    assert.equal(typeof fn, 'function', 'Missing actual C++ wasm export nsmbw_' + name);
    return fn(...args);
  };
  return { instance, call };
}

test('128 synthetic sessions in ONE real linked W03/W07 wasm instance: no cross-context leaks', {
  skip: !root && 'Set NSMB_W03_HOST_ROOT to the reviewed linked W03 worktree'
}, async t => {
  const { instance, call: c } = await load();
  const start = performance.now();
  const byteLengths = [];
  let observedFaults = 0;
  for (let epoch = 0; epoch < 128; epoch++) {
    c('loop_reset');
    assert.equal(c('mem_pages'), 0, 'released all sparse guest data at cycle '+epoch);
    assert.equal(c('loop_state', 1), 0);
    assert.equal(c('loop_trace_length'), 0);
    assert.equal(c('loop_trace_dropped'), 0);
    assert.equal(c('mem_set_page_budget', 3), 1);
    for (const [id, src, value, dest, delta, limit] of [
      [1, 0x80001000, 10+epoch, 0x80001020, 1, 3],
      [2, 0x80002000, 20+epoch, 0x80002020, 2, 3],
      [3, 0x80003000, 30+epoch, 0xCC008000, 3, 1]
    ]) {
      assert.equal(c('mem_write32', src, value), 1);
      assert.equal(c('loop_spawn', id, src, dest, delta, limit), 1);
    }
    assert.equal(c('mem_pages'), 3);
    assert.deepEqual([0,1,2,3].map(() => c('loop_frame',2)), [2,2,2,1]);
    assert.equal(c('loop_frame',2), 0);
    assert.equal(c('loop_done'), 2);
    assert.equal(c('loop_faulted'), 1);
    assert.equal(c('loop_ready'), 0);
    assert.deepEqual([1,2,3].map(id => c('loop_pc',id)), [3,3,0]);
    assert.deepEqual([1,2,3].map(id => c('loop_reg_a',id)>>>0), [13+epoch,26+epoch,0]);
    assert.deepEqual([1,2,3].map(id => c('loop_guest_error',id)), [0,0,4]);
    assert.deepEqual([1,2,3].map(id => c('loop_yields',id)), [2,2,0]);
    assert.deepEqual(Array.from({length:c('loop_trace_length')},(_,i)=>c('loop_trace_at',i)>>>16),
      [1,2,3,1,2,1,2], 'deterministic scheduled instruction order');
    assert.equal(c('mem_read32',0x80001028), 13+epoch);
    assert.equal(c('mem_read32',0x80002028), 26+epoch);
    assert.equal(c('loop_retry_quota',3),0,'MMIO denied is never automatically retried');
    observedFaults++;
    if(instance.HEAPU8?.byteLength)byteLengths.push(instance.HEAPU8.byteLength);
  }
  c('loop_reset');
  assert.equal(c('mem_pages'),0);
  assert.equal(c('loop_trace_length'),0);
  if(byteLengths.length){
    const stable=byteLengths.slice(8);
    assert.ok(Math.max(...stable)-Math.min(...stable) <= 65536,
      'Wasm linear heap grew repeatedly after warm-up: '+JSON.stringify([...new Set(stable)]));
  }
  const duration = performance.now()-start;
  t.diagnostic(JSON.stringify({
    iterations:128,wasmGuestSteps:896,guestFaults:observedFaults,
    elapsedMs:Math.round(duration*1000)/1000,
    heapBytesObserved:byteLengths.length ? [Math.min(...byteLengths),Math.max(...byteLengths)] : 'not exposed',
    caveat:'Synthetic deterministic scalar Wasm benchmark, NOT game boot, memory-heap OOM, Wii frame rate or native stackful fibers'
  }));
});
