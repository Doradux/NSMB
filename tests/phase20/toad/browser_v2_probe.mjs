#!/usr/bin/env node
// REAL Chromium on NEW test-only pure WASM, NOT W03 guest execution.
// Runs only when NSMB_TOAD_P20_WASM, _SHA256 and NSMB_BROWSER provided.
// Browser is opt-in and no-sandbox is explicit localhost QA only.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Cdp,waitUntil,stopChild} from '../../browser/harness.mjs';
const here=fileURLToPath(new URL('.',import.meta.url));
const wasmPath=process.env.NSMB_TOAD_P20_WASM;
const browser=process.env.NSMB_BROWSER;
const expected=process.env.NSMB_TOAD_P20_WASM_SHA256;
if(!wasmPath||!isAbsolute(wasmPath)||!existsSync(wasmPath)||
   !browser||!existsSync(browser)||!/^[a-f0-9]{64}$/.test(expected||'')){
 console.error('BLOCKED-ENV: exact external new WASM, SHA and browser required');
 process.exit(78);
}
const blob=readFileSync(wasmPath);
assert.equal(createHash('sha256').update(blob).digest('hex'),expected);
assert.ok(WebAssembly.validate(blob));
assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(blob)),[]);
const page=readFileSync(join(here,'browser_v2_probe.html'));
const profile=await mkdtemp(join(tmpdir(),'toad20-browser-'));
const server=createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method||'')){res.writeHead(405).end();return;}
 if(req.url==='/'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store'});
  res.end(req.method==='HEAD'?undefined:page);return;
 }
 if(req.url==='/toad_p20_probe.wasm'){
  res.writeHead(200,{'content-type':'application/wasm',
    'cache-control':'no-store'});
  res.end(req.method==='HEAD'?undefined:blob);return;
 }
 if(req.url==='/favicon.ico'){res.writeHead(204).end();return;}
 res.writeHead(404).end();
});
let chrome,socket,cdp;
try{
 await new Promise((yes,no)=>server.once('error',no).listen(0,'127.0.0.1',yes));
 const origin='http://127.0.0.1:'+server.address().port;
 for(const forbidden of ['/.git/config','/private/original.iso','/src/guest.cpp']){
  const response=await fetch(origin+forbidden);
  assert.equal(response.status,404);
 }
 const args=['--headless=new','--disable-extensions','--no-first-run',
 '--no-default-browser-check','--disable-dev-shm-usage',
 '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'];
 if(process.env.NSMB_BROWSER_NO_SANDBOX==='1')args.unshift('--no-sandbox');
 chrome=spawn(browser,args,{stdio:'ignore'});
 const port=await waitUntil(async()=>{
  const p=await readFile(join(profile,'DevToolsActivePort'),'utf8');
  return Number(p.split(/\r?\n/)[0])||null;
 },'P20 fresh browser DevTools port',14000);
 const targets=await waitUntil(async()=>{
  const response=await fetch('http://127.0.0.1:'+port+'/json');
  return (await response.json()).filter(t=>t.type==='page');
 },'P20 browser page discovery');
 socket=new WebSocket(targets[0].webSocketDebuggerUrl);
 await Promise.race([
  new Promise((yes,no)=>{
   socket.addEventListener('open',yes,{once:true});
   socket.addEventListener('error',no,{once:true});
  }),
  new Promise((_,no)=>setTimeout(()=>no(Error('CDP open timeout')),5000))
 ]);
 cdp=new Cdp(socket);
 for(const name of ['Page.enable','Runtime.enable','Network.enable','Log.enable'])
  await cdp.send(name);
 await cdp.send('Page.setLifecycleEventsEnabled',{enabled:true});
 const nav=await cdp.goto(origin+'/');
 const result=await waitUntil(async()=>{
  const value=await cdp.evaluate('window.__toad20 || null');
  return ['pass','fail'].includes(value?.status)?value:null;
 },'actual Chromium test-only numeric dispatch',22000,80);
 assert.equal(result.status,'pass',JSON.stringify(result));
 assert.equal(result.sha,expected);
 assert.equal(result.oneSecondTicks,'60750000');
 assert.equal(result.browserCases,256);
 assert.equal(result.imports,0);
 assert.equal(result.neverNativeW03,true);
 assert.deepEqual(nav.httpErrors,[]);
 assert.deepEqual(nav.errors,[]);
 console.log('TOAD_P20_NEW_V2_PURE_WASM_CHROMIUM_FUNCTIONAL_PASS',JSON.stringify(result));
 console.log('STOP: test-only arithmetic WASM, NOT W03 native scheduler or Wii HLE');
}finally{
 cdp?.close()??socket?.close();
 await stopChild(chrome,'P20 Toad Chrome test-only pure WASM');
 await rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:100});
 if(server.listening)await new Promise(yes=>server.close(yes));
}
