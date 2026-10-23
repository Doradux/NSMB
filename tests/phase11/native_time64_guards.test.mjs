// Peach Phase11: independent native typed failure and authority guards.
// Uses only copyright-free synthetic Emscripten Wasm; no Wii game binary.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(process.env.NSMB_P11_TIME64_ROOT||process.cwd(),
 'web-runtime/runtime-services');
async function fresh(){
 const path=resolve(root,'dist/joined_tick.wasm');
 assert.equal(readFileSync(path).subarray(0,4).toString('hex'),'0061736d');
 const m=await (await import(pathToFileURL(resolve(root,'dist/joined_tick.mjs')).href))
   .default({locateFile:()=>path});
 m._nsmbw_loop_reset();
 const {createSyntheticTickClock}=await import(pathToFileURL(resolve(root,'tick_host.mjs')).href);
 return {m,createSyntheticTickClock};
}
const snap=m=>({
 ram:m._nsmbw_mem_read32(0x80008000)>>>0,
 alias:m._nsmbw_mem_read32(0xC0008000)>>>0,
 cpu0:[3,4].map(n=>m._nsmbw_services_time64_gpr(0,n)>>>0),
 cpu1:[3,4].map(n=>m._nsmbw_services_time64_gpr(1,n)>>>0),
 pages:m._nsmbw_mem_pages(),
 callbacks:m._nsmbw_interop_device_invoked()
});
test('invalid host magic is typed status7, claims neither clock nor guest RAM',async()=>{
 const {m,createSyntheticTickClock}=await fresh();
 assert.equal(m._nsmbw_services_tick_store32(0xFFFFFFFC,0x5449434A),0);
 assert.equal(m._nsmbw_services_tick_status(),7);
 assert.equal(m._nsmbw_services_tick_is_claimed(),0);
 assert.equal(m._nsmbw_mem_pages(),0);
 assert.equal(m._nsmbw_interop_device_invoked(),0);
 const c=createSyntheticTickClock(m);
 assert.equal(c.publish(0x100000002n).written,true);
 assert.equal(snap(m).ram,2);
});
test('native lower time is rejected BEFORE quota/address side effects on second RAM page',async()=>{
 const {m,createSyntheticTickClock}=await fresh();
 const c=createSyntheticTickClock(m);
 assert.equal(c.publish(0x100000005n).written,true);
 assert.equal(m._nsmbw_mem_set_page_budget(1),1);
 const before=snap(m);
 assert.equal(m._nsmbw_services_time64_publish(1,0x80009000,0,4),0);
 assert.equal(m._nsmbw_services_time64_status(),10,
  'chronological regression must take precedence over would-be quota fault');
 assert.deepEqual(snap(m),before);
 assert.equal(c.publishCpu(1,0x100000006n).written,true,
  'failing direct native time must not poison subsequent real CpuContext snapshot');
 assert.deepEqual([m._nsmbw_services_time64_gpr(1,3),
  m._nsmbw_services_time64_gpr(1,4)],[1,6]);
});
test('quota zero refuses first 64-bit publish without allocation or CPU mutation; safe retry',async()=>{
 const {m,createSyntheticTickClock}=await fresh();
 const c=createSyntheticTickClock(m);
 assert.equal(m._nsmbw_mem_set_page_budget(0),1);
 const before=snap(m);
 const failed=c.publishCpu(0,0x100000003n);
 assert.equal(failed.written,false);
 assert.deepEqual(snap(m),before);
 assert.equal(c.ticks,0n);
 assert.equal(m._nsmbw_mem_set_page_budget(1),1);
 const success=c.publishCpu(0,0x100000003n);
 assert.equal(success.written,true);
 assert.deepEqual([success.reg3,success.reg4],[1,3]);
 assert.equal(snap(m).pages,1);
});
