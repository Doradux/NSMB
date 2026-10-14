import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import createModule from '../dist/frame_loop.mjs';
import { createFrameHost, GuestState } from '../host.mjs';

const wasm = fileURLToPath(new URL('../dist/frame_loop.wasm', import.meta.url));
async function fresh() {
  const module = await createModule({ locateFile: () => wasm });
  const call = (name, ...args) => {
    const fn = module['_nsmbw_' + name];
    assert.equal(typeof fn, 'function', 'Missing native Wasm export: ' + name);
    return fn(...args);
  };
  call('loop_reset');
  return { module, call };
}
function spawnThree(call) {
  for (const [id, address, value] of [
    [1, 0x80001000, 10], [2, 0x80002000, 20], [3, 0x80003000, 30]
  ]) {
    assert.equal(call('mem_write32', address, value), 1);
    assert.equal(call('loop_spawn', id, address, address + 16, id, 3), 1);
  }
}
const trace = (call) => Array.from(
  { length: call('loop_trace_length') },
  (_, i) => (call('loop_trace_at', i) >>> 16) & 0xFFFF
);

test('real Wasm 3 contexts interleave across capped frames, preserve guest registers and checked RAM', async () => {
  const { module, call } = await fresh();
  spawnThree(call);
  const host = createFrameHost(module, { ids: [1,2,3], budget: 2 });
  const a = host.frame();
  assert.equal(a.executed, 2);
  assert.deepEqual(a.contexts.map(x => x.pc), [1,1,0]);
  assert.deepEqual(trace(call), [1,2]);
  assert.equal(host.suspend(2), 1);
  const b = host.frame();
  assert.equal(b.executed, 2);
  assert.deepEqual(b.contexts.map(x => x.pc), [2,1,1]);
  assert.deepEqual(trace(call), [1,2,3,1]);
  assert.equal(host.resume(2), 1);
  const c = host.frame();
  assert.equal(c.executed, 2);
  assert.deepEqual(c.contexts.map(x => x.pc), [2,2,2]);
  assert.equal(call('loop_frame', 64), 3);
  const end = host.snapshot();
  assert.equal(end.done, 3);
  assert.deepEqual(end.contexts.map(x => x.regA), [13,26,39]);
  assert.deepEqual(end.contexts.map(x => x.yields), [2,2,2]);
  assert.deepEqual(trace(call), [1,2,3,1,2,3,1,2,3]);
  assert.deepEqual([1,2,3].map(id => call('mem_read32', 0x80000000 + id*0x1000 + 24)), [13,26,39]);
  host.dispose();
});

test('one failed guest MMIO does not roll back or corrupt other scheduled contexts', async () => {
  const { module, call } = await fresh();
  assert.equal(call('mem_write32', 0x80000000, 7), 1);
  assert.equal(call('mem_write32', 0x80001000, 9), 1);
  assert.equal(call('loop_spawn', 1, 0x80000000, 0xCC000000, 1, 3), 1);
  assert.equal(call('loop_spawn', 2, 0x80001000, 0x80001004, 4, 2), 1);
  const host = createFrameHost(module, { ids: [1, 2], budget: 1 });
  const first = host.frame();
  assert.equal(first.faulted, 1);
  assert.equal(first.contexts[0].pc, 0);
  assert.equal(first.contexts[0].guestError, 4);
  assert.equal(first.contexts[0].regA, 0);
  const second = host.frame();
  assert.equal(second.contexts[1].regA, 13);
  const third = host.frame();
  assert.equal(third.done, 1);
  assert.equal(third.contexts[1].regA, 17);
  assert.equal(call('mem_read32', 0x80001008), 17);
  assert.equal(call('mem_read32', 0x80000000), 7);
  assert.equal(host.frame().executed, 0);
  assert.equal(host.cancel(1), 1);
  assert.equal(host.snapshot().cancelled, 1);
  host.dispose();
});

test('checked sparse-memory budget failure faults one context and leaves others runnable', async () => {
  const { module, call } = await fresh();
  assert.equal(call('mem_set_page_budget', 1), 1);
  assert.equal(call('mem_write32', 0x80000004, 5), 1);
  assert.equal(call('loop_spawn', 1, 0x80000004, 0x80001000, 1, 2), 1);
  assert.equal(call('loop_spawn', 2, 0x80000004, 0x80000010, 3, 2), 1);
  const host = createFrameHost(module, { ids: [1,2], budget: 2 });
  assert.equal(host.frame().faulted, 1);
  assert.equal(host.snapshot().contexts[0].guestError, 3);
  assert.equal(call('mem_pages'), 1);
  assert.equal(host.frame().done, 1);
  assert.equal(call('mem_read32', 0x80000014), 11);
  assert.equal(call('mem_read32', 0x80001000), 0);
  host.dispose();
});

