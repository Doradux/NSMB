import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import createFrameModule from '../dist/frame_loop.mjs';
import createAsyncProbe from '../dist/asyncify_probe.mjs';
import { createFrameHost } from '../host.mjs';
import { createExclusiveAsyncifyCaller } from '../asyncify-guard.mjs';

const path = name => fileURLToPath(new URL('../dist/' + name + '.wasm', import.meta.url));
const make = async () => {
  const wasm=await createFrameModule({locateFile:()=>path('frame_loop')});
  const call=(name,...args)=>wasm['_nsmbw_'+name](...args);
  call('loop_reset');
  return {wasm,call};
};

test('reap DONE, CANCELLED and FAULT slots; deny reclaiming active or paused context',async()=>{
  const {call}=await make();
  for(let id=1;id<=8;id++)assert.equal(call('loop_spawn',id,0x80000000,0x80000004,1,1),1);
  assert.equal(call('loop_spawn',9,0x80000000,0x80000004,1,1),0);
  assert.equal(call('loop_error'),2);
  assert.equal(call('loop_reap',1),0);
  assert.equal(call('loop_error'),3);
  assert.equal(call('loop_suspend',1),1);
  assert.equal(call('loop_reap',1),0);
  assert.equal(call('loop_resume',1),1);
  assert.equal(call('loop_frame',8),8);
  assert.equal(call('loop_done'),8);
  assert.equal(call('loop_reap',1),1);
  assert.equal(call('loop_spawn',9,0x80000000,0x80000008,2,1),1);
  assert.equal(call('loop_frame',1),1);
  assert.equal(call('loop_state',9),3);
  assert.equal(call('loop_reap',9),1);
  assert.equal(call('loop_reap',9),0);
  assert.equal(call('loop_error'),3);
  assert.equal(call('loop_trace_length'),9, 'history survives slot reuse');
});

test('host explicit stop and next start do not duplicate work or lose per-context PC',async()=>{
  const {wasm,call}=await make();
  call('mem_write32',0x80001000,10);
  call('loop_spawn',7,0x80001000,0x80001010,1,4);
  let host;
  host=createFrameHost(wasm,{
    ids:[7],budget:1,
    requestFrame:callback=>setImmediate(callback),
    cancelFrame:id=>clearImmediate(id),
    onFrame:frame=>{if(frame.frames===2)host.stop('manual-pause');}
  });
  const partial=await host.start();
  assert.equal(partial.reason,'manual-pause');
  assert.equal(partial.contexts[0].pc,2);
  assert.equal(partial.contexts[0].regA,12);
  const result=await host.start();
  assert.equal(result.reason,'completed');
  assert.equal(result.contexts[0].pc,4);
  assert.equal(result.contexts[0].regA,14);
  assert.equal(call('loop_trace_length'),4);
  host.dispose();
});

test('guard rejects concurrent Asyncify calls BEFORE reentering real Wasm, and unlocks after settlement',async()=>{
  const module=await createAsyncProbe({locateFile:()=>path('asyncify_probe')});
  module._nsmbw_async_reset();
  const guard=createExclusiveAsyncifyCaller(module);
  const first=guard.call('nsmbw_async_nested_probe','number',['number'],[10]);
  assert.equal(guard.busy,true);
  await assert.rejects(guard.call('nsmbw_async_nested_probe','number',['number'],[12]),
    /overlapping calls rejected/);
  assert.equal(await first,83);
  assert.equal(module._nsmbw_async_phase(),2);
  assert.equal(guard.busy,false);
  module._nsmbw_async_reset();
  assert.equal(await guard.call('nsmbw_async_nested_probe','number',['number'],[12]),95);
  assert.equal(guard.busy,false);
});

test('host refuses reentrant or concurrent manual frame dispatch, preserving the frame budget',async()=>{
  const {wasm,call}=await make();
  call('loop_spawn',1,0x80000000,0x80000004,1,3);
  let host;
  let violations=0;
  host=createFrameHost(wasm,{
    ids:[1],budget:1,maxFrames:3,
    requestFrame:callback=>setImmediate(callback),
    cancelFrame:id=>clearImmediate(id),
    onFrame:()=>{
      assert.throws(()=>host.frame(),/Manual dispatch while frame host running/);
      violations++;
    }
  });
  const running=host.start();
  assert.throws(()=>host.frame(),/Manual dispatch while frame host running/);
  const completed=await running;
  assert.equal(completed.reason,'completed');
  assert.equal(completed.frames,3);
  assert.equal(violations,3);
  assert.equal(call('loop_trace_length'),3);
  host.dispose();
});

test('task IDs exceeding the 16-bit diagnostic trace ABI are rejected',async()=>{
  const {wasm,call}=await make();
  assert.equal(call('loop_spawn',65536,0x80000000,0x80000004,0,1),0);
  assert.equal(call('loop_error'),1);
  assert.throws(()=>createFrameHost(wasm,{ids:[65536]}),/positive integer guest ID/);
});

test('bounded 256-event history survives recycling without exhausted scheduling',async()=>{
  const {call}=await make();
  for(let id=1;id<=8;id++)assert.equal(call('loop_spawn',id,0x80000000,0x80000004,1,32),1);
  assert.equal(call('loop_frame',64),64);
  assert.equal(call('loop_frame',64),64);
  assert.equal(call('loop_frame',64),64);
  assert.equal(call('loop_frame',64),64);
  assert.equal(call('loop_done'),8);
  assert.equal(call('loop_trace_length'),256);
  assert.equal(call('loop_trace_dropped'),0);
  for(let id=1;id<=8;id++)assert.equal(call('loop_reap',id),1);
  assert.equal(call('loop_spawn',9,0x80000000,0x80000008,1,1),1);
  assert.equal(call('loop_frame',1),1);
  assert.equal(call('loop_trace_length'),256);
  assert.equal(call('loop_trace_dropped'),1);
  assert.equal(call('loop_trace_at',0)>>>16,2,'oldest event evicted');
  assert.equal(call('loop_trace_at',255)>>>16,9,'latest event preserved');
  assert.equal(call('loop_state',9),3);
});
