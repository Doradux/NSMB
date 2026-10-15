import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import create from '../dist/frame_loop_fixture.mjs';
const path=fileURLToPath(new URL('../dist/frame_loop_fixture.wasm',import.meta.url));
const entry=0x80010000;
test('red-first: two CPU contexts can separately fault against the SAME MMIO device address',async()=>{
 const wasm=await create({locateFile:()=>path});
 const c=(name,...args)=>{
   const fn=wasm['_nsmbw_'+name];
   assert.equal(typeof fn,'function',name);
   return fn(...args);
 };
 c('loop_reset');
 assert.equal(c('services_input_store',0x80004000,1,0,0,5),1);
 c('test_policy_install',3);
 for(const [id,stack,rejection,expected] of [
   [21,0x80005010,1,5],[22,0x80006010,2,6]
 ]){
   c('test_policy_rejection',rejection);
   assert.equal(c('loop_cpu_spawn',id,entry,stack,0x80004000,0xCC008000,1),1,
     'MMIO output is a DEVICE ADDRESS, not exclusive physical RAM ownership');
   for(let n=0;n<11&&c('loop_state',id)===1;n++)assert.equal(c('loop_frame',1),1);
   assert.equal(c('loop_state',id),4);
   assert.equal(c('loop_pc',id)>>>0,entry+16,'offending stw PC uncommitted');
   assert.equal(c('loop_guest_error',id),expected);
   assert.equal(c('loop_retry_quota',id),0);
 }
 assert.equal(c('test_policy_calls'),2,'two deliberate independent device callback attempts');
});
