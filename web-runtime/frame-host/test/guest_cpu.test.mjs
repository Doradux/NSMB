import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import createModule from '../dist/frame_loop.mjs';
import {createFrameHost} from '../host.mjs';

const WASM=fileURLToPath(new URL('../dist/frame_loop.wasm',import.meta.url));
const ENTRY=0x80010000,EXIT=0x8001FFF0;
async function fresh(){
 const mod=await createModule({locateFile:()=>WASM});
 const call=(name,...args)=>{
   const method=mod['_nsmbw_'+name];
   assert.equal(typeof method,'function','missing compiled C++ Wasm export '+name);
   return method(...args);
 };
 call('loop_reset');
 return {mod,call};
}
function spawn(c,id,stack,input,result,salt){
 assert.equal(c('loop_cpu_spawn',id,ENTRY,stack,input,result,salt),1);
}
test('3 PPC-style call contexts use the SAME checked memory as real input-service Wasm',async()=>{
 const {call:c,mod}=await fresh();
 assert.equal(c('services_input_store',0x80004000,5,32,-32,7),1);
 assert.equal(c('services_input_status'),0);
 assert.equal(c('mem_read32',0xC0004000)>>>0,0x07E02005);
 for(let id=1;id<=3;id++)spawn(c,id,0x80004010+id*0x1000,0xC0004000,0x80008000+id*0x1000,id-1);
 const host=createFrameHost(mod,{ids:[1,2,3],budget:2,maxFrames:64,
   requestFrame:cb=>setImmediate(cb),cancelFrame:h=>clearImmediate(h)});
 const finished=await host.start();
 assert.equal(finished.reason,'completed');
 assert.equal(finished.frames,17,'33 checked PPC-style synthetic instructions / budget 2');
 assert.equal(finished.done,3);
 assert.equal(finished.faulted,0);
 for(let id=1;id<=3;id++){
   assert.equal(c('loop_cpu_steps',id),11);
   assert.equal(c('loop_pc',id)>>>0,EXIT);
   assert.equal(c('loop_cpu_lr',id)>>>0,EXIT);
   assert.equal(c('loop_cpu_gpr',id,1)>>>0,0x80004010+id*0x1000);
   assert.equal(c('loop_cpu_gpr',id,2),0);
   assert.equal(c('loop_cpu_gpr',id,13),0);
   assert.equal(c('loop_cpu_gpr',id,3),11+id);
   assert.equal(c('loop_cpu_cr',id),0);
   assert.equal(c('loop_cpu_ctr',id),0);
   assert.equal(c('loop_cpu_xer',id),0);
   assert.equal(c('mem_read32',0x80008000+id*0x1000),11+id);
   assert.equal(c('mem_read32',0x80004000+id*0x1000)>>>0,0x80004010+id*0x1000,
     'checked stack stores old SP in independent guest page');
   assert.equal(c('mem_read32',0x80004004+id*0x1000)>>>0,EXIT,
     'original LR is saved in independent guest stack');
 }
 assert.equal(c('mem_read32',0x80004000)>>>0,0x07E02005,
   'input packet unchanged and shared with three guest contexts');
 host.dispose();
});
test('failed MMIO packet read leaves guest PC and registers uncommitted',async()=>{
 const {call:c}=await fresh();
 spawn(c,1,0x80005010,0xCC008000,0x80008000,2);
 assert.equal(c('loop_frame',2),2);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('loop_guest_error',1),4);
 assert.equal(c('loop_pc',1)>>>0,ENTRY+8);
 assert.equal(c('loop_cpu_steps',1),2);
 assert.equal(c('loop_cpu_gpr',1,3),0);
 assert.equal(c('loop_cpu_gpr',1,1)>>>0,0x80005000);
 assert.equal(c('loop_retry_quota',1),0);
});
test('failed result store cannot advance PPC callsite PC or repeat MMIO side effect',async()=>{
 const {call:c}=await fresh();
 c('services_input_store',0x80004000,1,0,0,2);
 spawn(c,1,0x80005010,0x80004000,0xCC008000,1);
 assert.equal(c('loop_frame',6),6);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('loop_guest_error',1),4);
 assert.equal(c('loop_pc',1)>>>0,ENTRY+16);
 assert.equal(c('loop_cpu_steps',1),6);
 assert.equal(c('loop_cpu_gpr',1,3),4);
 assert.equal(c('loop_retry_quota',1),0);
});
test('quota fault at first stack write leaves PC/r1 unchanged, then host retries RAM-only',async()=>{
 const {call:c}=await fresh();
 assert.equal(c('services_input_store',0x80004000,5,0,0,7),1);
 assert.equal(c('mem_pages'),1);
 assert.equal(c('mem_set_page_budget',1),1);
 spawn(c,1,0x80005010,0x80004000,0x80006000,0);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('loop_guest_error',1),3);
 assert.equal(c('loop_cpu_steps',1),0);
 assert.equal(c('loop_pc',1)>>>0,ENTRY);
 assert.equal(c('loop_cpu_gpr',1,1)>>>0,0x80005010);
 assert.equal(c('mem_pages'),1);
 assert.equal(c('loop_retry_safe',1),1);
 assert.equal(c('mem_set_page_budget',3),1);
 assert.equal(c('loop_retry_quota',1),1);
 assert.equal(c('loop_frame',32),11);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('loop_cpu_steps',1),11);
 assert.equal(c('mem_read32',0x80006000),12);
});
test('legacy W03 context and new CPU context interleave without corrupting each other',async()=>{
 const {call:c}=await fresh();
 c('services_input_store',0x80004000,2,0,0,3);
 c('mem_write32',0x80009000,20);
 spawn(c,4,0x80005010,0x80004000,0x80008000,9);
 assert.equal(c('loop_spawn',5,0x80009000,0x8000A000,7,2),1);
 assert.equal(c('loop_frame',32),13);
 assert.equal(c('loop_state',4),3);
 assert.equal(c('loop_state',5),3);
 assert.equal(c('mem_read32',0x80008000),14);
 assert.equal(c('mem_read32',0x8000A004),34);
 assert.equal(c('loop_pc',5),2,'legacy PC is step count, not guest PC');
});
test('128 resets keep checked shared input and PPC GPR/stack state isolated',async()=>{
 const {call:c}=await fresh();
 for(let i=0;i<128;i++){
   c('loop_reset');
   assert.equal(c('mem_pages'),0);
   assert.equal(c('services_input_store',0x80004000,(i&7),0,0,i&255),1);
   spawn(c,1,0x80005010,0x80004000,0x80008000,9);
   assert.equal(c('loop_frame',11),11);
   assert.equal(c('loop_state',1),3);
   assert.equal(c('mem_read32',0x80008000),(i&7)+(i&255)+9);
   assert.equal(c('loop_cpu_gpr',1,1)>>>0,0x80005010);
   assert.equal(c('loop_cpu_steps',1),11);
   assert.equal(c('loop_reap',1),1);
   assert.equal(c('loop_cpu_steps',1),0);
 }
 c('loop_reset');assert.equal(c('mem_pages'),0);
});

