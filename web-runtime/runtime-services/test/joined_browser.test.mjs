import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const folder = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browserCandidates = [process.env.NSMB_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'].filter(Boolean);
const browser = (await Promise.all(browserCandidates.map(async p =>
  (await fs.access(p).then(()=>true,()=>false))?p:null))).find(Boolean);
async function until(probe, description, ms=15000) {
  const start=Date.now();let lastError;
  while(Date.now()-start<ms){
    try {const found=await probe();if(found) return found;} catch(e){lastError=e;}
    await new Promise(r=>setTimeout(r,80));
  }
  throw Error('TIMEOUT_'+description+(lastError?': '+lastError.message:''));
}
const server = createServer(async (req,res)=>{
  const resources = new Map([['/', ['joined_diagnostic.html','text/html;charset=utf-8']],
    ['/dist/joined_input.mjs',['dist/joined_input.mjs','text/javascript;charset=utf-8']],
    ['/dist/joined_input.wasm',['dist/joined_input.wasm','application/wasm']],
    ['/host_input.mjs',['host_input.mjs','text/javascript;charset=utf-8']],
    ['/joined_host_input.mjs',['joined_host_input.mjs','text/javascript;charset=utf-8']],
    ['/io/adapters.mjs',['../io/adapters.mjs','text/javascript;charset=utf-8']]]);
  const item = resources.get(req.url);
  if (!item) {res.writeHead(404).end(); return;}
  try {const bytes = await fs.readFile(join(folder,item[0]));
    res.writeHead(200,{'content-type':item[1],'cache-control':'no-store'});res.end(bytes);}
  catch {res.writeHead(500).end();}
});
test('real Chromium consumes W08 input through same joined guest-frame Wasm for 128 frames', {skip:!browser}, async () => {
  const profile=await fs.mkdtemp(join(tmpdir(),'nsmb-toad-io-'));
  let chrome, socket;
  try{
    await new Promise((done,fail)=>server.once('error',fail).listen(0,'127.0.0.1',done));
    const target='http://127.0.0.1:'+server.address().port+'/';
    chrome=spawn(browser, ['--headless=new','--no-first-run','--no-default-browser-check',
      '--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
      {stdio:'ignore'});
    const port=await until(async()=>{
      const raw=await fs.readFile(join(profile,'DevToolsActivePort'),'utf8');
      return Number(raw.split(/\r?\n/)[0])||null;
    },'CHROME_DEBUG_PORT');
    const pages=await until(async()=>{
      const response=await fetch('http://127.0.0.1:'+port+'/json');
      return (await response.json()).filter(p=>p.type==='page');
    },'CHROME_PAGE');
    socket=new WebSocket(pages[0].webSocketDebuggerUrl);
    await new Promise((done,fail)=>{socket.addEventListener('open',done,{once:true});
      socket.addEventListener('error',fail,{once:true});});
    let next=0;const pending=new Map();const errors=[];
    socket.addEventListener('message',event=>{
      const msg=JSON.parse(event.data);
      if(msg.method==='Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
      if(msg.id&&pending.has(msg.id)){const {done,fail}=pending.get(msg.id);pending.delete(msg.id);
        msg.error?fail(Error(JSON.stringify(msg.error))):done(msg.result);}
    });
    const send=(method,params={})=>new Promise((done,fail)=>{
      const id=++next;pending.set(id,{done,fail});socket.send(JSON.stringify({id,method,params}));
    });
    await send('Page.enable');await send('Runtime.enable');
    await send('Page.navigate',{url:target});
    const result=await until(async()=>{
      const data=await send('Runtime.evaluate',{
        expression:'({url:location.href,status:document.querySelector("#status")?.dataset.state,text:document.querySelector("#status")?.textContent})',
        returnByValue:true});
      const value=data.result?.value;
      return value?.url===target && ['pass','fail'].includes(value.status)?value:null;
    },'DIAGNOSTIC_PAGE');
    assert.equal(result.status,'pass',result.text);
    assert.match(result.text,/same compiled Wasm W08 Gamepad\/keyboard\/neutral/);
    assert.deepEqual(errors,[]);
  } finally {
    if(socket) socket.close();
    if(chrome){chrome.kill();
      await Promise.race([new Promise(r=>chrome.once('exit',r)),new Promise(r=>setTimeout(r,2000))]);}
    if(server.listening) await new Promise(r=>server.close(r));
    await fs.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:150});
  }
});
