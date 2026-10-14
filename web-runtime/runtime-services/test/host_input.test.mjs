import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import create from '../dist/input_snapshot.mjs';
import { writeSyntheticGamepadSnapshot } from '../host_input.mjs';
const wasm=fileURLToPath(new URL('../dist/input_snapshot.wasm', import.meta.url));
async function createGuest(){
 const instance=await create({locateFile:()=>wasm});
 instance._nsmbw_interop_reset();
 return instance;
}
const gamepad=()=>({connected:true,mapping:'standard',index:2,axes:[0.6,-0.6],
 buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
test('W08 synthetic standardized pad maps primary/secondary/pause and axes to one checked guest word',async()=>{
 const g=await createGuest(), pad=gamepad();
 pad.buttons[0].pressed=pad.buttons[1].pressed=pad.buttons[9].pressed=true;
 const result=writeSyntheticGamepadSnapshot(g,[pad],0x80001000,14);
 assert.deepEqual(result,{written:true,disconnected:false,status:0});
 // W08 normalized +/-0.5 quantizes symmetrically to +/-63.
 assert.equal(g._nsmbw_mem_read32(0xC0001000)>>>0,0x0EC13F07);
});
test('unavailable/unknown layout or disconnected pad writes a neutral guest packet',async()=>{
 const g=await createGuest(),p=gamepad();
 p.connected=false;
 const result=writeSyntheticGamepadSnapshot(g,[p],0x80001000,1);
 assert.deepEqual(result,{written:true,disconnected:true,status:0});
 assert.equal(g._nsmbw_mem_read32(0x80001000)>>>0,0x01000000);
 assert.equal(g._nsmbw_mem_pages(),1);
});
test('validated guest addresses/sequence do not coerce dangerous JS values',async()=>{
 const g=await createGuest(),p=gamepad();
 assert.throws(()=>writeSyntheticGamepadSnapshot(g,[p],2**32,1),/INVALID_GUEST_ADDRESS/);
 assert.throws(()=>writeSyntheticGamepadSnapshot(g,[p],0x80000000,-1),/INVALID_SEQUENCE/);
 assert.throws(()=>writeSyntheticGamepadSnapshot(g,[p],0x80000000,256),/INVALID_SEQUENCE/);
 assert.equal(g._nsmbw_mem_pages(),0);
});
test('host receives explicit sparse budget error instead of silent input loss',async()=>{
 const g=await createGuest(),p=gamepad();
 g._nsmbw_mem_set_page_budget(0);
 const result=writeSyntheticGamepadSnapshot(g,[p],0x80002000,1);
 assert.deepEqual(result,{written:false,disconnected:false,status:3});
 assert.equal(g._nsmbw_mem_pages(),0);
});

test('controller removal releases previously pressed buttons in guest memory',async()=>{
 const g=await createGuest(), p=gamepad();
 p.buttons[0].pressed=true;
 assert.equal(writeSyntheticGamepadSnapshot(g,[p],0x80001000,1).written,true);
 assert.equal(g._nsmbw_mem_read8(0x80001003),1);
 p.connected=false;
 const stopped=writeSyntheticGamepadSnapshot(g,[p],0x80001000,2);
 assert.deepEqual(stopped,{written:true,disconnected:true,status:0});
 assert.equal(g._nsmbw_mem_read32(0x80001000)>>>0,0x02000000,
   'all buttons and axes released when controller disappears');
});
test('disconnect neutralization surfaces checked RAM quota failure rather than hiding it',async()=>{
 const g=await createGuest(), p=gamepad();
 p.connected=false;
 g._nsmbw_mem_set_page_budget(0);
 const result=writeSyntheticGamepadSnapshot(g,[p],0x80001000,3);
 assert.deepEqual(result,{written:false,disconnected:true,status:3});
 assert.equal(g._nsmbw_mem_pages(),0);
});
