import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, waitUntil, stopChild, removeProfile } from '../browser/harness.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const project=resolve(here,'../..');
const external=process.env.NSMB_W03_HOST_ROOT;
const host=external?resolve(external,'web-runtime/frame-host'):null;
const browser=[
  process.env.NSMB_BROWSER,
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium','/usr/bin/google-chrome'
].filter(Boolean).find(existsSync);

test('real Chrome performs 128 4-frame sessions on ONE checked linked Wasm instance', {
  skip:!external || !browser ? 'Set NSMB_W03_HOST_ROOT and install Chrome/Brave' : false,
  timeout:45000
},async()=>{
  const routes=new Map([
    ['/',['stress.html','text/html; charset=utf-8',here]],
    ['/runtime/host.mjs',['host.mjs','application/javascript',host]],
    ['/runtime/frame_loop.mjs',['dist/frame_loop.mjs','application/javascript',host]],
    ['/runtime/frame_loop.wasm',['dist/frame_loop.wasm','application/wasm',host]]
  ]);
  for(const [url,[name,,folder]] of routes){
    assert.ok(existsSync(join(folder,name)),'Missing '+url+'; linked W03 module must exist');
  }
  let chrome,session,socket;
  const profile=mkdtempSync(join(tmpdir(),'nsmb-luigi-phase3-stress-'));
  const server=createServer(async(req,res)=>{
    const item=routes.get(req.url);
    if(!item || !['GET','HEAD'].includes(req.method)){
      res.writeHead(404,{'content-type':'text/plain'}).end('Not found');return;
    }
    try{
      const bytes=await fs.readFile(join(item[2],item[0]));
      res.writeHead(200,{'content-type':item[1],'cache-control':'no-store'});
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch{res.writeHead(500).end();}
  });
  try {
    await new Promise((yes,no)=>server.once('error',no).listen(0,'127.0.0.1',yes));
    const origin='http://127.0.0.1:'+server.address().port;
    chrome=spawn(browser,[
      '--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions',
      '--disable-background-timer-throttling','--disable-renderer-backgrounding',
      '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
    ],{stdio:'ignore'});
    const port=await waitUntil(async()=>{
      const txt=await fs.readFile(join(profile,'DevToolsActivePort'),'utf8');
      return Number(txt.split(/\r?\n/)[0])||null;
    },'real Chrome profile debugging port');
    const pages=await waitUntil(async()=>{
      const result=await fetch('http://127.0.0.1:'+port+'/json');
      return (await result.json()).filter(x=>x.type==='page');
    },'headless page');
    socket=new WebSocket(pages[0].webSocketDebuggerUrl);
    await Promise.race([
      new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true});}),
      new Promise((_,no)=>setTimeout(()=>no(Error('CDP WebSocket connect timeout')),5000))
    ]);
    session=new Cdp(socket);
    for(const method of ['Page.enable','Runtime.enable','Network.enable','Log.enable']){
      await session.send(method);
    }
    await session.send('Page.setLifecycleEventsEnabled',{enabled:true});
    const navigation=await session.goto(origin+'/');
    const result=await waitUntil(async()=>{
      const data=await session.evaluate('window.__nsmbPhase3Stress || null');
      return ['pass','fail'].includes(data?.status)?data:null;
    },'128 browser RAF cycles linked real-Wasm diagnostic',30000,150);
    assert.equal(result.status,'pass',JSON.stringify(result));
    assert.equal(result.moduleType,'actual linked Emscripten C++ WASM');
    assert.equal(result.iterations,128);
    assert.equal(result.animationFrames,512);
    assert.equal(result.guestOperations,896);
    assert.equal(result.isolatedGuestFaults,128);
    assert.equal(result.finalPages,0);
    assert.deepEqual(navigation.errors,[],'browser console/exception failures');
    assert.deepEqual(navigation.httpErrors,[],'unexpected resource HTTP errors');
  }finally{
    if(session)session.close();else if(socket)socket.close();
    await stopChild(chrome,'Luigi phase3 stress Chrome');
    await removeProfile(profile);
    if(server.listening)await new Promise((yes,no)=>server.close(e=>e?no(e):yes()));
  }
});
