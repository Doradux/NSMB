import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import createNormal from '../dist/frame_loop.mjs';
import createFixture from '../dist/frame_loop_fixture.mjs';

const wasm = type => fileURLToPath(new URL('../dist/'+type+'.wasm',import.meta.url));
async function fresh(factory,type) {
  const instance=await factory({locateFile:()=>wasm(type)});
  const call=(name,...args)=>{
    const fn=instance['_nsmbw_'+name];
    assert.equal(typeof fn,'function','Missing actual linked Wasm export: '+name);
    return fn(...args);
  };
  call('loop_reset');
  return {instance,call};
}
const spawn=(c,id,src,dst,delta=1,limit=1)=>{
  assert.equal(c('loop_spawn',id,src,dst,delta,limit),1);
};

test('normal joined production diagnostic has NO mock handlers and fails MMIO/GX closed with code 4',async()=>{
  const {instance,call:c}=await fresh(createNormal,'frame_loop');
  assert.equal(typeof instance._nsmbw_test_policy_install,'undefined',
    'test-only device callback accidentally exported in normal runtime');
  c('mem_write32',0x80000000,9);
  spawn(c,1,0x80000000,0xCC008000);
  spawn(c,2,0x80000000,0x80000004,3);
  assert.equal(c('loop_frame',2),2);
  assert.equal(c('loop_state',1),4);
  assert.equal(c('loop_pc',1),0,'denied final instruction MUST NOT be committed');
  assert.equal(c('loop_guest_error',1),4);
  assert.equal(c('loop_state',2),3);
  assert.equal(c('loop_reg_a',2),12);
  assert.equal(c('mem_read32',0x80000004),12);
  assert.equal(c('loop_retry_quota',1),0,'MMIO denied cannot retry as allocation');
});

for(const [mode,expected] of [[1,5],[2,6]]) {
  test('W07 fixture '+(expected===5?'handler rejects':'handler returns malformed reply')+
       '; error '+expected+' is isolated to dispatched guest',async()=>{
    const {call:c}=await fresh(createFixture,'frame_loop_fixture');
    c('mem_write32',0x80000000,7);
    c('test_policy_install',3);
    c('test_policy_rejection',mode);
    spawn(c,1,0x80000000,0xCC008000,1,1);
    spawn(c,2,0x80000000,0x80000004,3,1);
    assert.equal(c('loop_frame',2),2);
    assert.equal(c('loop_guest_error',1),expected);
    assert.equal(c('loop_state',1),4);
    assert.equal(c('loop_pc',1),0,'fault before COMMIT');
    assert.equal(c('loop_reg_a',1),0,'fault never updates register');
    assert.equal(c('loop_state',2),3);
    assert.equal(c('loop_pc',2),1);
    assert.equal(c('loop_reg_a',2),10);
    assert.equal(c('mem_read32',0x80000004),10);
    assert.equal(c('test_policy_calls'),1,'invalid callback invoked exactly once');
    assert.equal(c('test_policy_last_region'),2,'GX FIFO typed policy selected');
    assert.equal(c('loop_retry_quota',1),0,'device failure never quota-retried');
    assert.equal(c('loop_error'),3);
  });
}

test('test fixture MMIO success, plus reset removes callbacks from same Wasm instance',async()=>{
  const {call:c}=await fresh(createFixture,'frame_loop_fixture');
  c('test_policy_install',3);
  spawn(c,1,0xCC000000,0x80000010,1,1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_state',1),3);
  assert.equal(c('loop_reg_a',1)>>>0,0x12345679);
  assert.equal(c('mem_read32',0x80000010)>>>0,0x12345679);
  assert.equal(c('test_policy_last_region'),1,'regular MMIO typed handler');
  c('loop_reset');
  assert.equal(c('mem_pages'),0);
  spawn(c,2,0xCC000000,0x80000010,1,1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_pc',2),0);
  assert.equal(c('loop_guest_error',2),4,'no callback after reset');
});

test('typed callbacks never promote a straddling device access into RAM',async()=>{
  const {call:c}=await fresh(createFixture,'frame_loop_fixture');
  c('test_policy_install',3);
  spawn(c,5,0xCC007FFE,0x80000010,1,1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_guest_error',5),4);
  assert.equal(c('loop_pc',5),0);
  assert.equal(c('test_policy_calls'),0,'precheck denies straddle BEFORE callback');
  assert.equal(c('mem_pages'),0);
});

test('a guest quota failure AFTER a device read must not replay the MMIO callback',async()=>{
  const {call:c}=await fresh(createFixture,'frame_loop_fixture');
  assert.equal(c('mem_set_page_budget',0),1);
  c('test_policy_install',1); // synthetic MMIO READ has an observable invocation
  spawn(c,31,0xCC000000,0x80001000,1,1);
  assert.equal(c('loop_frame',1),1);
  assert.equal(c('loop_guest_error',31),3,'later RAM allocation failed');
  assert.equal(c('loop_state',31),4);
  assert.equal(c('loop_pc',31),0);
  assert.equal(c('loop_retry_safe',31),0,'guest remembers nonretryable device fault');
  assert.equal(c('test_policy_calls'),1,'first MMIO callback already entered');
  assert.equal(c('mem_pages'),0);
  assert.equal(c('mem_set_page_budget',1),1,'host intentionally raises page quota');
  assert.equal(c('loop_retry_quota',31),0,
    'status3 after side-effectful MMIO cannot be replayed merely by raising the quota');
  assert.equal(c('loop_frame',1),0,'faulted task stays blocked');
  assert.equal(c('test_policy_calls'),1,'MMIO handler must not be entered twice');
  assert.equal(c('mem_pages'),0);
  assert.equal(c('loop_pc',31),0);
});
