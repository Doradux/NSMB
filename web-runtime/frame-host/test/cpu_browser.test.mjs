import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,access,mkdtemp,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {Cdp,waitUntil,stopChild} from '../../../tests/browser/harness.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const candidates=[process.env.NSMB_BROWSER,
 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean);
const chromePath=(await Promise.all(candidates.map(p=>access(p).then(()=>p,()=>null)))).find(Boolean);
const allow=new Map([
 ['/',['web-runtime/frame-host/cpu_diagnostic.html','text/html;charset=utf-8']],
 ['/host.mjs',['web-runtime/frame-host/host.mjs','application/javascript']],
 ['/dist/frame_loop.mjs',['web-runtime/frame-host/dist/frame_loop.mjs','application/javascript']],
 ['/dist/frame_loop.wasm',['web-runtime/frame-host/dist/frame_loop.wasm','application/wasm']],
 ['/runtime-services/host_input.mjs',['web-runtime/runtime-services/host_input.mjs','application/javascript']],
 ['/io/adapters.mjs',['web-runtime/io/adapters.mjs','application/javascript']]
]);
test('real Chrome: PPC stack/call/LR + W08 input in SAME checked Wasm over 128 RAF resets',{
 skip:!chromePath && 'real Chromium required',timeout:40000
},async()=>{
 const profile=await mkdtemp(join(tmpdir(),'nsmb-phase4-cpu-'));
 const server=createServer(async(req,res)=>{
   const pathname=req.url.replace(/^\/web-runtime\//,'/');
   const route=allow.get(pathname);
   if(!route||!['GET','HEAD'].includes(req.method)){res.writeHead(404).end();return;}
   try{
     const bytes=await readFile(join(root,route[0]));
     res.writeHead(200,{'content-type':route[1],'cache-control':'no-store'});
     res.end(req.method==='HEAD'?undefined:bytes);
   }catch{res.writeHead(500).end();}
 });
 let chrome,client,cdp;
 try{
  await new Promise((ok,no)=>server.once('error',no).listen(0,'127.0.0.1',ok));
  const url='http://127.0.0.1:'+server.address().port;
  chrome=spawn(chromePath,['--headless=new','--no-first-run','--no-default-browser-check',
   '--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  const port=await waitUntil(async()=>{
    const txt=await readFile(join(profile,'DevToolsActivePort'),'utf8');
    return Number(txt.split(/\r?\n/)[0])||null;
  },'Chrome CDP port');
  const pages=await waitUntil(async()=>{
    const response=await fetch('http://127.0.0.1:'+port+'/json');
    return (await response.json()).filter(p=>p.type==='page');
  },'Chrome target');
  client=new WebSocket(pages[0].webSocketDebuggerUrl);
  await Promise.race([
    new Promise((ok,no)=>{
      client.addEventListener('open',ok,{once:true});
      client.addEventListener('error',no,{once:true});
    }),
    new Promise((_,no)=>setTimeout(()=>no(Error('CDP timeout')),5000))
  ]);
  cdp=new Cdp(client);
  for(const m of ['Page.enable','Runtime.enable','Network.enable','Log.enable'])await cdp.send(m);
  await cdp.send('Page.setLifecycleEventsEnabled',{enabled:true});
  const nav=await cdp.goto(url+'/');
  const result=await waitUntil(async()=>{
    const data=await cdp.evaluate('window.__nsmbPhase4Cpu || null');
    return ['pass','fail'].includes(data?.status)?data:null;
  },'actual PPC ABI + controller one-Wasm Chrome',30000,80);
  assert.equal(result.status,'pass',JSON.stringify(result));
  assert.equal(result.sameWasm,true);
  assert.equal(result.callSteps,11);
  assert.equal(result.firstFrames,17);
  assert.equal(result.disconnectFrames,11);
  assert.equal(result.stressCycles,128);
  assert.equal(result.stressFrames,128);
  assert.equal(result.finalPages,0);
  assert.deepEqual(nav.errors,[]);
  assert.deepEqual(nav.httpErrors,[]);
  for(const path of ['/private/game.iso','/.git/config','/dist/frame_loop_fixture.wasm']){
    assert.equal((await fetch(url+path)).status,404,'private/fixture denied '+path);
  }
 }finally{
   cdp?.close()??client?.close();
   await stopChild(chrome,'phase4 guest CPU Chrome');
   await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:150});
   if(server.listening)await new Promise(resolve=>server.close(resolve));
 }
});