test('host-driven async frames suspend/resume/cancel without reentrant loops', async () => {
  const { module, call } = await fresh();
  spawnThree(call);
  const scheduled = [];
  let host;
  host = createFrameHost(module, {
    ids: [1,2,3], budget: 1, maxFrames: 20,
    requestFrame: callback => setImmediate(callback),
    cancelFrame: handle => clearImmediate(handle),
    onFrame: frame => {
      scheduled.push(frame.contexts.map(c => c.pc));
      if (frame.frames === 1) assert.equal(host.suspend(2), 1);
      if (frame.frames === 3) assert.equal(host.resume(2), 1);
      if (frame.frames === 4) assert.equal(host.cancel(3), 1);
    }
  });
  const pending = host.start();
  await assert.rejects(host.start(), /already running/);
  const outcome = await pending;
  assert.equal(outcome.reason, 'completed');
  assert.equal(outcome.done, 2);
  assert.equal(outcome.cancelled, 1);
  assert.equal(outcome.faulted, 0);
  assert.ok(scheduled.length >= 6 && scheduled.length < 20);
  assert.deepEqual(scheduled[0], [1,0,0]);
  assert.equal(outcome.contexts[0].regA, 13);
  assert.equal(outcome.contexts[1].regA, 26);
  assert.equal(outcome.contexts[2].pc, 1);
  host.dispose();
});

test('scheduler rejects runaway budgets, invalid transitions, missing IDs and stale host frames', async () => {
  const { module, call } = await fresh();
  assert.equal(call('loop_spawn', 1, 0x80000000, 0x80000004, 1, 1), 1);
  assert.equal(call('loop_resume', 1), 0);
  assert.equal(call('loop_error'), 3);
  assert.equal(call('loop_frame', 0), -2);
  assert.equal(call('loop_error'), 1);
  const host = createFrameHost(module, { ids: [1], budget: 1, maxFrames: 1 });
  assert.equal(host.frame().done, 1);
  assert.throws(() => host.frame(), /Frame limit/);
  assert.equal(host.cancel(1), 0);
  host.dispose();
  await assert.rejects(host.start(), /disposed/);
});

test('last guest operation MMIO failure never speculatively commits DONE or PC',async()=>{
  const { module, call } = await fresh();
  assert.equal(call('mem_write32',0x80000000,0x11),1);
  assert.equal(call('loop_spawn',7,0x80000000,0xCC008000,1,1),1);
  assert.equal(call('loop_spawn',8,0x80000000,0x80000004,2,1),1);
  const host=createFrameHost(module,{ids:[7,8],budget:1});
  assert.equal(host.frame().executed,1);
  assert.equal(call('loop_state',7),GuestState.FAULT);
  assert.equal(call('loop_pc',7),0,'denied FINAL instruction must not commit PC');
  assert.equal(call('loop_done'),0,'denied FINAL instruction must not mark DONE');
  assert.equal(call('loop_guest_error',7),4);
  assert.equal(host.resume(7),0,'MMIO faults cannot be resumed as benign waits');
  assert.equal(host.retryQuota(7),0,'MMIO faults cannot masquerade as quota retry');
  assert.equal(host.frame().done,1);
  assert.equal(call('loop_pc',8),1);
  assert.equal(call('mem_read32',0x80000004),0x13);
  assert.equal(call('mem_read32',0x80000000),0x11);
  assert.equal(host.snapshot().faulted,1);
  host.dispose();
});

test('host may explicitly retry page-quota fault after increasing sparse budget',async()=>{
  const { module, call }=await fresh();
  assert.equal(call('mem_set_page_budget',1),1);
  assert.equal(call('mem_write32',0x80000000,4),1);
  assert.equal(call('loop_spawn',5,0x80000000,0x80001000,6,1),1);
  const host=createFrameHost(module,{ids:[5],budget:1});
  assert.equal(host.frame().faulted,1);
  assert.equal(call('loop_pc',5),0);
  assert.equal(call('loop_done'),0);
  assert.equal(host.resume(5),0,'fault must not be resumed like ordinary pause');
  assert.equal(call('mem_set_page_budget',2),1,'explicit host quota change');
  assert.equal(host.retryQuota(5),1);
  const repaired=host.frame();
  assert.equal(repaired.done,1);
  assert.equal(repaired.contexts[0].pc,1);
  assert.equal(repaired.contexts[0].regA,10);
  assert.equal(call('mem_read32',0x80001000),10);
  assert.equal(call('mem_pages'),2);
  assert.equal(host.retryQuota(5),0,'DONE cannot be retried');
  host.dispose();
});
