// Real Chrome CDP, real compiled C++ generated from copyright-free PPC.
// Green requires 128 actual requestAnimationFrame callbacks and FULL RAM rollback.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {Cdp,waitUntil,stopChild,removeProfile} from '../browser/harness.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const target=resolve(process.env.NSMB_PHASE6_STW_ROOT||root,'web-runtime/frame-host');
const html=resolve(root,'tests/phase6/translated-store-diagnostic.html');
const browser=[process.env.NSMB_BROWSER,
 'C:/Program Files/Google/Chrome/Application/chrome.exe',
 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'].filter(Boolean).find(existsSync);
const allow=new Map([
 ['/',[html,'text/html;charset=utf-8']],
 ['/frame_loop_translated_store_fixture.mjs',[resolve(target,'dist/frame_loop_translated_store_fixture.mjs'),'application/javascript']],
 ['/frame_loop_translated_store_fixture.wasm',[resolve(target,'dist/frame_loop_translated_store_fixture.wasm'),'application/wasm']]
]);
test('independent REAL Chrome mobile 320px: 128 generated STW rollback RAF, private paths denied',{timeout:40000},async()=>{
 assert.ok(browser,'real Chrome/Brave REQUIRED, no fake or skipped test');
 for(const [, [file]] of allow)assert.ok(existsSync(file),'candidate file not built: '+file);
 const profile=mkdtempSync(join(tmpdir(),'peach-phase6-stw-'));
 const server=createServer(async(req,res)=>{
  const entry=allow.get(req.url);
  if(!entry||!['GET','HEAD'].includes(req.method)){
   res.writeHead(404,{'content-type':'text/plain','cache-control':'no-store'}).end('Not found');return;
  }
  try{
   const bytes=await readFile(entry[0]);
   res.writeHead(200,{'content-type':entry[1],'cache-control':'no-store'});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(500).end('Fixture unavailable')}
 });
 let chrome,client,cdp;
 try{
  await new Promise((ok,no)=>server.once('error',no).listen(0,'127.0.0.1',ok));
  const origin='http://127.0.0.1:'+server.address().port;
  chrome=spawn(browser,['--headless=new','--no-first-run','--no-default-browser-check',
    '--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  const port=await waitUntil(()=>{
   if(chrome.exitCode!==null)throw Error('Browser exited before CDP');
   const file=join(profile,'DevToolsActivePort');
   return existsSync(file)?Number(readFileSync(file,'utf8').split(/\r?\n/)[0]):null;
  },'Chrome debugging port');
  const pages=await waitUntil(async()=>{
   const result=await fetch('http://127.0.0.1:'+port+'/json');
   return (await result.json()).filter(x=>x.type==='page');
  },'Chrome target');
  client=new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((ok,no)=>{client.addEventListener('open',ok,{once:true});client.addEventListener('error',no,{once:true})});
  cdp=new Cdp(client);
  for(const name of ['Page','Runtime','Network','Log'])await cdp.send(name+'.enable');
  await cdp.send('Page.setLifecycleEventsEnabled',{enabled:true});
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:720,deviceScaleFactor:1,mobile:true,screenWidth:320,screenHeight:720});
  const nav=await cdp.goto(origin+'/');
  const metrics=await cdp.evaluate('({inner:innerWidth,scroll:document.documentElement.scrollWidth,heading:!!document.querySelector("h1")})');
  assert.equal(metrics.inner,320);assert.ok(metrics.scroll<=320);assert.equal(metrics.heading,true);
  const state=await waitUntil(async()=>{
   const result=await cdp.evaluate('window.__phase6 || null');
   return ['done','error'].includes(result?.status)?result:null;
  },'128 real translator generated STW browser frames',30000,80);
  assert.deepEqual(nav.errors,[],'no JS failures');
  assert.deepEqual(nav.httpErrors,[],'only allowlisted public fixture loaded');
  assert.equal(state.status,'done',state.message);
  assert.equal(state.authenticGame,false);
  assert.equal(state.frames,128,'must execute actual browser RAF');
  assert.equal(state.committed,32);
  assert.equal(state.faulted,96);
  assert.equal(state.ghostFailures,0,
    'failed source generated stores leaked W04 pages despite full word rollback');
  for(const blocked of ['/private/original.dol','/.git/config',
     '/web-runtime/src/guest_memory.cpp','/frame_loop_fixture.wasm',
     '/frame_loop_translated_store_fixture.wasm?private=1']){
   const response=await fetch(origin+blocked);
   assert.equal(response.status,404,'private or unsanctioned path '+blocked);
  }
 }finally{
  cdp?.close()??client?.close();
  await stopChild(chrome,'phase6 Chrome');
  await removeProfile(profile);
  if(server.listening)await new Promise(ok=>server.close(ok));
 }
});
