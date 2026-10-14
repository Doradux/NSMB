import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { access, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, waitUntil, stopChild } from '../../../tests/browser/harness.mjs';

const folder=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const candidates=[
  process.env.NSMB_BROWSER,
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].filter(Boolean);
const browser=(await Promise.all(candidates.map(p=>access(p).then(()=>p,()=>null)))).find(Boolean);
const paths=new Map([
  ['/',['typed_policy_diagnostic.html','text/html;charset=utf-8']],
  ['/host.mjs',['host.mjs','application/javascript;charset=utf-8']],
  ['/dist/frame_loop.mjs',['dist/frame_loop.mjs','application/javascript;charset=utf-8']],
  ['/dist/frame_loop.wasm',['dist/frame_loop.wasm','application/wasm']],
  ['/dist/frame_loop_fixture.mjs',['dist/frame_loop_fixture.mjs','application/javascript;charset=utf-8']],
  ['/dist/frame_loop_fixture.wasm',['dist/frame_loop_fixture.wasm','application/wasm']]
]);

test('actual browser links real Wasm with W07 typed status 4/5/6 and isolates guest faults', {
  skip:!browser && 'requires real Chrome/Brave',timeout:30000
},async()=>{
  const profile=await mkdtemp(join(tmpdir(),'nsmb-phase3-typed-'));
  const server=createServer(async(req,res)=>{
    const entry=paths.get(req.url);
    if(!entry||!['GET','HEAD'].includes(req.method)){
      res.writeHead(404).end();return;
    }
    try{
      const bytes=await readFile(join(folder,entry[0]));
      res.writeHead(200,{'content-type':entry[1],'cache-control':'no-store'});
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch{res.writeHead(500).end();}
  });
  let chrome,socket,cdp;
  try{
    await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+server.address().port;
    // The headless page is an actual browser: it compiles and executes WASM C++ exports.
    chrome=spawn(browser,['--headless=new','--disable-extensions','--no-first-run',
      '--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,
      'about:blank'],{stdio:'ignore'});
    const port=await waitUntil(async()=>{
      const data=await readFile(join(profile,'DevToolsActivePort'),'utf8');
      return Number(data.split(/\r?\n/)[0])||null;
    },'Chrome typed device diagnostic CDP');
    const targets=await waitUntil(async()=>{
      const response=await fetch('http://127.0.0.1:'+port+'/json');
      return (await response.json()).filter(x=>x.type==='page');
    },'Chrome tabs');
    socket=new WebSocket(targets[0].webSocketDebuggerUrl);
    await Promise.race([
      new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});
        socket.addEventListener('error',no,{once:true});}),
      new Promise((_,no)=>setTimeout(()=>no(Error('CDP connection timeout')),5000))
    ]);
    cdp=new Cdp(socket);
    for(const cmd of ['Page.enable','Runtime.enable','Network.enable','Log.enable'])await cdp.send(cmd);
    await cdp.send('Page.setLifecycleEventsEnabled',{enabled:true});
    const nav=await cdp.goto(origin+'/');
    const actual=await waitUntil(()=>cdp.evaluate('window.__nsmbTypedPolicy || null').then(value=>
      ['pass','fail'].includes(value?.status)?value:null), 'typed W07 guest errors in compiled WASM',15000);
    assert.equal(actual.status,'pass',JSON.stringify(actual));
    assert.equal(actual.backend,'real linked typed-W07 Emscripten C++ WASM');
    assert.deepEqual(actual.errorCodes,[4,5,6]);
    assert.deepEqual(actual.frameCounts,[1,2,2]);
    assert.equal(actual.actualAnimationFrames,5);
    assert.equal(actual.normalModuleHasTestHooks,false);
    assert.deepEqual(nav.errors,[]);
    assert.deepEqual(nav.httpErrors,[]);
    for(const route of ['/private/game.iso','/.git/config','/src/guest_memory.cpp']){
      const response=await fetch(origin+route);
      assert.equal(response.status,404,'allowlist must reject '+route);
    }
  }finally{
    if(cdp)cdp.close();else socket?.close();
    await stopChild(chrome,'typed W07 Chrome');
    await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:150});
    if(server.listening)await new Promise(r=>server.close(r));
  }
});