test('invalid entry, MMIO stack or unaligned CPU stack are refused without allocating guest RAM',async()=>{
 const {call:c}=await fresh();
 assert.equal(c('loop_cpu_spawn',1,0x80010004,0x80005010,0x80004000,0x80009000,0),0);
 assert.equal(c('loop_cpu_spawn',1,ENTRY,0xCC008010,0x80004000,0x80009000,0),0);
 assert.equal(c('loop_cpu_spawn',1,ENTRY,0x80005014,0x80004000,0x80009000,0),0);
 assert.equal(c('loop_cpu_spawn',1,ENTRY,0x00000000,0x80004000,0x80009000,0),0,
  'prior stack page/underflow cannot become a native memory pointer');
 assert.equal(c('loop_cpu_spawn',1,ENTRY,0x80005010,0x80004001,0x80009000,0),0);
 assert.equal(c('mem_pages'),0);
 assert.equal(c('loop_ready'),0);
 assert.equal(c('loop_state',1),0);
});
test('corrupted checked guest stack restore faults context 7 without changing SP/PC/LR',async()=>{
 const {call:c}=await fresh();
 assert.equal(c('services_input_store',0x80004000,1,0,0,3),1);
 spawn(c,1,0x80005010,0x80004000,0x80009000,5);
 assert.equal(c('loop_frame',8),8);
 assert.equal(c('loop_pc',1)>>>0,ENTRY+24);
 assert.equal(c('loop_cpu_lr',1)>>>0,ENTRY+16);
 assert.equal(c('mem_write32',0x80005000,0x8000DEAD),1,'host corrupts synthetic saved-SP word');
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('loop_guest_error',1),7,'synthetic ABI validation code');
 assert.equal(c('loop_pc',1)>>>0,ENTRY+24,'faulting stack pop PC not committed');
 assert.equal(c('loop_cpu_gpr',1,1)>>>0,0x80005000,'r1 not poisoned');
 assert.equal(c('loop_cpu_lr',1)>>>0,ENTRY+16,'LR not poisoned');
 assert.equal(c('loop_retry_quota',1),0);
 assert.equal(c('mem_read32',0x80009000),9,'earlier committed output is not rolled back');
});
