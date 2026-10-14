import test from 'node:test';
import assert from 'node:assert/strict';
import create from '../dist/checked_interop_fixture.mjs';
import { fileURLToPath } from 'node:url';
const wasm=fileURLToPath(new URL('../dist/checked_interop_fixture.wasm',import.meta.url));
const fresh=async()=>{
 const mod=await create({locateFile:()=>wasm});
 const call=(key,...args)=>{
  const fn=mod['_nsmbw_'+key];
  assert.equal(typeof fn,'function','missing C++ Wasm export '+key);
  return fn(...args);
 };
 call('interop_reset');
 return call;
};
test('status ABI 0..6 preserved, callback-entry flag distinguishes denied from invoked device',async()=>{
 const c=await fresh();
 assert.equal(c('interop_write8',0xCC008000,0x12),0);
 assert.equal(c('interop_status'),4);
 assert.equal(c('interop_device_invoked'),0);
 assert.equal(c('interop_retry_safe'),1);
 c('test_policy_install',3);
 assert.equal(c('interop_read8',0xCC000000),0x78);
 assert.equal(c('interop_status'),0);
 assert.equal(c('interop_device_invoked'),1);
 assert.equal(c('interop_retry_safe'),0);
 assert.equal(c('interop_write8',0x80000000,0x12),1);
 assert.equal(c('interop_device_invoked'),0,'RAM write clears callback marker');
 assert.equal(c('interop_retry_safe'),1);
 c('test_policy_rejection',1);
 assert.equal(c('interop_write16',0xCC008000,0x1234),0);
 assert.equal(c('interop_status'),5);
 assert.equal(c('interop_retry_safe'),0,'handler might already have side effects before rejection');
 c('test_policy_rejection',2);
 assert.equal(c('interop_read32',0xCC000000),0);
 assert.equal(c('interop_status'),6);
 assert.equal(c('interop_device_invoked'),1);
});
test('MMIO read can have a side effect BEFORE later RAM quota failure: host must refuse retry',async()=>{
 const c=await fresh();
 c('test_policy_install',1);
 assert.equal(c('mem_set_page_budget',0),1);
 assert.equal(c('interop_step',0xCC000000,0x80001000,3),0);
 assert.equal(c('interop_status'),3,'guest store fails after device callback ran');
 assert.equal(c('interop_device_invoked'),1,'callback side effects may have happened');
 assert.equal(c('interop_retry_safe'),0,'blind retry would call device AGAIN');
 assert.equal(c('test_policy_calls'),1);
 // Simulate host scheduler fault-policy choice. It must halt instead of replay.
 const runnable=c('interop_status')===3 && c('interop_retry_safe')===1;
 if(runnable)c('interop_step',0xCC000000,0x80001000,3);
 assert.equal(c('test_policy_calls'),1,'host policy made no duplicate call');
 assert.equal(c('mem_pages'),0);
});
test('ordinary RAM-only quota failure remains retryable after host page-budget increase',async()=>{
 const c=await fresh();
 assert.equal(c('mem_set_page_budget',0),1);
 assert.equal(c('interop_step',0x80000000,0x80001000,7),0);
 assert.equal(c('interop_status'),3);
 assert.equal(c('interop_retry_safe'),1);
 assert.equal(c('interop_device_invoked'),0);
 assert.equal(c('mem_set_page_budget',1),1);
 assert.equal(c('interop_step',0x80000000,0x80001000,7),1);
 assert.equal(c('interop_status'),0);
 assert.equal(c('mem_read32',0x80001000),7);
});
test('reentrant MMIO callback is blocked and outer reply cannot mask violation',async()=>{
 const c=await fresh();
 c('test_policy_install',1);
 c('test_policy_rejection',4);
 assert.equal(c('interop_read32',0xCC000000),0);
 assert.equal(c('interop_status'),6);
 assert.equal(c('interop_device_invoked'),1);
 assert.equal(c('test_policy_calls'),1,'nested dispatch must not call callback again');
 c('test_policy_rejection',0);
 assert.equal(c('interop_read32',0xCC000000)>>>0,0x12345678);
 assert.equal(c('interop_status'),0,'reentrancy guard releases after fault');
});
test('callback registry mutation during callback is rejected and handler remains installed',async()=>{
 const c=await fresh();
 c('test_policy_install',1);
 c('test_policy_rejection',5);
 assert.equal(c('interop_read32',0xCC000000),0);
 assert.equal(c('interop_status'),6);
 assert.equal(c('interop_retry_safe'),0);
 c('test_policy_rejection',0);
 assert.equal(c('interop_read32',0xCC000000)>>>0,0x12345678);
 assert.equal(c('test_policy_calls'),2,'handler was never unregistered');
});
test('bounded device event log preserves callback/interrupt-like sequence and drops overflow',async()=>{
 const c=await fresh();
 c('test_policy_install',3);
 assert.equal(c('interop_read16',0xCC000020),0x5678);
 assert.equal(c('interop_write32',0xCC008000,0xDEADBEEF),1);
 assert.equal(c('test_policy_event_at',0),(1<<16)|(1<<8)|2);
 assert.equal(c('test_policy_event_at',1),(2<<16)|(2<<8)|4);
 for(let i=0;i<65;i++)c('interop_read8',0xCC000000);
 assert.equal(c('test_policy_events'),64);
 assert.equal(c('test_policy_dropped'),3);
});
test('128 callback attach/reset cycles clear handler, RAM and last-effect flag',async()=>{
 const c=await fresh();
 assert.equal(c('mem_set_page_budget',1),1);
 for(let i=0;i<128;i++){
   c('test_policy_install',3);
   assert.equal(c('interop_read8',0xCC000000),0x78);
   assert.equal(c('interop_device_invoked'),1);
   assert.equal(c('interop_write32',0x80000000,i),1);
   c('interop_reset');
   assert.equal(c('interop_status'),0);
   assert.equal(c('interop_device_invoked'),0);
   assert.equal(c('interop_retry_safe'),1);
   assert.equal(c('mem_pages'),0);
   assert.equal(c('interop_read8',0xCC000000),0);
   assert.equal(c('interop_status'),4);
   assert.equal(c('interop_device_invoked'),0);
 }
});
test('real Wasm fixed two-page memory budget and injected MMIO errors do not corrupt RAM',async()=>{
 const c=await fresh();
 c('test_policy_install',3);
 assert.equal(c('mem_set_page_budget',1),1);
 assert.equal(c('interop_write8',0x80000FFF,0xA7),1);
 c('test_policy_rejection',6);
 const before=c('test_policy_calls');
 assert.equal(c('interop_step',0xCC000000,0x80000FFE,1),0);
 assert.equal(c('interop_status'),5);
 assert.equal(c('interop_retry_safe'),0);
 assert.equal(c('test_policy_calls'),before+1);
 assert.equal(c('mem_read8',0x80000FFF),0xA7);
 assert.equal(c('mem_pages'),1);
});
