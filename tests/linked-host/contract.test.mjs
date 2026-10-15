import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const linkedRoot=resolve(process.env.NSMB_LINKED_ROOT || '.');
const folder=resolve(linkedRoot,'web-runtime/frame-host');
const wasmPath=resolve(folder,'dist/frame_loop.wasm');
const esmPath=resolve(folder,'dist/frame_loop.mjs');
const hostPath=resolve(folder,'host.mjs');
const guardPath=resolve(folder,'asyncify-guard.mjs');
const asyncPath=resolve(folder,'dist/asyncify_probe.mjs');
const asyncWasm=resolve(folder,'dist/asyncify_probe.wasm');
async function fresh({fixture=false}={}) {
  const selectedWasm=fixture?resolve(folder,'dist/frame_loop_fixture.wasm'):wasmPath;
  const selectedEsm=fixture?resolve(folder,'dist/frame_loop_fixture.mjs'):esmPath;
  assert.ok(existsSync(selectedEsm) && existsSync(selectedWasm),
    'missing compiled '+(fixture?'isolated typed-policy TEST fixture':'normal linked Wasm')+' under NSMB_LINKED_ROOT');
  assert.equal(readFileSync(selectedWasm).subarray(0,4).toString('hex'),'0061736d');
  const createModule=(await import(pathToFileURL(selectedEsm).href)).default;
  const module=await createModule({locateFile:()=>selectedWasm});
  const c=(name,...args)=>{
    const method=module['_nsmbw_'+name];
    assert.equal(typeof method,'function','Missing actual linked-Wasm export '+name);
    return method(...args);
  };
  c('loop_reset');
  return {module,c};
}
test('one actual Wasm instance links scheduler, checked W07 memory and per-context guest registers',async()=>{
 const {c,module}=await fresh();
 assert.equal(module._nsmbw_mem_write32(0x80000000,0),1);
 assert.equal(c('loop_spawn',1,0x80000000,0x80000010,1,2),1);
 assert.equal(c('loop_spawn',2,0x80000000,0x80000030,2,2),1);
 assert.equal(c('loop_spawn',3,0x80000000,0xCC008000,3,1),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_pc',1),1);
 assert.equal(c('loop_reg_a',1),1);
 assert.equal(c('mem_read32',0x80000010),1,'0 source is legal, no implicit failure');
 assert.equal(c('loop_frame',2),2);
 assert.equal(c('loop_pc',3),0,'denied last guest op must not commit PC');
 assert.equal(c('loop_state',3),4);
 assert.equal(c('loop_guest_error',3),4);
 assert.equal(c('loop_done'),0);
 assert.equal(c('loop_frame',64),2);
 assert.equal(c('loop_done'),2);
 assert.equal(c('loop_reg_a',1),2);
 assert.equal(c('loop_reg_a',2),4);
 assert.equal(c('loop_retry_quota',3),0,'device denial is not retryable');
});
test('typed W07 status 5/6 faults the correct context in a TEST-ONLY linked Wasm fixture',async()=>{
 const normal=await fresh();
 assert.equal(typeof normal.module._nsmbw_test_policy_install,'undefined',
   'normal single-Wasm build MUST NOT ship fake MMIO test callback exports');
 const {c,module}=await fresh({fixture:true});
 const install=module._nsmbw_test_policy_install;
 const rejection=module._nsmbw_test_policy_rejection;
 assert.equal(typeof install,'function','joined TEST-ONLY fixture must expose synthetic MMIO policy installation');
 assert.equal(typeof rejection,'function','joined TEST-ONLY fixture must expose callback reject/malformed control');
 assert.equal(c('mem_write32',0x80000000,1),1);
 install(3);
 rejection(1); // synthetic handler reports denied operation -> guest error 5
 assert.equal(c('loop_spawn',11,0xCC000000,0x80000010,1,1),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',11),4);
 assert.equal(c('loop_pc',11),0);
 assert.equal(c('loop_guest_error',11),5);
 assert.equal(c('loop_retry_quota',11),0);
 rejection(2); // malformed handler -> 6
 assert.equal(c('loop_spawn',12,0x80000000,0xCC008000,1,1),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',12),4);
 assert.equal(c('loop_pc',12),0);
 assert.equal(c('loop_guest_error',12),6);
 assert.equal(c('loop_retry_quota',12),0);
});
test('quota-only retry commits PC exactly once after explicit budget change',async()=>{
 const {c}=await fresh();
 assert.equal(c('mem_set_page_budget',1),1);
 assert.equal(c('mem_write32',0x80000000,12),1);
 assert.equal(c('loop_spawn',5,0x80000000,0x80001000,2,1),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_pc',5),0);
 assert.equal(c('loop_state',5),4);
 assert.equal(c('loop_guest_error',5),3);
 assert.equal(c('mem_read32',0x80001000),0);
 assert.equal(c('mem_set_page_budget',2),1);
 assert.equal(c('loop_retry_quota',5),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_done'),1);
 assert.equal(c('loop_pc',5),1);
 assert.equal(c('loop_reg_a',5),14);
 assert.equal(c('mem_read32',0x80001000),14);
 assert.equal(c('loop_retry_quota',5),0);
});
test('128 resets, pause/resume, cancellation, failure and reaps stay bounded',async()=>{
 const {c}=await fresh();
 for(let cycle=0;cycle<128;cycle++){
   c('loop_reset');
   assert.equal(c('loop_trace_length'),0);
   assert.equal(c('loop_spawn',1,0x80000000,0x80000004,1,2),1);
   assert.equal(c('loop_spawn',2,0x80000000,0xCC008000,1,1),1);
   assert.equal(c('loop_spawn',3,0x80000000,0x80000020,1,2),1);
   assert.equal(c('loop_suspend',3),1);
   assert.equal(c('loop_frame',2),2);
   assert.equal(c('loop_guest_error',2),4);
   assert.equal(c('loop_pc',2),0);
   assert.equal(c('loop_resume',3),1);
   assert.equal(c('loop_cancel',2),1);
   assert.equal(c('loop_frame',64),3);
   assert.equal(c('loop_done'),2);
   assert.equal(c('loop_cancelled'),1);
   assert.equal(c('loop_trace_length'),5);
   for(let id=1;id<=3;id++)assert.equal(c('loop_reap',id),1);
   assert.equal(c('loop_ready'),0);
   assert.equal(c('loop_trace_length'),5);
 }
});
test('single-instance Asyncify guard rejects concurrent unwind and allows safe later entry',async()=>{
 assert.ok(existsSync(asyncWasm)&&existsSync(asyncPath));
 const module=await (await import(pathToFileURL(asyncPath).href)).default({locateFile:()=>asyncWasm});
 const {createExclusiveAsyncifyCaller}=await import(pathToFileURL(guardPath).href);
 const exclusive=createExclusiveAsyncifyCaller(module);
 module._nsmbw_async_reset();
 const first=exclusive.call('nsmbw_async_nested_probe','number',['number'],[10]);
 await assert.rejects(exclusive.call('nsmbw_async_nested_probe','number',['number'],[20]),/overlapping calls rejected/);
 assert.equal(await first,83);
 assert.equal(exclusive.busy,false);
 module._nsmbw_async_reset();
 assert.equal(await exclusive.call('nsmbw_async_nested_probe','number',['number'],[12]),95);
});
test('host rejects initial requestFrame throw and stale callback after cancellation',async()=>{
 const {c,module}=await fresh();
 const {createFrameHost}=await import(pathToFileURL(hostPath).href);
 assert.equal(c('loop_spawn',3,0x80000000,0x80000004,1,1),1);
 let rejectFrame=true;
 const queue=[];
 const host=createFrameHost(module,{ids:[3],budget:1,
    requestFrame:callback=>{if(rejectFrame){rejectFrame=false;throw Error('RAF_DENIED')}queue.push(callback);return queue.length;},
    cancelFrame:()=>{throw Error('CANCEL_DENIED')}});
 await assert.rejects(host.start(),/RAF_DENIED/);
 assert.equal(host.running,false);
 const first=host.start();host.stop();
 assert.equal((await first).reason,'paused');
 const next=host.start();
 queue[0]();
 assert.equal(c('loop_pc',3),0);
 queue[1]();
 assert.equal((await next).reason,'completed');
 assert.equal(c('loop_trace_length'),1);
 host.dispose();
});

test('onFrame wake-up prevents premature blocked stop',async()=>{
 const {module,c}=await fresh();
 c('mem_write32',0x80000000,0);
 c('mem_write32',0x80001000,3);
 c('loop_spawn',1,0x80000000,0x80000010,1,2);
 c('loop_spawn',2,0x80001000,0x80001010,2,2);
 c('loop_spawn',3,0x80000000,0xCC008000,3,1);
 const {createFrameHost}=await import(pathToFileURL(hostPath).href);
 let host;
 host=createFrameHost(module,{ids:[1,2,3],budget:1,maxFrames:16,
   requestFrame:callback=>setImmediate(callback),
   cancelFrame:handle=>clearImmediate(handle),
   onFrame:frame=>{
     if(frame.frames===1)assert.equal(host.suspend(2),1);
     if(frame.frames===3){
       assert.equal(host.resume(2),1);
       assert.equal(host.cancel(3),1);
     }
   }});
 const result=await host.start();
 const current=host.snapshot();
 assert.equal(result.reason,'completed',
   'stale pre-onFrame ready='+result.ready+' prematurely stopped with reason='+result.reason+
   ' while live snapshot ready='+current.ready);
 assert.equal(result.frames,5,'resumed context must receive two additional turns');
 assert.equal(result.done,2);
 assert.equal(result.cancelled,1);
 host.dispose();
});

test('MMIO side effects cannot be replayed while a separate RAM-only quota fault can retry',async()=>{
 const {c,module}=await fresh({fixture:true});
 assert.equal(c('mem_set_page_budget',0),1);
 c('test_policy_install',1);
 assert.equal(c('loop_spawn',31,0xCC000000,0x80001000,1,1),1);
 assert.equal(c('loop_spawn',32,0x80000000,0x80002000,2,1),1);
 assert.equal(c('loop_frame',2),2);
 assert.equal(c('loop_pc',31),0);
 assert.equal(c('loop_pc',32),0);
 assert.equal(c('loop_state',31),4);
 assert.equal(c('loop_state',32),4);
 assert.equal(c('loop_guest_error',31),3);
 assert.equal(c('loop_guest_error',32),3);
 assert.equal(c('loop_retry_safe',31),0,'MMIO read has observable external callback side effect');
 assert.equal(c('loop_retry_safe',32),1,'RAM-only failed allocation has no device side effect');
 assert.equal(c('test_policy_calls'),1);
 assert.equal(c('mem_pages'),0);
 assert.equal(c('mem_set_page_budget',1),1);
 assert.equal(c('loop_retry_quota',31),0,'MMIO source MUST NOT be replayed');
 assert.equal(c('loop_retry_quota',32),1,'independent RAM-only instruction is safe to retry');
 assert.equal(c('loop_frame',2),1);
 assert.equal(c('loop_pc',31),0);
 assert.equal(c('loop_pc',32),1);
 assert.equal(c('loop_reg_a',32),2);
 assert.equal(c('loop_state',32),3);
 assert.equal(c('mem_read32',0x80002000),2);
 assert.equal(c('test_policy_calls'),1,'MMIO callback must be invoked exactly once');
 assert.equal(c('mem_pages'),1);
});
