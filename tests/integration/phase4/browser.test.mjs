// REAL Chrome/DevTools + REAL Emscripten one-Wasm Phase4 red-first acceptance.
// Intentionally fails when the new joined input/CPU ABI is not yet compiled.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,readFileSync,mkdtempSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {Cdp,waitUntil,stopChild,removeProfile} from '../../browser/harness.mjs';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const target=resolve(process.env.NSMB_PHASE4_ROOT||root);
const chromeBinary=[process.env.NSMB_BROWSER,
 'C:/Program Files/Google/Chrome/Application/chrome.exe',
 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'].filter(Boolean).find(existsSync);
const allow=new Map([
 ['/',[join(root,'tests/integration/phase4/diagnostic.html'),'text/html;charset=utf-8']],
 ['/frame_loop.mjs',[join(target,'web-runtime/frame-host/dist/frame_loop.mjs'),'application/javascript']],
 ['/frame_loop.wasm',[join(target,'web-runtime/frame-host/dist/frame_loop.wasm'),'application/wasm']],
 ['/host.mjs',[join(target,'web-runtime/frame-host/host.mjs'),'application/javascript']],
 ['/runtime-services/host_input.mjs',[join(target,'web-runtime/runtime-services/host_input.mjs'),'application/javascript']],
 ['/io/adapters.mjs',[join(target,'web-runtime/io/adapters.mjs'),'application/javascript']]
]);
let server,chrome,profile,cdp,base;
before(async()=>{
 for(const [uri,[file]] of allow)assert.ok(existsSync(file),'required public synthetic source missing: '+uri);
 server=createServer(async (req,res)=>{
  const resource=allow.get(req.url);
  if(!resource||!['GET','HEAD'].includes(req.method)){
    res.writeHead(404,{'content-type':'text/plain','cache-control':'no-store'}).end('Not found');return;
  }
  try{
   const bytes=await readFile(resource[0]);
   res.writeHead(200,{'content-type':resource[1],'cache-control':'no-store'});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(500).end('Synthetic test resource unavailable');}
 });
 await new Promise((ok,no)=>server.once('error',no).listen(0,'127.0.0.1',ok));
 base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{
 const failures=[];
 try{cdp?.close()}catch(e){failures.push(e)}
 try{await stopChild(chrome,'Phase4 Chrome')}catch(e){failures.push(e)}
 try{await removeProfile(profile)}catch(e){failures.push(e)}
 if(server?.listening)try{await new Promise((ok,no)=>server.close(e=>e?no(e):ok()))}catch(e){failures.push(e)}
 if(failures.length)throw new AggregateError(failures,'phase4 cleanup failure');
});
test('exact six-resource allowlist, actual WebAssembly magic, no private data or traversal',async()=>{
 for(const [path,[,mime]] of allow){
   const res=await fetch(base+path);assert.equal(res.status,200,path);
   assert.ok(res.headers.get('content-type').startsWith(mime));
   const buffer=Buffer.from(await res.arrayBuffer());
   assert.ok(buffer.length>0,path);
   if(path.endsWith('.wasm'))assert.equal(buffer.subarray(0,4).toString('hex'),'0061736d');
 }
 for(const path of ['/server.js','/.git/config','/private/main.dol',
 '/private/original.rvz','/web-runtime/src/guest_memory.cpp',
 '/frame_loop_fixture.wasm','/data/profile.yml','/assets/level1.png',
 '/%2e%2e/%2e%2e/Windows/secret','/frame_loop.wasm?download=private']){
  const result=await fetch(base+path);assert.equal(result.status,404,path);
 }
});
test('real Chrome 320px + three contexts, W08 packet in SAME guest Wasm, unplug, 128 RAF resets and compiled CPU ABI',{timeout:30000},async()=>{
 assert.ok(chromeBinary,'Chrome/Brave required; skipping is NOT a pass');
 profile=mkdtempSync(join(tmpdir(),'peach-phase4-browser-'));
 chrome=spawn(chromeBinary,['--headless=new','--no-first-run','--no-default-browser-check',
  '--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,
  'about:blank'],{stdio:'ignore'});
 const port=await waitUntil(()=>{
  if(chrome.exitCode!==null)throw Error('Chrome exited before DevTools');
  const path=join(profile,'DevToolsActivePort');
  return existsSync(path)&&Number(readFileSync(path,'utf8').split(/\r?\n/)[0])||null;
 },'Chrome CDP port');
 const pages=await waitUntil(async()=>{
  const r=await fetch('http://127.0.0.1:'+port+'/json');
  return (await r.json()).filter(x=>x.type==='page');
 },'Chrome page list');
 const socket=new WebSocket(pages[0].webSocketDebuggerUrl);
 await new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true})});
 cdp=new Cdp(socket);
 for(const name of ['Page','Runtime','Network','Log'])await cdp.send(name+'.enable');
 await cdp.send('Page.setLifecycleEventsEnabled',{enabled:true});
 await cdp.send('Emulation.setDeviceMetricsOverride',{
  width:320,height:720,deviceScaleFactor:1,mobile:true,screenWidth:320,screenHeight:720
 });
 const nav=await cdp.goto(base+'/');
 const mobile=await cdp.evaluate('({width:document.documentElement.scrollWidth,inner:innerWidth,heading:!!document.querySelector("h1"),visible:!!document.querySelector("#status")})');
 assert.equal(mobile.inner,320);assert.ok(mobile.width<=320,'320px mobile horizontal overflow');
 assert.equal(mobile.heading,true);assert.equal(mobile.visible,true);
 const result=await waitUntil(async()=>{
  const state=await cdp.evaluate('(() => { const e=document.querySelector("#status"); return {state:e?.dataset.state,text:e?.textContent,details:document.querySelector("#details")?.textContent,report:window.__phase4Report||null}; })()');
  return ['pass','fail'].includes(state.state)?state:null;
 },'real Chrome phase4 compiled CPU and shared input',20000);
 assert.deepEqual(nav.httpErrors,[],'all six public synthetic resources must load');
 assert.deepEqual(nav.errors,[],'no uncaught JS/console errors');
 assert.equal(result.state,'pass',result.text+'\n'+result.details);
 assert.equal(result.report?.backend,'real one-instance synthetic C++ linked Emscripten Wasm');
 assert.equal(result.report.stressCycles,128);
 assert.equal(result.report.cpuAbiExports,7);
 assert.deepEqual(result.report.cpuResults,[15,17,19]);
 assert.equal(result.report.cpuStress,128);
 assert.ok(result.report.cpuFrames>=11,'actual PPC call path must cross 11 browser frames');
 assert.equal(result.report.realGameBoot,false);
});
