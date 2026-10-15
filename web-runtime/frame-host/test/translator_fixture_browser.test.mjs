import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {access,readFile,mkdtemp,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {Cdp,waitUntil,stopChild} from '../../../tests/browser/harness.mjs';
const folder=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const browsers=[process.env.NSMB_BROWSER,
 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean);
const executable=(await Promise.all(browsers.map(p=>access(p).then(()=>p,()=>null)))).find(Boolean);
const allow=new Map([
 ['/',['translator_fixture_diagnostic.html','text/html;charset=utf-8']],
 ['/host.mjs',['host.mjs','application/javascript']],
 ['/dist/frame_loop_translated_fixture.mjs',['dist/frame_loop_translated_fixture.mjs','application/javascript']],
 ['/dist/frame_loop_translated_fixture.wasm',['dist/frame_loop_translated_fixture.wasm','application/wasm']]
]);
test('real Chrome runs actual C# translator-emitted C++ compiled into bounded same-Wasm frame host',{
 skip:!executable&&'Chrome/Brave unavailable',timeout:35000
},async()=>{
 const profile=await mkdtemp(join(tmpdir(),'nsmb-p5-translator-'));
 const server=createServer(async(req,res)=>{
  const record=allow.get(req.url);
  if(!record||!['GET','HEAD'].includes(req.method)){res.writeHead(404).end();return;}
  try{
   const bytes=await readFile(join(folder,record[0]));
   res.writeHead(200,{'content-type':record[1],'cache-control':'no-store'});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(500).end();}
 });
 let browser,ws,cdp;
 try{
  await new Promise((yes,no)=>server.once('error',no).listen(0,'127.0.0.1',yes));
  const origin='http://127.0.0.1:'+server.address().port;
  for(const blocked of ['/dist/frame_loop_fixture.wasm','/dist/frame_loop.wasm',
      '/private/game.iso','/.git/config','/translator-fixture/out/synthetic.dol']){
   const response=await fetch(origin+blocked);
   assert.equal(response.status,404,'private/non-allowlisted file '+blocked);
  }
  browser=spawn(executable,['--headless=new','--disable-extensions','--no-first-run',
   '--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,
   'about:blank'],{stdio:'ignore'});
  const port=await waitUntil(async()=>{
   const txt=await readFile(join(profile,'DevToolsActivePort'),'utf8');
   return Number(txt.split(/\r?\n/)[0])||null;
  },'real Chrome translator test debugging port');
  const targets=await waitUntil(async()=>{
   const resp=await fetch('http://127.0.0.1:'+port+'/json');
   return (await resp.json()).filter(item=>item.type==='page');
  },'CDP page');
  ws=new WebSocket(targets[0].webSocketDebuggerUrl);
  await Promise.race([
   new Promise((yes,no)=>{ws.addEventListener('open',yes,{once:true});
      ws.addEventListener('error',no,{once:true});}),
   new Promise((_,no)=>setTimeout(()=>no(Error('CDP connect timeout')),5000))
  ]);
  cdp=new Cdp(ws);
  for(const method of ['Page.enable','Runtime.enable','Network.enable','Log.enable'])
   await cdp.send(method);
  await cdp.send('Page.setLifecycleEventsEnabled',{enabled:true});
  const nav=await cdp.goto(origin+'/');
  const data=await waitUntil(async()=>{
   const value=await cdp.evaluate('window.__nsmbRealTranslator || null');
   return ['pass','fail'].includes(value?.status)?value:null;
  },'real upstream translator generated C++ browser execution',20000,80);
  assert.equal(data.status,'pass',JSON.stringify(data));
  assert.equal(data.generatedFunction,'void func_80001000(CpuContext*)');
  assert.equal(data.contexts,3);
  assert.equal(data.firstFrames,2);
  assert.equal(data.stressCycles,128);
  assert.equal(data.animationFrames,130);
  assert.equal(data.integerWrapResult,0);
  assert.equal(data.finalPages,0);
  assert.deepEqual(nav.errors,[]);
  assert.deepEqual(nav.httpErrors,[]);
 }finally{
  cdp?.close()??ws?.close();
  await stopChild(browser,'phase5 actual synthetic translator Chrome');
  await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:150});
  if(server.listening)await new Promise(resolve=>server.close(resolve));
 }
});
