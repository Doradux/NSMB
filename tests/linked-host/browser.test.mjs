import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {Cdp,waitUntil,stopChild,removeProfile} from '../browser/harness.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const linked=resolve(process.env.NSMB_LINKED_ROOT||root);
const browser=[process.env.NSMB_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'].filter(Boolean).find(existsSync);
const allow=new Map([
 ['/',[join(root,'tests/linked-host/diagnostic.html'),'text/html;charset=utf-8']],
 ['/frame_loop.mjs',[join(linked,'web-runtime/frame-host/dist/frame_loop.mjs'),'application/javascript']],
 ['/frame_loop.wasm',[join(linked,'web-runtime/frame-host/dist/frame_loop.wasm'),'application/wasm']],
 ['/host.mjs',[join(linked,'web-runtime/frame-host/host.mjs'),'application/javascript']],
 ['/io/adapters.mjs',[join(root,'web-runtime/io/adapters.mjs'),'application/javascript']]
]);
let server,chrome,profile,session,origin;
before(async()=>{
 for(const [uri,[path]] of allow) assert.ok(existsSync(path),'missing '+uri+' '+path);
 server=createServer(async(req,res)=>{
  const match=allow.get(req.url);
  if(!match||!['GET','HEAD'].includes(req.method)){res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');return;}
  try{
   const bytes=await fs.readFile(match[0]);
   res.writeHead(200,{'content-type':match[1],'cache-control':'no-store'});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch(e){res.writeHead(500);res.end('Read error');}
 });
 await new Promise((ok,no)=>server.once('error',no).listen(0,'127.0.0.1',ok));
 origin='http://127.0.0.1:'+server.address().port;
});
after(async()=>{
 const errors=[];
 try{session?.close()}catch(e){errors.push(e)}
 try{await stopChild(chrome,'linked Chrome')}catch(e){errors.push(e)}
 try{await removeProfile(profile)}catch(e){errors.push(e)}
 if(server?.listening)try{await new Promise((ok,no)=>server.close(e=>e?no(e):ok()))}catch(e){errors.push(e)}
 if(errors.length)throw new AggregateError(errors,'linked test cleanup failed');
});
test('exact allowlist serves only synthetic browser files, no Nintendo/game/private routes',async()=>{
 for(const [url,[,mime]] of allow){
  const res=await fetch(origin+url); assert.equal(res.status,200,url);
  assert.ok(res.headers.get('content-type').startsWith(mime),url);
  const bytes=Buffer.from(await res.arrayBuffer());
  assert.ok(bytes.length>0,url);
  if(url.endsWith('.wasm'))assert.equal(bytes.subarray(0,4).toString('hex'),'0061736d');
 }
 for(const forbidden of ['/.git/config','/server.js','/assets/world-1-1.png',
 '/private/main.dol','/web-runtime/src/guest_memory.cpp','/C:%5cWindows%5csecret']) {
   assert.equal((await fetch(origin+forbidden)).status,404,forbidden);
 }
});
test('headless real Chrome drives single-Wasm 5 animation frames, fault PC, input denial and silent offline audio',{timeout:30000},async t=>{
 if(!browser)return t.skip('Requires Chrome/Brave');
 profile=mkdtempSync(join(tmpdir(),'nsmb-peach-phase3-'));
 chrome=spawn(browser,['--headless=new','--no-first-run','--no-default-browser-check',
  '--disable-extensions','--disable-gpu','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const port=await waitUntil(()=>{
  if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);
  const file=join(profile,'DevToolsActivePort');
  return existsSync(file)&&Number(readFileSync(file,'utf8').split(/\r?\n/)[0])||null;
 },'Chrome remote debugging port');
 const pages=await waitUntil(async()=>{
  const res=await fetch('http://127.0.0.1:'+port+'/json');
  return (await res.json()).filter(x=>x.type==='page');
 },'CDP pages');
 const socket=new WebSocket(pages[0].webSocketDebuggerUrl);
 await new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true})});
 session=new Cdp(socket);
 for(const name of ['Page','Runtime','Network','Log'])await session.send(name+'.enable');
 await session.send('Page.setLifecycleEventsEnabled',{enabled:true});
 await session.send('Page.addScriptToEvaluateOnNewDocument',{
  source:'Object.defineProperty(navigator,"gpu",{configurable:true,value:undefined});'
 });
 const nav=await session.goto(origin+'/');
 const result=await waitUntil(async()=>{
  const state=await session.evaluate(String.raw`(() => {
   const e=document.getElementById('result');
   return {state:e?.dataset.state,text:e?.textContent,
    report:window.__peachLinkedReport||null,
    diagnostic:document.getElementById('details')?.textContent};
  })()`);
  return ['pass','fail'].includes(state.state)?state:null;
 },'real browser linked Wasm and frame host',18000);
 assert.equal(result.state,'pass',result.text+'\n'+result.diagnostic);
 const r=result.report;
 assert.equal(r.backend,'single actual C++ Emscripten Wasm');
 assert.equal(r.frames.length,5);
 assert.deepEqual(r.frames.map(x=>x.frame),[1,2,3,4,5]);
 assert.deepEqual(r.frames.map(x=>x.executed),[1,1,1,1,1]);
 assert.equal(r.final.done,2);assert.equal(r.final.cancelled,1);
 assert.equal(r.frames[1].contexts[2].pc,0);
 assert.equal(r.frames[1].contexts[2].err,4);
 assert.deepEqual(r.memory,{one:2,two:7});
 assert.equal(r.stressFrames,128,'128 actual browser RAF cycles without page growth');
 assert.equal(r.deniedGamepad,true);assert.equal(r.offlineAudioFrames,6000);
 assert.equal(r.canvasFallback,'passed');
 assert.deepEqual(nav.errors,[],'CDP scoped console errors');assert.deepEqual(nav.httpErrors,[]);
});
