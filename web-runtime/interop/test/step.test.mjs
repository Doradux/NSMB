import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import createModule from '../dist/checked_interop.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasm=resolve(root,'dist/checked_interop.wasm');
async function instance(){
  const mod=await createModule({locateFile:()=>wasm});
  return name=>{const f=mod['_nsmbw_'+name];assert.equal(typeof f,'function',name+' not exported');return f;};
}
async function setup(){
  const lookup=await instance(), call=(name,...args)=>lookup(name)(...args);
  call('interop_reset');
  return {call,reset:()=>call('interop_reset'),status:()=>call('interop_status'),
    step:(a,b,c)=>call('interop_step',a,b,c),read:a=>call('mem_read32',a)>>>0,
    write:(a,v)=>call('mem_write32',a,v),byte:a=>call('mem_read8',a),pages:()=>call('mem_pages')};
}
test('WASM binary is actual compiled WebAssembly not a JS simulation',async()=>{
  assert.equal((await readFile(wasm)).subarray(0,4).toString('hex'),'0061736d');
});
test('synthetic guest step loads from MEM1 alias and writes big-endian MEM2',async()=>{
  const m=await setup();
  assert.equal(m.write(0x80001000,0x01020304),1);
  assert.equal(m.step(0xC0001000,0x90001000,0x100),1);
  assert.equal(m.status(),0);
  assert.equal(m.read(0xD0001000),0x01020404);
  assert.deepEqual([0,1,2,3].map(i=>m.byte(0x10001000+i)),[0x01,0x02,0x04,0x04]);
  assert.equal(m.pages(),2);
});
test('zero source value is not confused with a failed memory read',async()=>{
  const m=await setup();
  assert.equal(m.step(0x80000000,0x80000010,0x1234),1);
  assert.equal(m.status(),0);
  assert.equal(m.read(0x00000010),0x1234);
});
test('unsigned synthetic arithmetic wraps to uint32',async()=>{
  const m=await setup();
  m.write(0x80000000,0xFFFFFFFE);
  assert.equal(m.step(0x80000000,0x80000004,5),1);
  assert.equal(m.read(0x80000004),3);
});
test('MMIO/GX device address does not become normal memory',async()=>{
  const m=await setup();
  m.write(0x80000000,0x11223344);
  for(const addr of [0xCC000000,0xCC008000,0xCBFFFFFE,0xCDFFFFFE]){
    assert.equal(m.step(addr,0x80000010,7),0);
    assert.equal(m.status(),4);
    assert.equal(m.step(0x80000000,addr,7),0);
    assert.equal(m.status(),4);
    assert.equal(m.read(0x80000010),0);
  }
});
test('invalid unmapped and wrapping guest access preserves destination',async()=>{
  const m=await setup();
  m.write(0x80000010,0x12345678);
  assert.equal(m.step(0x40000000,0x80000010,7),0);
  assert.equal(m.status(),1);
  assert.equal(m.step(0xFFFFFFFE,0x80000010,7),0);
  assert.equal(m.status(),2);
  assert.equal(m.step(0x80000010,0xFFFFFFFD,7),0);
  assert.equal(m.status(),2);
  assert.equal(m.read(0x80000010),0x12345678);
});
test('page-budget failure on crossing destination store is atomic',async()=>{
  const m=await setup();
  assert.equal(m.call('mem_set_page_budget',1),1);
  assert.equal(m.write(0x80000004,0x01020304),1);
  assert.equal(m.step(0x80000004,0x80000FFF,1),0);
  assert.equal(m.status(),3);
  assert.equal(m.pages(),1);
  assert.equal(m.byte(0x80000FFF),0);
  assert.equal(m.byte(0x80001000),0);
});
test('read across page boundaries and unaligned guest addresses',async()=>{
  const m=await setup();
  m.write(0x80000FFF,0xAABBCCDD);
  assert.equal(m.step(0xC0000FFF,0x80002001,1),1);
  assert.equal(m.read(0x00002001),0xAABBCCDE);
});
test('reset clears data and interop status but retains host budget',async()=>{
  const m=await setup();
  m.call('mem_set_page_budget',1);
  m.step(0xCC008000,0x80000004,0);
  assert.equal(m.status(),4);
  m.reset();
  assert.equal(m.status(),0);
  assert.equal(m.pages(),0);
  assert.equal(m.read(0x80000000),0);
  m.write(0x80000000,0x33);
  assert.equal(m.step(0x80000000,0x80001000,0),0);
  assert.equal(m.status(),3);
});
test('two isolated Wasm instances never share sparse guest page contents',async()=>{
  const a=await setup(),b=await setup();
  a.write(0x80000000,0x99);
  assert.equal(b.read(0x80000000),0);
  assert.equal(a.read(0x80000000),0x99);
  assert.equal(b.pages(),0);
});
