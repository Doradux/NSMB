import test from 'node:test';
import assert from 'node:assert/strict';
import createModule from '../dist/checked_interop_fixture.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const wasm=resolve(dirname(fileURLToPath(import.meta.url)),'../dist/checked_interop_fixture.wasm');
async function api(){
  const m=await createModule({locateFile:()=>wasm});
  const call=(name,...params)=>{
    const fn=m['_nsmbw_'+name];
    assert.equal(typeof fn,'function','missing Wasm export '+name);
    return fn(...params);
  };
  call('interop_reset');
  return call;
}
test('regular module defaults to fail-closed MMIO/GX; fixture requires explicit install',async()=>{
  const c=await api();
  assert.equal(c('interop_read8',0xCC000000),0);
  assert.equal(c('interop_status'),4);
  assert.equal(c('interop_write32',0xCC008000,0xAABBCCDD),0);
  assert.equal(c('interop_status'),4);
  assert.equal(c('test_policy_calls'),0);
  c('test_policy_install',1);
  assert.equal(c('interop_read32',0xCC000000)>>>0,0x12345678);
  assert.equal(c('interop_status'),0);
  assert.equal(c('test_policy_last_region'),1);
  assert.equal(c('interop_write8',0xCC008000,0x23),0);
  assert.equal(c('interop_status'),4,'MMIO handler does not grant GX FIFO access');
  c('test_policy_install',2);
  assert.equal(c('interop_write32',0xCC008000,0xFEEDBEEF),1);
  assert.equal(c('interop_status'),0);
  assert.equal(c('test_policy_last_region'),2);
  assert.equal(c('test_policy_last_value')>>>0,0xFEEDBEEF);
  assert.equal(c('test_policy_last_width'),4);
});
test('typed device mock returns 8/16/32 widths with big-endian RAM side',async()=>{
  const c=await api();
  c('test_policy_install',3);
  assert.equal(c('interop_read8',0xCC000004),0x78);
  assert.equal(c('interop_read16',0xCC000006),0x5678);
  assert.equal(c('interop_read32',0xCC000008)>>>0,0x12345678);
  assert.equal(c('interop_status'),0);
  c('interop_write16',0xCC008020,0xABCDEF12);
  assert.equal(c('test_policy_last_value')>>>0,0xABCDEF12);
  assert.equal(c('test_policy_last_width'),2);
  assert.equal(c('interop_step',0xCC000004,0x80000020,1),1);
  assert.equal(c('mem_read32',0x80000020)>>>0,0x12345679);
  assert.equal(c('interop_step',0x80000020,0xCC008000,1),1);
  assert.equal(c('test_policy_last_value')>>>0,0x1234567A);
});
test('device callback rejection or invalid reply is never silently treated as successful I/O',async()=>{
  const c=await api();
  c('test_policy_install',3);
  c('test_policy_rejection',1);
  assert.equal(c('interop_read32',0xCC000000),0);
  assert.equal(c('interop_status'),5);
  assert.equal(c('interop_step',0xCC000000,0x80000000,1),0);
  assert.equal(c('interop_status'),5);
  c('test_policy_rejection',2);
  assert.equal(c('interop_write32',0xCC008000,0x1234),0);
  assert.equal(c('interop_status'),6);
  c('test_policy_rejection',3);
  assert.equal(c('interop_read16',0xCC000000),0);
  assert.equal(c('interop_status'),4);
  assert.equal(c('mem_pages'),0);
});
test('straddling device boundaries always fails before invoking a callback',async()=>{
  const c=await api();
  c('test_policy_install',3);
  for(const [address,width,code] of [
    [0xCBFFFFFF,2,4],[0xCDFFFFFF,2,4],
    [0xCC007FFE,4,4],[0xCC0080FF,2,4],
    [0xFFFFFFFE,4,2]]) {
    const before=c('test_policy_calls');
    const method='interop_read'+(width*8);
    assert.equal(c(method,address),0);
    assert.equal(c('interop_status'),code);
    assert.equal(c('test_policy_calls'),before,'no partial device callbacks');
  }
});
test('W04 quota failure and invalid RAM reject without touching device policy',async()=>{
  const c=await api();
  c('test_policy_install',3);
  assert.equal(c('mem_set_page_budget',0),1);
  assert.equal(c('interop_write32',0x80000FFF,0x99887766),0);
  assert.equal(c('interop_status'),3);
  assert.equal(c('mem_pages'),0);
  assert.equal(c('test_policy_calls'),0);
  assert.equal(c('interop_read32',0x40000000),0);
  assert.equal(c('interop_status'),1);
  assert.equal(c('test_policy_calls'),0);
});
test('interop reset drops callbacks and zeroes memory while preserving host budget',async()=>{
  const c=await api();
  c('test_policy_install',3);
  c('mem_set_page_budget',1);
  c('interop_write32',0x80000000,0x11223344);
  c('interop_reset');
  assert.equal(c('interop_read32',0xCC000000),0);
  assert.equal(c('interop_status'),4);
  assert.equal(c('mem_pages'),0);
  assert.equal(c('interop_read32',0x80000000),0);
  assert.equal(c('interop_status'),0);
  assert.equal(c('interop_write32',0x80000000,1),1);
  assert.equal(c('interop_write32',0x80001000,1),0);
  assert.equal(c('interop_status'),3);
});
test('50k synthetic guest scalar accesses complete without unbounded allocations',async t=>{
  const c=await api();
  assert.equal(c('mem_set_page_budget',2),1);
  const start=performance.now();
  let checksum=0;
  for(let i=0;i<50000;i++) {
    const address=0x80000000+((i%256)*4);
    assert.equal(c('interop_write32',address,i),1);
    checksum^=c('interop_read32',address);
  }
  const elapsed=performance.now()-start;
  assert.equal(c('mem_pages'),1);
  assert.equal(c('interop_status'),0);
  assert.ok(elapsed>=0 && Number.isFinite(elapsed));
  t.diagnostic('50k checked writes + 50k checked reads: '+elapsed.toFixed(2)+' ms (non-SLA diagnostic; checksum='+checksum+')');
});
