import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const folder=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const candidates=[process.env.NSMB_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'].filter(Boolean);
const browser=(await Promise.all(candidates.map(async p=>await access(p).then(()=>p,()=>null)))).find(Boolean);

async function until(probe, label, duration=12000) {
  const end=Date.now()+duration;
  while(Date.now()<end) {
    try { const result=await probe();if(result)return result; } catch {}
    await new Promise(done=>setTimeout(done,65));
  }
  throw new Error('TIMEOUT: '+label);
}
const files=new Map([
  ['/',['diagnostic.html','text/html;charset=utf-8']],
  ['/host.mjs',['host.mjs','application/javascript;charset=utf-8']],
  ['/dist/frame_loop.mjs',['dist/frame_loop.mjs','application/javascript;charset=utf-8']],
  ['/dist/frame_loop.wasm',['dist/frame_loop.wasm','application/wasm']]
]);
test('actual Chrome animation frames execute linked W03 + W07 Wasm and isolate fault', {
  skip:!browser&&'Chrome/Brave missing', timeout:30000
}, async()=>{
  const profile=await mkdtemp(join(tmpdir(),'nsmb-phase2-'));
  const server=createServer(async (req,res)=>{
    const file=files.get(req.url);
    if(!file){res.writeHead(404).end();return;}
    try {
      const body=await readFile(join(folder,file[0]));
      res.writeHead(200,{'content-type':file[1],'cache-control':'no-store'}).end(body);
    } catch{res.writeHead(500).end();}
  });
  let chrome,socket;
  try{
    await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
    const target='http://127.0.0.1:'+server.address().port+'/';
    chrome=spawn(browser,['--headless=new','--no-first-run','--no-default-browser-check',
      '--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
      {stdio:'ignore'});
    const port=await until(async()=>{
      const raw=await readFile(join(profile,'DevToolsActivePort'),'utf8');
      return Number(raw.split(/\r?\n/)[0])||null;
    },'CHROME_REMOTE_PORT');
    const pages=await until(async()=>{
      const response=await fetch('http://127.0.0.1:'+port+'/json');
      return (await response.json()).filter(x=>x.type==='page');
    },'PAGE_HANDLE');
    socket=new WebSocket(pages[0].webSocketDebuggerUrl);
    await Promise.race([
      new Promise((resolve,reject)=>{
        socket.addEventListener('open',resolve,{once:true});
        socket.addEventListener('error',reject,{once:true});
      }),
      new Promise((_,reject)=>setTimeout(()=>reject(Error('WebSocket connection timeout')),4000))
    ]);
    const callbacks=new Map(),errors=[];
    let requestId=0;
    socket.addEventListener('message',e=>{
      const data=JSON.parse(e.data);
      if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.text);
      if(data.id&&callbacks.has(data.id)){
        const task=callbacks.get(data.id);callbacks.delete(data.id);
        data.error?task.reject(Error(JSON.stringify(data.error))):task.resolve(data.result);
      }
    });
    const send=(method,params={})=>new Promise((resolve,reject)=>{
      const id=++requestId;callbacks.set(id,{resolve,reject});
      socket.send(JSON.stringify({id,method,params}));
    });
    await send('Page.enable');await send('Runtime.enable');
    await send('Page.navigate',{url:target});
    const state=await until(async()=>{
      const response=await send('Runtime.evaluate',{
        expression:'({url:location.href,status:document.querySelector("#status")?.dataset.state,data:window.__nsmbPhase2})',
        returnByValue:true
      });
      const result=response.result?.value;
      return result?.url===target&&['pass','fail'].includes(result.status)?result:null;
    },'BROWSER_FRAME_DIAGNOSTIC',14000);
    assert.equal(state.status,'pass',JSON.stringify(state.data));
    assert.equal(state.data.backend,'real Emscripten W03+W07 WebAssembly');
    assert.equal(state.data.frames.length,4);
    assert.deepEqual(state.data.trace,[1,2,3,1,2,1,2]);
    assert.deepEqual(state.data.checkedRam,{one:13,two:26});
    assert.equal(state.data.guestFaultCode,4);
    assert.equal(state.data.final.cancelled,1);
    assert.deepEqual(errors,[],'Uncaught exceptions should not be hidden');
  }finally{
    if(socket)socket.close();
    if(chrome){chrome.kill();await Promise.race([
      new Promise(r=>chrome.once('exit',r)),new Promise(r=>setTimeout(r,1600))]);}
    if(server.listening)await new Promise(r=>server.close(r));
    await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:120});
  }
});
