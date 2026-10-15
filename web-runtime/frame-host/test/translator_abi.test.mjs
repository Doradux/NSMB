import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import factory from '../dist/frame_loop.mjs';

const wasmPath=fileURLToPath(new URL('../dist/frame_loop.wasm',import.meta.url));
const ENTRY=0x80010000, EXIT=0x8001FFF0;
async function fresh(){
 const module=await factory({locateFile:()=>wasmPath});
 const call=(name,...args)=>{
   const method=module['_nsmbw_'+name];
   assert.equal(typeof method,'function','Missing compiled C ABI '+name);
   return method(...args);
 };
 call('loop_reset');
 return {module,call};
}
const spawn=(c,id,sp,input,output,salt,sda2=0x81002000,sda1=0x81003000,features=0)=>
 c('loop_cpu_spawn_abi',id,ENTRY,sp,input,output,salt,sda2,sda1,features);

test('actual generated-function CpuContext shape: GPR/FPR/CR/XER/FPSCR/GQR offsets',async()=>{
 const {call:c}=await fresh();
 assert.deepEqual(Array.from({length:13},(_,n)=>c('loop_cpu_abi_layout',n)),
   [464,8,0,128,132,136,140,144,148,152,408,440,460]);
 assert.equal(c('loop_cpu_abi_layout',13)>>>0,0xFFFFFFFF);
});
test('C-call shaped fixture modifies r3/r4 but preserves context LR,SP,SDA/FPSCR, checked packet endian',async()=>{
 const {call:c}=await fresh();
 assert.equal(c('services_input_store',0x80004000,5,-16,16,7),1);
 assert.equal(c('mem_read32',0xC0004000)>>>0,0x0710F005);
 assert.equal(spawn(c,1,0x80005010,0xC0004000,0x80009000,2),1);
 assert.equal(c('loop_cpu_gpr',1,2)>>>0,0x81002000);
 assert.equal(c('loop_cpu_gpr',1,13)>>>0,0x81003000);
 assert.equal(c('loop_frame',11),11);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('loop_cpu_steps',1),11);
 assert.equal(c('loop_pc',1)>>>0,EXIT);
 assert.equal(c('loop_cpu_lr',1)>>>0,EXIT);
 assert.equal(c('loop_cpu_gpr',1,1)>>>0,0x80005010);
 assert.equal(c('loop_cpu_gpr',1,2)>>>0,0x81002000);
 assert.equal(c('loop_cpu_gpr',1,13)>>>0,0x81003000);
 assert.equal(c('loop_cpu_gpr',1,3),14);
 assert.equal(c('loop_cpu_gpr',1,4),0,'synthetic void(CpuContext*) fixture explicitly writes r4 high result');
 assert.equal(c('mem_read32',0x80009000),14);
 assert.deepEqual([0,1,2,3,4,5,6,7].map(i=>c('loop_cpu_gqr',1,i)),Array(8).fill(0));
 assert.equal(c('loop_cpu_fpscr',1),0);
 assert.equal(c('mem_read8',0x80009000),0);
 assert.equal(c('mem_read8',0x80009003),14);
});
test('independent CPU ABI contexts retain per-guest r2/r13 and r3/r4, including alias inputs',async()=>{
 const {call:c}=await fresh();
 c('services_input_store',0x80004000,6,0,0,9);
 for(let i=1;i<=3;i++){
   assert.equal(spawn(c,i,0x80004010+i*0x1000,i===2?0xC0004000:0x80004000,
     0x80008000+i*0x1000,i,0x81000000+i,0x81010000+i),1);
 }
 assert.equal(c('loop_frame',64),33);
 assert.equal(c('loop_done'),3);
 for(let id=1;id<=3;id++){
   assert.equal(c('loop_cpu_gpr',id,2)>>>0,0x81000000+id);
   assert.equal(c('loop_cpu_gpr',id,13)>>>0,0x81010000+id);
   assert.equal(c('loop_cpu_gpr',id,3),15+id);
   assert.equal(c('loop_cpu_gpr',id,4),0);
   assert.equal(c('loop_pc',id)>>>0,EXIT);
 }
});
test('FPR, paired-single, and GQR-required guest function requests FAIL CLOSED before spawn',async()=>{
 const {call:c}=await fresh();
 for(const mask of [1,2,4,3,7,0x80000000]){
   assert.equal(spawn(c,1,0x80005010,0x80004000,0x80009000,1,0,0,mask),0);
   assert.equal(c('loop_error'),8);
   assert.equal(c('loop_state',1),0);
   assert.equal(c('mem_pages'),0);
 }
 assert.equal(spawn(c,1,0x80005010,0x80004000,0x80009000,1,0,0,0),1);
 assert.equal(c('loop_state',1),1);
});
test('saved original read-only input reservation remains enforced after callee overwrites r4',async()=>{
 const {call:c}=await fresh();
 c('services_input_store',0x80004000,5,0,0,7);
 assert.equal(spawn(c,1,0x80005010,0x80004000,0x80009000,1),1);
 assert.equal(c('loop_frame',5),5);
 assert.equal(c('loop_cpu_gpr',1,4),0,
   'new pointer-shaped C++ function has overwritten r4 with high result');
 assert.equal(spawn(c,2,0x80004010,0x80004000,0x8000A000,1),0,
   'reservation must use immutable creation metadata, not mutable GPR4');
 assert.equal(c('loop_state',2),0);
 assert.equal(c('mem_read32',0x80004000)>>>0,0x07000005);
 assert.equal(c('loop_frame',6),6);
 assert.equal(c('loop_done'),1);
});
test('C ABI guest memory faults preserve context PC and only retry RAM-only allocation',async()=>{
 const {call:c}=await fresh();
 c('services_input_store',0x80004000,5,0,0,7);
 assert.equal(spawn(c,1,0x80005010,0x80004000,0xCC008000,1),1);
 assert.equal(c('loop_frame',7),7);
 assert.equal(c('loop_state',1),4);
 assert.equal(c('loop_pc',1)>>>0,ENTRY+16);
 assert.equal(c('loop_cpu_gpr',1,3),13);
 assert.equal(c('loop_cpu_gpr',1,4),0);
 assert.equal(c('loop_guest_error',1),4);
 assert.equal(c('loop_retry_quota',1),0);
 c('loop_reset');
 assert.equal(c('mem_write32',0x80004000,0x07000005),1);
 assert.equal(c('mem_set_page_budget',1),1);
 assert.equal(spawn(c,2,0x80005010,0x80004000,0x80009000,1),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_guest_error',2),3);
 assert.equal(c('loop_pc',2)>>>0,ENTRY);
 assert.equal(c('loop_cpu_gpr',2,1)>>>0,0x80005010);
 assert.equal(c('loop_retry_safe',2),1);
 assert.equal(c('mem_set_page_budget',3),1);
 assert.equal(c('loop_retry_quota',2),1);
 assert.equal(c('loop_frame',11),11);
 assert.equal(c('loop_state',2),3);
 assert.equal(c('mem_read32',0x80009000),13);
});
test('ABI reset erases seeded SDA and transient PPC function state',async()=>{
 const {call:c}=await fresh();
 assert.equal(spawn(c,1,0x80005010,0x80004000,0x80009000,1,0xDEADBEEF,0xBADC0FFE),1);
 c('loop_reset');
 assert.equal(c('loop_state',1),0);
 assert.equal(c('loop_cpu_gpr',1,2),0);
 assert.equal(c('loop_cpu_gpr',1,13),0);
 assert.equal(c('mem_pages'),0);
 assert.equal(spawn(c,1,0x80005010,0x80004000,0x80009000,1,0,0),1);
 assert.equal(c('loop_cpu_gpr',1,2),0);
 assert.equal(c('loop_cpu_gpr',1,13),0);
});
