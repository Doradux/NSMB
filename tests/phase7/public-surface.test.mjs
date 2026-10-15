// Public synthetic Phase4 server/normal Wasm security gates; NEVER read
// original Wii files. Run on an exact committed main/candidate checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {waitUntil,stopChild} from '../browser/harness.mjs';

const root=resolve(process.env.NSMB_PHASE7_PUBLIC_ROOT||process.cwd());
const wasmPath=resolve(root,'web-runtime/frame-host/dist/frame_loop.wasm');
const jsPath=resolve(root,'web-runtime/frame-host/dist/frame_loop.mjs');
const fixturePath=resolve(root,'web-runtime/frame-host/dist/frame_loop_fixture.wasm');
const serverPath=resolve(root,'server.js');
async function reserveFreePort(){
 const listener=createServer();
 await new Promise((ok,no)=>listener.once('error',no).listen(0,'127.0.0.1',ok));
 const port=listener.address().port;
 await new Promise((ok,no)=>listener.close(error=>error?no(error):ok()));
 return port;
}
test('exact real compiled normal C++ Wasm never exports TEST-ONLY device mock callbacks',async()=>{
 for(const f of [wasmPath,jsPath,fixturePath])assert.equal(existsSync(f),true,'artifact missing '+f);
 const normal=readFileSync(wasmPath),fixture=readFileSync(fixturePath);
 assert.equal(normal.subarray(0,4).toString('hex'),'0061736d');
 assert.equal(fixture.subarray(0,4).toString('hex'),'0061736d');
 const factory=(await import(pathToFileURL(jsPath).href)).default;
 const wasm=await factory({locateFile:()=>wasmPath});
 for(const key of ['_nsmbw_test_policy_install','_nsmbw_test_policy_rejection',
 '_nsmbw_test_policy_calls','_nsmbw_test_policy_last_region']){
   assert.equal(typeof wasm[key],'undefined','private fixture callback leaked into normal linked WASM: '+key);
 }
 assert.equal(typeof wasm._nsmbw_loop_cpu_spawn,'function','real compiled CPU export required');
 assert.equal(typeof wasm._nsmbw_services_input_store,'function','shared input service must be same normal Wasm');
 for(let i=0;i<128;i++){
   wasm._nsmbw_loop_reset();
   assert.equal(wasm._nsmbw_mem_pages(),0,'guest memory leaked on reset '+i);
   assert.equal(wasm._nsmbw_loop_ready(),0,'guest runnable context leaked '+i);
   assert.equal(wasm._nsmbw_loop_done(),0,'guest finished context leaked '+i);
   assert.equal(wasm._nsmbw_loop_trace_length(),0,'guest trace leaked '+i);
   assert.equal(wasm._nsmbw_mem_set_page_budget(1),1);
   assert.equal(wasm._nsmbw_services_input_store(0x80004000,i&7,0,0,i),1);
   assert.equal(wasm._nsmbw_mem_pages(),1,'one-page input atomic packet '+i);
   assert.equal(wasm._nsmbw_mem_read32(0xC0004000)>>>0,
      ((i<<24)|(i&7))>>>0);
 }
 wasm._nsmbw_loop_reset();
 assert.equal(wasm._nsmbw_mem_pages(),0);
});
test('actual public server ONLY serves allowlisted synthetic artifacts; private and test hooks 404',{timeout:20000},async()=>{
 assert.equal(existsSync(serverPath),true);
 const port=await reserveFreePort(),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[serverPath],{
   cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore'});
 try{
   await waitUntil(async()=>{
     if(child.exitCode!==null)throw Error('site server exited '+child.exitCode);
     try{const r=await fetch(base+'/');return r.status===200}catch{return false}
   },'public site server on loopback',6000);
   const good=new Map([
     ['/','text/html'],['/web-runtime/frame-host/dist/frame_loop.mjs','application/javascript'],
     ['/web-runtime/frame-host/dist/frame_loop.wasm','application/wasm'],
     ['/web-runtime/frame-host/host.mjs','application/javascript']
   ]);
   for(const [url,mime] of good){
     const res=await fetch(base+url);
     assert.equal(res.status,200,url);
     assert.match(res.headers.get('content-type'),new RegExp(mime));
     if(url.endsWith('.wasm')){
       assert.equal(Buffer.from(await res.arrayBuffer()).subarray(0,4).toString('hex'),'0061736d');
     }
   }
   for(const url of [
      '/web-runtime/frame-host/dist/frame_loop_fixture.mjs',
      '/web-runtime/frame-host/dist/frame_loop_fixture.wasm',
      '/web-runtime/runtime-services/input_snapshot.cpp',
      '/web-runtime/frame-host/guest_cpu.cpp',
      '/scripts/audit_profile.py',
      '/tests/phase7/test_audit_failclosed.py',
      '/tests/phase7/test_audit_json_duplicates.py',
      '/web-runtime/frame-host/dist/frame_loop_translated_store_fixture.wasm',
      '/web-runtime/frame-host/dist/frame_loop_translated_store_fixture.mjs',
      '/web-runtime/frame-host/dist/frame_loop_translated_load_fixture.wasm',
      '/upstream-nsmbw/runtime/MemoryInline.cpp',
      '/private/game.dol','/private/Nintendo.rvz','/.git/config',
      '/%2e%2e/%2e%2e/Windows/win.ini',
      '/web-runtime/frame-host/dist/FRAME_LOOP.WASM'
   ]){
     const r=await fetch(base+url);
     assert.equal(r.status,404,'must not publicly reveal private/test files: '+url);
     assert.equal((await r.text()).includes('sourceMappingURL'),false);
   }
   // Query parameters do not select a different resource. They must never
   // select a private file or modify the public Wasm bytes.
   const plain=Buffer.from(await (await fetch(base+'/web-runtime/frame-host/dist/frame_loop.wasm')).arrayBuffer());
   const queried=Buffer.from(await (await fetch(base+'/web-runtime/frame-host/dist/frame_loop.wasm?private=1')).arrayBuffer());
   assert.deepEqual(queried,plain,'query string changed public binary or revealed a private resource');
   for(const url of ['/web-runtime/frame-host/dist/frame_loop_fixture.wasm',
      '/scripts/audit_profile.py']){
     const res=await fetch(base+url,{method:'HEAD'});
     assert.equal(res.status,404,'HEAD must match GET allowlist');
   }
   const malformed=await fetch(base+'/%E0%A4%A');
   assert.equal(malformed.status,400);
 }finally{await stopChild(child,'Phase7 public server');}
});
