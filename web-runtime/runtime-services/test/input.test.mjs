import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import create from '../dist/input_snapshot.mjs';
const wasm=fileURLToPath(new URL('../dist/input_snapshot.wasm',import.meta.url));
async function fresh(){
 const mod=await create({locateFile:()=>wasm});
 const c=(n,...args)=>{
  const fn=mod['_nsmbw_'+n];
  assert.equal(typeof fn,'function',n+' missing from real compiled WASM');
  return fn(...args);
 };
 c('interop_reset');c('services_input_status_reset');
 return c;
}
test('single 32-bit input packet writes big-endian bytes and Wii aliases',async()=>{
 const c=await fresh();
 assert.equal(c('services_input_store',0x80001000,0x5A,-127,127,0x91),1);
 assert.equal(c('services_input_status'),0);
 assert.equal(c('mem_read32',0xC0001000)>>>0,0x917F815A);
 assert.deepEqual([0,1,2,3].map(i=>c('mem_read8',0x00001000+i)),[0x91,0x7F,0x81,0x5A]);
 assert.equal(c('mem_pages'),1);
 assert.equal(c('services_input_store',0x90002000,1,0,-1,0),1);
 assert.equal(c('mem_read32',0xD0002000)>>>0,0x00FF0001);
 assert.equal(c('mem_pages'),2);
});
test('input encoding rejects out-of-bounds axes, buttons, sequence without side effects',async()=>{
 const c=await fresh();
 for(const args of [[256,0,0,0],[0,-128,0,0],[0,128,0,0],[0,0,-128,0],
  [0,0,128,0],[0,0,0,256]]){
  assert.equal(c('services_input_store',0x80000000,...args),0);
  assert.equal(c('services_input_status'),7);
  assert.equal(c('mem_pages'),0);
 }
 assert.equal(c('services_input_store',0x80000000,0,-127,127,255),1);
 assert.equal(c('services_input_status'),0);
});
test('service never routes snapshots to MMIO/GX or unmapped/unaligned memory',async()=>{
 const c=await fresh();
 for(const address of [0xCC000000,0xCC008000,0xCC007FFE,0x40000000,
  0x817FFFFF,0x817FFFFC+1,0x88000000,0x00000001,0xFFFFFFFC]){
  assert.equal(c('services_input_store',address,1,0,0,0),0,'rejected '+address.toString(16));
  assert.equal(c('services_input_status'),7);
  assert.equal(c('mem_pages'),0);
 }
 assert.equal(c('services_input_store',0x817FFFFC,0xA5,0,0,1),1);
 assert.equal(c('mem_read32',0x817FFFFC)>>>0,0x010000A5);
});
test('failed store at quota 0 is recoverable and does not create ghost pages',async()=>{
 const c=await fresh();
 assert.equal(c('mem_set_page_budget',0),1);
 assert.equal(c('services_input_store',0x80000FFC,7,2,-2,2),0);
 assert.equal(c('services_input_status'),3);
 assert.equal(c('mem_pages'),0);
 assert.equal(c('mem_set_page_budget',1),1);
 assert.equal(c('services_input_store',0x80000FFC,7,2,-2,2),1);
 assert.equal(c('services_input_status'),0);
 assert.equal(c('mem_read32',0x80000FFC)>>>0,0x02FE0207);
});
test('invalid snapshot cannot overwrite previously valid payload',async()=>{
 const c=await fresh();
 c('services_input_store',0x80001000,0xAA,0,0,1);
 const original=c('mem_read32',0x80001000)>>>0;
 assert.equal(c('services_input_store',0x80001000,0x100,0,0,2),0);
 assert.equal(c('services_input_status'),7);
 assert.equal(c('mem_read32',0x80001000)>>>0,original);
 assert.equal(c('mem_pages'),1);
});
test('status reset does not clear the entire guest RAM or alter other module policy',async()=>{
 const c=await fresh();
 c('services_input_store',0x80000000,5,6,7,8);
 c('services_input_store',0xCC008000,0,0,0,0);
 assert.equal(c('services_input_status'),7);
 c('services_input_status_reset');
 assert.equal(c('services_input_status'),0);
 assert.equal(c('mem_read32',0x80000000)>>>0,0x08070605);
 assert.equal(c('mem_pages'),1);
});
test('128 reset cycles preserve one-word atomicity and no cross-context stale data',async()=>{
 const c=await fresh();
 c('mem_set_page_budget',1);
 for(let cycle=0;cycle<128;cycle++){
  c('interop_reset');
  assert.equal(c('mem_pages'),0);
  assert.equal(c('services_input_store',0x80000000,cycle,0,0,cycle),1);
  assert.equal(c('mem_read32',0xC0000000)>>>0,(cycle<<24)|cycle);
  assert.equal(c('mem_pages'),1);
 }
 c('interop_reset');
 assert.equal(c('mem_pages'),0);
 assert.equal(c('mem_read32',0x80000000),0);
});
test('bounded 25k updates retain one allocated page and deterministic last packet',async t=>{
 const c=await fresh();
 c('mem_set_page_budget',1);
 const began=performance.now();
 for(let i=0;i<25000;i++) {
  assert.equal(c('services_input_store',0x80000300,i&255,(i%255)-127,0,i&255),1);
 }
 const elapsed=performance.now()-began;
 assert.equal(c('mem_pages'),1);
 assert.equal(c('services_input_status'),0);
 assert.ok(Number.isFinite(elapsed));
 t.diagnostic('25k synthetic input packets '+elapsed.toFixed(2)+' ms, one physical page; not hardware benchmark');
});
