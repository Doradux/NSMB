// Phase 4 independent RED-first acceptance: REAL linked C++/Emscripten Wasm only.
// No simulated memory, mock CPU output or JS-computed guest result is acceptable.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.NSMB_PHASE4_ROOT||'.');
const modDir=resolve(root,'web-runtime/frame-host');
const wasmPath=resolve(modDir,'dist/frame_loop.wasm');
const esmPath=resolve(modDir,'dist/frame_loop.mjs');
const inputJs=resolve(root,'web-runtime/runtime-services/host_input.mjs');
const makePad=(pressed=false)=>({connected:true,mapping:'standard',index:0,
 axes:[0,0],buttons:Array.from({length:17},(_,i)=>({pressed:i===0&&pressed,value:i===0&&pressed?1:0}))});
async function fresh({fixture=false}={}) {
 const selectedWasm=fixture?resolve(modDir,'dist/frame_loop_fixture.wasm'):wasmPath;
 const selectedEsm=fixture?resolve(modDir,'dist/frame_loop_fixture.mjs'):esmPath;
 assert.ok(existsSync(selectedWasm)&&existsSync(selectedEsm),
   'real linked Emscripten '+(fixture?'TEST-ONLY fixture':'normal')+' Wasm must be compiled in NSMB_PHASE4_ROOT');
 assert.equal(readFileSync(selectedWasm).subarray(0,4).toString('hex'),'0061736d','not a real WebAssembly binary');
 const factory=(await import(pathToFileURL(selectedEsm).href)).default;
 const wasm=await factory({locateFile:()=>selectedWasm});
 const call=(suffix,...args)=>{
   const fun=wasm['_nsmbw_'+suffix];
   assert.equal(typeof fun,'function','MISSING ACTUAL LINKED C++ WASM EXPORT _nsmbw_'+suffix+'; no JS emulation allowed');
   return fun(...args);
 };
 const {writeSyntheticGamepadSnapshot} = await import(pathToFileURL(inputJs).href);
 call('loop_reset');
 return {wasm,call,writeInput:(pads,address,seq,opts)=>writeSyntheticGamepadSnapshot(wasm,pads,address,seq,opts)};
}
test('Phase3 established baseline: joined Wasm isolates MMIO fault before final PC commit',async()=>{
 const {wasm,call:c}=await fresh();
 assert.equal(typeof wasm._nsmbw_test_policy_install,'undefined','never link synthetic device hooks into normal Wasm');
 assert.equal(c('mem_write32',0x80000000,0),1);
 assert.equal(c('loop_spawn',1,0x80000000,0x80000004,1,1),1);
 assert.equal(c('loop_spawn',2,0x80000000,0xCC008000,1,1),1);
 assert.equal(c('loop_frame',2),2);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('loop_reg_a',1),1);
 assert.equal(c('loop_state',2),4);
 assert.equal(c('loop_pc',2),0);
 assert.equal(c('loop_guest_error',2),4);
 assert.equal(c('loop_retry_quota',2),0);
});
test('RED gate: W08 input writes a single guest word into EXACT same Wasm as scheduled W03 C++ work',async()=>{
 const {wasm,call:c,writeInput}=await fresh();
 assert.equal(typeof wasm._nsmbw_services_input_store,'function',
   'PHASE4 RED: separate input_snapshot.wasm has DIFFERENT RAM; W07 service must link into W03 frame_loop.wasm');
 assert.equal(typeof wasm._nsmbw_services_input_status,'function');
 assert.equal(typeof wasm._nsmbw_test_policy_install,'undefined');
 const a=writeInput([makePad(true)],0x80001000,9);
 assert.deepEqual(a,{written:true,disconnected:false,status:0});
 assert.equal(c('mem_read32',0xC0001000)>>>0,0x09000001,'same shared W04 RAM alias, not JS memory');
 assert.equal(c('loop_spawn',1,0x80001000,0x80002000,1,1),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('loop_reg_a',1)>>>0,0x09000002,'actual C++ guest consumed input + 1');
 assert.equal(c('mem_read32',0x80002000)>>>0,0x09000002);
 const unplug=writeInput([],0x80001000,10);
 assert.deepEqual(unplug,{written:true,disconnected:true,status:0});
 assert.equal(c('mem_read32',0x80001000)>>>0,0x0A000000,'disconnect releases all buttons');
 assert.equal(c('loop_spawn',2,0x80001000,0x80002004,1,1),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_reg_a',2)>>>0,0x0A000001,'C++ guest sees newer neutral packet');
 assert.equal(c('mem_read32',0x80002000)>>>0,0x09000002,'former context result remains intact');
});
test('RED gate: quota zero rejects input atomically; MMIO/alignment cannot get controller packet',async()=>{
 const {wasm,call:c,writeInput}=await fresh();
 assert.equal(typeof wasm._nsmbw_services_input_store,'function','PHASE4 input service not linked to host yet');
 assert.equal(c('mem_set_page_budget',0),1);
 const denied=writeInput([makePad(true)],0x80002000,1);
 assert.deepEqual(denied,{written:false,disconnected:false,status:3});
 assert.equal(c('mem_pages'),0,'quota 0 must not allocate guest RAM');
 const device=writeInput([makePad(true)],0xCC008000,1);
 assert.deepEqual(device,{written:false,disconnected:false,status:7});
 const misaligned=writeInput([makePad(true)],0x80002001,1);
 assert.deepEqual(misaligned,{written:false,disconnected:false,status:7});
 assert.equal(c('mem_pages'),0);
 assert.equal(c('mem_set_page_budget',1),1);
 assert.deepEqual(writeInput([makePad(true)],0x80002000,255),
   {written:true,disconnected:false,status:0});
 assert.equal(c('mem_read32',0x80002000)>>>0,0xFF000001);
 assert.deepEqual(writeInput([],0x80002000,0),{written:true,disconnected:true,status:0});
 assert.equal(c('mem_read32',0xC0002000),0);
});
test('RED gate: three actual C++ synthetic PPC calls preserve r1/PC/LR and independent return values',async()=>{
 const {wasm,call:c,writeInput}=await fresh();
 const exports=['loop_cpu_spawn','loop_cpu_gpr','loop_cpu_steps','loop_cpu_lr',
   'loop_cpu_ctr','loop_cpu_cr','loop_cpu_xer'];
 for(const name of exports)assert.equal(typeof wasm['_nsmbw_'+name],'function',
   'PHASE4 RED: missing agreed Luigi C++/Wasm CPU export _nsmbw_'+name);
 assert.equal(typeof wasm._nsmbw_services_input_store,'function',
   'PHASE4 RED: same Wasm must link Toad input packet before CPU guest runs');
 assert.equal(c('mem_set_page_budget',8),1);
 assert.deepEqual(writeInput([makePad(true)],0x80004000,9),
   {written:true,disconnected:false,status:0});
 const stacks=[0x80005010,0x80006010,0x80007010];
 const outputs=[0x80009000,0x8000A000,0x8000B000];
 const salts=[5,7,9];
 for(let i=0;i<3;i++){
   assert.equal(c('loop_cpu_spawn',i+1,0x80010000,stacks[i],
     0x80004000,outputs[i],salts[i]),1,'one guest CPU context configured');
   assert.equal(c('loop_cpu_gpr',i+1,1)>>>0,stacks[i],'initial PowerPC r1');
   assert.equal(c('loop_pc',i+1)>>>0,0x80010000,'original entry guest PC');
 }
 assert.equal(c('loop_frame',3),3,'first round-robin CPU instruction per guest');
 for(let i=0;i<3;i++){
   assert.equal(c('loop_cpu_steps',i+1),1,'no guest starved');
   assert.notEqual(c('loop_pc',i+1),0x80010000,'guest PC must advance through real C++ ABI');
 }
 assert.equal(c('loop_suspend',2),1);
 assert.equal(c('loop_frame',1),1);
 assert.equal(c('loop_cpu_steps',2),1,'paused context must not execute');
 assert.equal(c('loop_resume',2),1);
 for(let i=0;i<5&&c('loop_ready')>0;i++)assert.ok(c('loop_frame',64)>=0);
 assert.equal(c('loop_done'),3);
 for(let i=0;i<3;i++){
   const id=i+1;
   assert.equal(c('loop_state',id),3);
   assert.equal(c('loop_cpu_steps',id),11,'synthetic function must have 11 actual PPC ABI operations');
   assert.equal(c('loop_cpu_gpr',id,1)>>>0,stacks[i],'r1 restored after BL/BLR');
   assert.equal(c('loop_cpu_gpr',id,3)>>>0,15+2*i,'callee result buttons+seq+salt');
   assert.equal(c('mem_read32',outputs[i])>>>0,15+2*i,'callee result written by C++ guest to checked RAM');
   assert.equal(c('loop_cpu_lr',id)>>>0,0x8001FFF0,'final LR sentinel restored');
   assert.equal(c('loop_cpu_ctr',id),0);
   assert.equal(c('loop_cpu_cr',id),0);
   assert.equal(c('loop_cpu_xer',id),0);
   assert.equal(c('mem_read32',stacks[i]-16)>>>0,stacks[i],
     'C++ guest must have saved caller SP in its own stack');
 }
});
test('RED gate: 128 resets share W08 input and scheduled C++ guest RAM with no stale inputs',async()=>{
 const {wasm,call:c,writeInput}=await fresh();
 assert.equal(typeof wasm._nsmbw_services_input_store,'function','PHASE4 shared input service missing from real linked Wasm');
 for(let i=0;i<128;i++){
   c('loop_reset');assert.equal(c('mem_pages'),0);assert.equal(c('loop_trace_length'),0);
   assert.equal(c('mem_set_page_budget',1),1);
   const packet=writeInput([makePad((i&1)===1)],0x80001000,i);
   assert.equal(packet.written,true);
   assert.equal(c('mem_pages'),1);
   assert.equal(c('loop_spawn',1,0x80001000,0x80001004,1,1),1);
   assert.equal(c('loop_spawn',2,0x80001000,0xCC008000,2,1),1);
   assert.equal(c('loop_spawn',3,0x80001000,0x80001008,3,1),1);
   assert.equal(c('loop_frame',3),3);
   assert.equal(c('loop_done'),2);assert.equal(c('loop_faulted'),1);
   assert.equal(c('loop_pc',2),0);assert.equal(c('loop_guest_error',2),4);
   const original=((i<<24)|((i&1)===1?1:0))>>>0;
   assert.equal(c('mem_read32',0x80001004)>>>0,(original+1)>>>0);
   assert.equal(c('mem_read32',0x80001008)>>>0,(original+3)>>>0);
   assert.equal(c('loop_trace_length'),3);
 }
});

test('RED gate: denied CPU MMIO input preserves PC and r3 on the exact failing C++ operation',async()=>{
 const {call:c,wasm}=await fresh();
 assert.equal(typeof wasm._nsmbw_loop_cpu_spawn,'function','PHASE4 CPU state must run in compiled Wasm');
 assert.equal(c('mem_set_page_budget',4),1);
 assert.equal(c('loop_cpu_spawn',12,0x80010000,0x80005010,
   0xCC000000,0x80009000,3),1);
 let lastPc=c('loop_pc',12),lastReg=c('loop_cpu_gpr',12,3);
 for(let step=0;step<16&&c('loop_state',12)===1;step++){
   const dispatched=c('loop_frame',1);
   assert.equal(dispatched,1,'one real CPU operation must execute');
   if(c('loop_state',12)===4){
     assert.equal(c('loop_pc',12),lastPc,'MMIO failure must NOT commit guest PC');
     assert.equal(c('loop_cpu_gpr',12,3),lastReg,'MMIO denial must not mutate return register');
   }else{lastPc=c('loop_pc',12);lastReg=c('loop_cpu_gpr',12,3);}
 }
 assert.equal(c('loop_state',12),4,'MMIO reads must fail closed');
 assert.equal(c('loop_guest_error',12),4);
 assert.equal(c('loop_retry_quota',12),0);
 assert.equal(c('mem_read32',0x80009000),0);
});
test('RED gate: CPU result RAM page quota fault retries safely and completes exactly once',async()=>{
 const {wasm,call:c,writeInput}=await fresh();
 assert.equal(typeof wasm._nsmbw_loop_cpu_spawn,'function','no CPU ABI in normal linked Wasm');
 assert.equal(typeof wasm._nsmbw_services_input_store,'function','input must share CPU RAM');
 assert.equal(c('mem_set_page_budget',2),1);
 assert.equal(writeInput([makePad(true)],0x80004000,11).written,true);
 assert.equal(c('loop_cpu_spawn',1,0x80010000,0x80005010,
   0x80004000,0x80009000,5),1);
 let priorPc=c('loop_pc',1),priorReg=c('loop_cpu_gpr',1,3);
 for(let i=0;i<16&&c('loop_state',1)===1;i++){
   assert.equal(c('loop_frame',1),1);
   if(c('loop_state',1)===4){
      assert.equal(c('loop_pc',1),priorPc,'failed quota store cannot commit guest PC');
      assert.equal(c('loop_cpu_gpr',1,3),priorReg,'failed store cannot change CPU accumulator');
   }else{priorPc=c('loop_pc',1);priorReg=c('loop_cpu_gpr',1,3);}
 }
 assert.equal(c('loop_state',1),4,'quota2 permits input + stack, not guest output');
 assert.equal(c('loop_guest_error',1),3);
 assert.equal(c('loop_pc',1)>>>0,priorPc>>>0);
 assert.equal(c('mem_pages'),2);
 assert.equal(c('loop_retry_safe',1),1,'only RAM touched, safe retry');
 assert.equal(c('mem_set_page_budget',3),1);
 assert.equal(c('loop_retry_quota',1),1);
 assert.ok(c('loop_frame',32)>0);
 assert.equal(c('loop_state',1),3);
 assert.equal(c('loop_cpu_steps',1),11);
 assert.equal(c('mem_read32',0x80009000),17,'11 seq + 1 button + 5 salt');
 assert.equal(c('mem_pages'),3);
 assert.equal(c('loop_retry_quota',1),0,'no repeat of a completed guest');
});
test('RED gate: isolated CPU fixture distinguishes typed MMIO callback rejection 5 and malformed reply 6',async()=>{
 const normal=await fresh();
 assert.equal(typeof normal.wasm._nsmbw_test_policy_install,'undefined',
   'production Wasm must never embed synthetic test MMIO callbacks');
 const {wasm,call:c,writeInput}=await fresh({fixture:true});
 assert.equal(typeof wasm._nsmbw_loop_cpu_spawn,'function','CPU ABI missing in TEST-ONLY compiled fixture');
 assert.equal(typeof wasm._nsmbw_test_policy_install,'function','separate fixture must provide typed policy hooks');
 assert.equal(writeInput([makePad(true)],0x80004000,1).written,true);
 c('test_policy_install',3);
 for(const [id,reject,expected] of [[21,1,5],[22,2,6]]){
   c('test_policy_rejection',reject);
   assert.equal(c('loop_cpu_spawn',id,0x80010000,0x80005010+(id-21)*0x1000,
      0x80004000,0xCC008000+4*(id-21),1),1);
   let priorPc=c('loop_pc',id);
   for(let i=0;i<16&&c('loop_state',id)===1;i++){
     assert.equal(c('loop_frame',1),1);
     if(c('loop_state',id)===4)assert.equal(c('loop_pc',id),priorPc,
       'typed device fault must preserve offending PC');
     else priorPc=c('loop_pc',id);
   }
   assert.equal(c('loop_state',id),4,'device callback must fail guest operation');
   assert.equal(c('loop_guest_error',id),expected);
   assert.equal(c('loop_retry_quota',id),0);
 }
 assert.equal(c('test_policy_calls'),2,'one callback per fault, no duplicate replay');
});

test('RED: CPU stack frame must not alias the input packet even through cached/uncached guest addresses',async()=>{
 const {wasm,call:c,writeInput}=await fresh();
 assert.equal(typeof wasm._nsmbw_loop_cpu_spawn,'function','requires real compiled CPU ABI');
 assert.deepEqual(writeInput([makePad(true)],0x80004000,7),
   {written:true,disconnected:false,status:0});
 const word=c('mem_read32',0xC0004000)>>>0;
 assert.equal(word,0x07000001);
 const beforePages=c('mem_pages');
 assert.equal(c('loop_cpu_spawn',25,0x80010000,0x80004010,
    0xC0004000,0x80009000,3),0,
   'RED: stack frame [0x80004000,0x80004010) aliases the input packet [0xC0004000,+4)');
 assert.equal(c('loop_state',25),0,'reject BEFORE scheduling');
 assert.equal(c('loop_ready'),0);
 assert.equal(c('mem_read32',0x80004000)>>>0,word,'failed CPU configure must NOT damage input');
 assert.equal(c('mem_pages'),beforePages,'no new stack allocation on rejected spawn');
});
test('RED: independent CPU stack frames must not overlap one another, including aliasing',async()=>{
 const {wasm,call:c,writeInput}=await fresh();
 assert.equal(typeof wasm._nsmbw_loop_cpu_spawn,'function','requires real compiled CPU ABI');
 assert.equal(c('mem_set_page_budget',8),1);
 assert.equal(writeInput([makePad(true)],0x80004000,4).written,true);
 assert.equal(c('loop_cpu_spawn',1,0x80010000,0x80005010,
   0x80004000,0x80009000,1),1);
 const pc=c('loop_pc',1),reg=c('loop_cpu_gpr',1,1);
 assert.equal(c('loop_cpu_spawn',2,0x80010000,0x80005010,
   0x80004000,0x8000A000,2),0,
  'RED: two synthetic guest contexts cannot share the same 16-byte caller stack');
 assert.equal(c('loop_state',2),0);
 assert.equal(c('loop_pc',1),pc);
 assert.equal(c('loop_cpu_gpr',1,1),reg);
 assert.equal(c('mem_read32',0x80004000)>>>0,0x04000001);
 assert.equal(c('loop_frame',11),11,'legitimate CPU guest unaffected by rejected overlap');
 assert.equal(c('loop_state',1),3);
 assert.equal(c('mem_read32',0x80009000),6);
});
