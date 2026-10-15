// Owner-independent Toad Phase4 joined input service acceptance.
// Point NSMB_TOAD_PHASE4_ROOT at an exact clean candidate (never at owner dirty worktree).
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {existsSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.NSMB_TOAD_PHASE4_ROOT||process.env.NSMB_PHASE4_ROOT||'.');
const base=resolve(root,'web-runtime/runtime-services');
const wasm=resolve(base,'dist/joined_input.wasm'),esm=resolve(base,'dist/joined_input.mjs');
const bridge=resolve(base,'joined_host_input.mjs');
async function fresh(){
 for(const f of [wasm,esm,bridge])assert.ok(existsSync(f),'missing compiled Toad phase4 joined-Wasm candidate '+f);
 assert.equal(readFileSync(wasm).subarray(0,4).toString('hex'),'0061736d');
 const module=await (await import(pathToFileURL(esm).href)).default({locateFile:()=>wasm});
 const {applyJoinedInputFrame,reapJoinedInputFrame}=await import(pathToFileURL(bridge).href);
 module._nsmbw_loop_reset();
 return {module,applyJoinedInputFrame,reapJoinedInputFrame};
}
test('real compiled joined W08 input and W03 guest share the exact same checked W04 address space',async()=>{
 const {module:m,applyJoinedInputFrame:apply,reapJoinedInputFrame:reap}=await fresh();
 assert.equal(typeof m._nsmbw_test_policy_install,'undefined','no fake MMIO hooks in production');
 const result=apply(m,[],{guestId:7,sequence:12,addend:5});
 assert.equal(result.input.written,true);
 assert.equal(result.input.disconnected,true);
 assert.equal(result.state,3);
 assert.equal(m._nsmbw_mem_read32(0xC0004000)>>>0,0x0C000000);
 assert.equal(m._nsmbw_mem_read32(0x80009000)>>>0,0x0C000005);
 assert.equal(result.regA,0x0C000005);
 assert.equal(reap(m,7),true);
});
test('RED: no packet mutation when all eight guest slots contain completed unreaped contexts',async()=>{
 const {module:m,applyJoinedInputFrame:apply}=await fresh();
 assert.equal(m._nsmbw_mem_write32(0x80004000,0x11223344),1);
 for(let id=1;id<=8;id++){
  assert.equal(m._nsmbw_loop_spawn(id,0x80004000,0x80009000+4*id,0,1),1);
 }
 assert.equal(m._nsmbw_loop_frame(8),8);
 assert.equal(m._nsmbw_loop_done(),8);
 assert.equal(m._nsmbw_loop_ready(),0,'no READY contexts does not mean free capacity');
 assert.equal(m._nsmbw_loop_state(9),0);
 const before=m._nsmbw_mem_read32(0x80004000)>>>0;
 assert.throws(()=>apply(m,[],{guestId:9,sequence:99}),/JOINED_GUEST_SPAWN_REJECTED|GUEST_CONTEXT_CAPACITY|GUEST_CONTEXTS_ALREADY_PRESENT/);
 assert.equal(m._nsmbw_loop_state(9),0,'requested context was never scheduled');
 assert.equal(m._nsmbw_mem_read32(0x80004000)>>>0,before,
  'FAILED frame MUST NOT change shared guest input snapshot BEFORE spawn checks');
 assert.equal(m._nsmbw_loop_done(),8,'cannot auto-reap other owned guest contexts');
});

test('RED: suspended guest retains owned input word until resumed, no silent overwrite by another frame',async()=>{
 const {module:m,applyJoinedInputFrame:apply}=await fresh();
 assert.equal(m._nsmbw_mem_write32(0x80004000,0x01000001),1);
 assert.equal(m._nsmbw_loop_spawn(44,0x80004000,0x80009000,0,1),1);
 assert.equal(m._nsmbw_loop_suspend(44),1);
 assert.equal(m._nsmbw_loop_paused(),1);
 assert.equal(m._nsmbw_loop_ready(),0,'paused context still owns shared packet');
 assert.throws(()=>apply(m,[],{guestId:55,sequence:9}),
   /GUEST_CONTEXTS_ALREADY_PRESENT|OTHER_GUEST_ALREADY_RUNNABLE|GUEST_INPUT_OWNED/);
 assert.equal(m._nsmbw_mem_read32(0x80004000)>>>0,0x01000001,
   'a rejected input attempt must not rewrite an existing paused guest packet');
 assert.equal(m._nsmbw_loop_state(55),0);
 assert.equal(m._nsmbw_loop_resume(44),1);
 assert.equal(m._nsmbw_loop_frame(1),1);
 assert.equal(m._nsmbw_loop_state(44),3);
 assert.equal(m._nsmbw_loop_reg_a(44)>>>0,0x01000001,'paused context must see original input packet');
});
