import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import create from '../dist/joined_input.mjs';
import {applyJoinedInputFrame,reapJoinedInputFrame,keyboardAsStandardGamepad,nextInputSequence} from '../joined_host_input.mjs';
const wasm=fileURLToPath(new URL('../dist/joined_input.wasm',import.meta.url));
async function fresh() {
  const m=await create({locateFile:()=>wasm});
  m._nsmbw_loop_reset();
  return m;
}
const pad=()=>({index:0,mapping:'standard',connected:true,axes:[0.6,-0.6,0,0],
  buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
test('actual one-Wasm guest consumes W08 Gamepad packet and changes a checked RAM value',async()=>{
  const m=await fresh(),p=pad();
  p.buttons[0].pressed=true;p.buttons[1].pressed=true;p.buttons[9].pressed=true;
  const state=applyJoinedInputFrame(m,[p],{guestId:7,sequence:14,addend:5});
  assert.equal(state.input.written,true);
  assert.equal(state.guestError,0);
  assert.deepEqual([state.state,state.pc,state.executed],[3,1,true]);
  const input=m._nsmbw_mem_read32(0xC0004000)>>>0;
  assert.equal(input,0x0EC13F07);
  const output=m._nsmbw_mem_read32(0xC0009000)>>>0;
  assert.equal(output,(input+5)>>>0);
  assert.equal(state.regA,output);
  assert.equal(m._nsmbw_mem_pages(),2);
  assert.equal(reapJoinedInputFrame(m,7),true);
});
test('a physically disconnected device neutralizes previously latched guest buttons',async()=>{
  const m=await fresh(),p=pad();
  p.buttons[0].pressed=true;
  assert.equal(applyJoinedInputFrame(m,[p],{sequence:1}).state,3);
  assert.equal(m._nsmbw_mem_read8(0x80004003),1);
  assert.equal(reapJoinedInputFrame(m),true);
  p.connected=false;
  const neutral=applyJoinedInputFrame(m,[p],{sequence:2});
  assert.deepEqual([neutral.input.disconnected,neutral.input.written,neutral.state],[true,true,3]);
  assert.equal(m._nsmbw_mem_read32(0x80004000)>>>0,0x02000000);
  assert.equal(m._nsmbw_mem_read32(0x80009000)>>>0,0x02000001);
});
test('synthetic keyboard intent maps into standard buttons and aliases with opposite D-pad cancellation',async()=>{
  const m=await fresh();
  const pressed=keyboardAsStandardGamepad(['ArrowLeft','ArrowRight','Space','Escape']);
  const state=applyJoinedInputFrame(m,[pressed],{sequence:255,addend:0});
  assert.equal(state.state,3);
  assert.equal(m._nsmbw_mem_read32(0x80004000)>>>0,0xFF000005);
  assert.equal(nextInputSequence(255),0);
  assert.equal(nextInputSequence(0),1);
  assert.throws(()=>nextInputSequence(-1),/INVALID_SEQUENCE/);
});
test('hostile oversized keyboard provider fails closed before any guest allocation',async()=>{
  const m=await fresh();
  assert.throws(()=>keyboardAsStandardGamepad(Array.from({length:100},()=> 'Space')),/INVALID_KEYBOARD/);
  assert.throws(()=>keyboardAsStandardGamepad(new Set([null])),/INVALID_KEYBOARD/);
  assert.equal(m._nsmbw_mem_pages(),0);
});
test('invalid input address, addend, sequence, guest ID fail before any write',async()=>{
  const m=await fresh(),p=pad();
  const bad=[{inputAddress:0xCC008000},{inputAddress:0x80000001},
    {inputAddress:2**32},{outputAddress:-1},{guestId:0},{sequence:256},{addend:-1}];
  for (const opts of bad) {
    if(opts.inputAddress===0xCC008000) {
      const r=applyJoinedInputFrame(m,[p],opts);
      assert.equal(r.input.status,7);
      assert.equal(r.executed,false);
    } else assert.throws(()=>applyJoinedInputFrame(m,[p],opts));
  }
  assert.equal(m._nsmbw_mem_pages(),0);
  assert.equal(m._nsmbw_loop_ready(),0);
});
test('quota-zero failure of input packet never spawns or partially allocates a guest context',async()=>{
  const m=await fresh();
  assert.equal(m._nsmbw_mem_set_page_budget(0),1);
  const r=applyJoinedInputFrame(m,[pad()],{sequence:23});
  assert.deepEqual([r.input.written,r.input.status,r.executed,r.state],[false,3,false,0]);
  assert.equal(m._nsmbw_mem_pages(),0);
  assert.equal(m._nsmbw_loop_ready(),0);
  assert.equal(m._nsmbw_mem_set_page_budget(2),1);
  assert.equal(applyJoinedInputFrame(m,[pad()],{sequence:23}).state,3);
});
test('guest destination quota error faults PC0, output untouched, input remains valid',async()=>{
  const m=await fresh(),p=pad();
  assert.equal(m._nsmbw_mem_set_page_budget(1),1);
  const r=applyJoinedInputFrame(m,[p],{sequence:9});
  assert.equal(r.input.written,true);
  assert.deepEqual([r.state,r.pc,r.guestError,r.retrySafe],[4,0,3,1]);
  assert.equal(m._nsmbw_mem_read32(0x80004000)>>>0,0x09C13F00);
  assert.equal(m._nsmbw_mem_read32(0x80009000),0);
  assert.equal(m._nsmbw_mem_pages(),1);
  assert.equal(m._nsmbw_loop_retry_quota(1),1,'host explicitly chooses quota retry');
  assert.equal(m._nsmbw_mem_set_page_budget(2),1);
  assert.equal(m._nsmbw_loop_frame(1),1);
  assert.equal(m._nsmbw_loop_pc(1),1);
  assert.equal(m._nsmbw_loop_state(1),3);
});
test('guest destination MMIO refuses without invoking a device callback and leaves input page intact',async()=>{
  const m=await fresh();
  const r=applyJoinedInputFrame(m,[pad()],{outputAddress:0xCC008000});
  assert.equal(r.input.status,0);
  assert.deepEqual([r.guestError,r.state,r.pc],[4,4,0]);
  assert.equal(m._nsmbw_interop_device_invoked(),0);
  assert.equal(r.retrySafe,0);
  assert.equal(m._nsmbw_mem_pages(),1);
});
test('128 frames / 128 contexts recycled safely with same checked guest RAM and bounded page count',async()=>{
  const m=await fresh(),p=pad();
  assert.equal(m._nsmbw_mem_set_page_budget(2),1);
  for(let i=0;i<128;i++) {
    const r=applyJoinedInputFrame(m,[p],{sequence:i&255,guestId:(i%8)+1,addend:i});
    assert.equal(r.state,3,'iteration '+i);
    assert.equal(r.pc,1);
    const expected=(m._nsmbw_mem_read32(0x80004000)+i)>>>0;
    assert.equal(r.regA,expected);
    assert.equal(reapJoinedInputFrame(m,(i%8)+1),true);
    assert.equal(m._nsmbw_mem_pages(),2);
    assert.equal(m._nsmbw_loop_trace_length()<=256,true);
  }
  m._nsmbw_loop_reset();
  assert.equal(m._nsmbw_mem_pages(),0);
  assert.equal(m._nsmbw_loop_done(),0);
});
test('independent instances cannot observe one another snapshot or guest state',async()=>{
  const a=await fresh(),b=await fresh();
  const r=applyJoinedInputFrame(a,[pad()],{sequence:55});
  assert.equal(r.state,3);
  assert.equal(b._nsmbw_mem_read32(0x80004000),0);
  assert.equal(b._nsmbw_loop_state(1),0);
});

test('helper refuses another runnable guest BEFORE overwriting its shared input buffer',async()=>{
  const m=await fresh();
  assert.equal(m._nsmbw_loop_spawn(44,0x80004000,0x80009000,1,1),1);
  assert.throws(()=>applyJoinedInputFrame(m,[pad()],{guestId:55,sequence:5}),
    /OTHER_GUEST_ALREADY_RUNNABLE/);
  assert.equal(m._nsmbw_mem_pages(),0);
  assert.equal(m._nsmbw_loop_state(44),1);
});
test('same compiled guest module can interleave three independent frame contexts over shared W04 RAM',async()=>{
  const m=await fresh();
  // Different packet slots and outputs but exactly ONE checked memory backend.
  for(let i=0;i<3;i++) {
    assert.equal(m._nsmbw_services_input_store(0x80004000+i*4,i+1,0,0,i+11),1);
    assert.equal(m._nsmbw_loop_spawn(i+1,0xC0004000+i*4,0x80009000+i*4,100+i,1),1);
  }
  assert.equal(m._nsmbw_loop_frame(3),3);
  for(let i=0;i<3;i++) {
    assert.equal(m._nsmbw_loop_state(i+1),3);
    assert.equal(m._nsmbw_loop_pc(i+1),1);
    const word=m._nsmbw_mem_read32(0x80004000+i*4)>>>0;
    assert.equal(m._nsmbw_loop_reg_a(i+1)>>>0,(word+100+i)>>>0);
  }
  assert.equal(m._nsmbw_mem_pages(),2);
});
test('hostile oversized Gamepad array-like input is neutralized without enumeration or memory blowup',async()=>{
  const m=await fresh();
  let reads=0;
  const hostile={length:999999,get 0(){reads++;throw Error('SHOULD_NOT_READ');}};
  const r=applyJoinedInputFrame(m,hostile,{sequence:8});
  assert.equal(r.state,3);
  assert.equal(r.input.disconnected,true);
  assert.equal(reads,0);
  assert.equal(m._nsmbw_mem_read32(0x80004000)>>>0,0x08000000);
  assert.equal(m._nsmbw_mem_pages(),2);
});

test('paused contexts cannot have their shared input overwritten by one-shot helper',async()=>{
 const m=await fresh();
 assert.equal(m._nsmbw_services_input_store(0x80004000,1,0,0,1),1);
 assert.equal(m._nsmbw_loop_spawn(77,0x80004000,0x80009000,1,1),1);
 assert.equal(m._nsmbw_loop_suspend(77),1);
 const original=m._nsmbw_mem_read32(0x80004000)>>>0;
 assert.throws(()=>applyJoinedInputFrame(m,[pad()],{guestId:88,sequence:10}),
   /GUEST_CONTEXTS_ALREADY_PRESENT/);
 assert.equal(m._nsmbw_mem_read32(0x80004000)>>>0,original,
  'paused guest source input must not be overwritten before resume');
 assert.equal(m._nsmbw_loop_state(77),2);
});
