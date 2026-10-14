import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, waitUntil, stopChild, removeProfile } from '../../../tests/browser/harness.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const browser=[
  process.env.NSMB_BROWSER,
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].filter(Boolean).find(existsSync);

async function allocatePort() {
 const temp=createServer();
 await new Promise((ok,no)=>temp.once('error',no).listen(0,'127.0.0.1',ok));
 const port=temp.address().port;
 await new Promise(ok=>temp.close(ok));
 return port;
}

test('real site serves single-Wasm demo buttons and blocks fixture/private files', {
  skip:!browser && 'requires Chrome or Brave',timeout:35000
},async()=>{
 const port=await allocatePort();
 const origin='http://127.0.0.1:'+port;
 const profile=mkdtempSync(join(tmpdir(),'nsmb-joined-ui-'));
 let server,chrome,socket,cdp;
 try{
   server=spawn(process.execPath,[join(root,'server.js')],{
     cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore'
   });
   await waitUntil(async()=>{
     if(server.exitCode!==null)throw Error('Local HTTP server exited '+server.exitCode);
     const res=await fetch(origin+'/web-runtime/frame-host/demo.html');
     return res.status===200;
   },'joined demo HTTP startup');
   for(const route of [
     '/web-runtime/frame-host/dist/frame_loop.mjs',
     '/web-runtime/frame-host/dist/frame_loop.wasm',
     '/web-runtime/frame-host/host.mjs'
   ]) {
     const response=await fetch(origin+route);
     assert.equal(response.status,200,route);
   }
   for(const route of [
     '/web-runtime/frame-host/dist/frame_loop_fixture.mjs',
     '/web-runtime/frame-host/dist/frame_loop_fixture.wasm',
     '/web-runtime/frame-host/typed_policy_diagnostic.html',
     '/private/original-game.iso','/.git/config'
   ]) {
     const response=await fetch(origin+route);
     assert.equal(response.status,404,'private/test fixture denied: '+route);
   }
   for(const route of ['/%','/%FF']) {
     const response=await fetch(origin+route);
     assert.equal(response.status,400,'malformed encoded path must not crash server');
   }
   assert.equal((await fetch(origin+'/web-runtime/frame-host/demo.html')).status,200);
   chrome=spawn(browser,['--headless=new','--no-first-run','--no-default-browser-check',
     '--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
   ],{stdio:'ignore'});
   const remotePort=await waitUntil(()=>{
     const data=readFileSync(join(profile,'DevToolsActivePort'),'utf8');
     return Number(data.split(/\r?\n/)[0])||null;
   },'Chrome remote DevTools');
   const pages=await waitUntil(async()=>{
     const response=await fetch('http://127.0.0.1:'+remotePort+'/json');
     return (await response.json()).filter(x=>x.type==='page');
   },'Chrome page');
   socket=new WebSocket(pages[0].webSocketDebuggerUrl);
   await Promise.race([
     new Promise((ok,no)=>{
       socket.addEventListener('open',ok,{once:true});
       socket.addEventListener('error',no,{once:true});
     }),
     new Promise((_,no)=>setTimeout(()=>no(Error('CDP connection timeout')),5000))
   ]);
   cdp=new Cdp(socket);
   for(const method of ['Page.enable','Runtime.enable','Network.enable','Log.enable'])await cdp.send(method);
   await cdp.send('Page.setLifecycleEventsEnabled',{enabled:true});
   const nav=await cdp.goto(origin+'/web-runtime/frame-host/demo.html');
   await waitUntil(()=>cdp.evaluate("window.__nsmbJoinedDemo?.mode==='ready'"),'real Wasm demo ready');
   const paused=await cdp.evaluate(String.raw`(async()=>{
     document.querySelector('#start').click();
     for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);
     document.querySelector('#pause').click();
     return {mode:window.__nsmbJoinedDemo.mode,...window.__nsmbJoinedDemo.snapshot};
   })()`);
   assert.equal(paused.mode,'paused');
   assert.ok(paused.frames>=1 && paused.frames<9,'paused mid-execution');
   assert.ok(paused.paused>=1,'ready guest contexts were suspended');
   await cdp.evaluate("document.querySelector('#resume').click()");
   const finished=await waitUntil(async()=>{
     const current=await cdp.evaluate("({mode:window.__nsmbJoinedDemo?.mode,snap:window.__nsmbJoinedDemo?.snapshot})");
     return current.mode==='blocked'?current:null;
   },'guest context state after clicking Resume',12000);
   assert.equal(finished.snap.done,2);
   assert.equal(finished.snap.faulted,1);
   assert.deepEqual(finished.snap.contexts.map(x=>x.pc),[4,4,0]);
   assert.deepEqual(finished.snap.contexts.map(x=>x.regA),[14,28,0]);
   assert.deepEqual(finished.snap.contexts.map(x=>x.guestError),[0,0,4]);
   assert.equal(finished.snap.frames,9);
   const stopped=await cdp.evaluate(String.raw`(()=>{
      document.querySelector('#reset').click();
      document.querySelector('#start').click();
      document.querySelector('#stop').click();
      return {mode:window.__nsmbJoinedDemo.mode,...window.__nsmbJoinedDemo.snapshot};
   })()`);
   assert.equal(stopped.mode,'stopped');
   assert.equal(stopped.frames,0,'Stop before first requestAnimationFrame cannot execute guest work');
   assert.equal(stopped.cancelled,3);
   const reset=await cdp.evaluate(String.raw`(()=>{
     document.querySelector('#reset').click();
     return {mode:window.__nsmbJoinedDemo.mode,pages:window.__nsmbJoinedDemo.guestPages,
       ...window.__nsmbJoinedDemo.snapshot};
   })()`);
   assert.equal(reset.mode,'ready');
   assert.equal(reset.frames,0);
   assert.equal(reset.ready,3);
   assert.deepEqual(reset.contexts.map(x=>x.pc),[0,0,0]);
   assert.equal(reset.pages,3,'fresh synthetic guest RAM only');
   assert.deepEqual(nav.errors,[]);
   assert.deepEqual(nav.httpErrors,[]);
 }finally{
   cdp?.close()??socket?.close();
   await stopChild(chrome,'phase3 interactive demo browser');
   await stopChild(server,'phase3 demo HTTP server');
   await removeProfile(profile);
 }
});
