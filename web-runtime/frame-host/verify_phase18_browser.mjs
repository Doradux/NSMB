#!/usr/bin/env node
// PHASE18 opt-in NEW-WASM browser verifier. It REFUSES to run unless a freshly
// source-pinned static Node manifest exists and NSMB_BROWSER is configured.
// Only public synthetic Wasm: no original Wii game, HLE grant or CPU pointer.
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,access,mkdtemp,rm} from 'node:fs/promises';
import {readFileSync,realpathSync,existsSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {Cdp,waitUntil,stopChild} from '../../tests/browser/harness.mjs';
const here=fileURLToPath(new URL('.',import.meta.url));
function fatal(message,code=65){
  console.error(message);process.exitCode=code;
}
async function run(){
  const [op,raw,...extra]=process.argv.slice(2);
  if(op!=='--verify'||!raw||extra.length||!isAbsolute(raw))
    return fatal('DENY: Usage --verify ABSOLUTE_EXTERNAL_NEW_WASM_DIR',64);
  const browser=process.env.NSMB_BROWSER;
  if(!browser||!existsSync(browser))
    return fatal('BLOCKED-ENV: NSMB_BROWSER executable must be explicitly configured',78);
  const dir=realpathSync(raw);
  // Do not even start Chrome unless exact source/binary Node gate succeeds.
  const guard=spawnSync('node',[join(here,'verify_phase18_wasm.mjs'),'--verify',dir],{
    encoding:'utf8',timeout:25000
  });
  if(guard.status!==0)
    return fatal('BLOCKED-PROVENANCE: Node static gate failed; '+guard.stderr,
                 guard.status===78?78:65);
  const manifest=JSON.parse(readFileSync(join(dir,'phase18_artifact_manifest.json'),'utf8'));
  const expected=manifest.outputs['frame_loop.wasm'];
  const page=`<!doctype html><meta charset="utf-8"><title>Phase18 new synthetic Wasm</title>
<script type="module">
import createModule from '/frame_loop.mjs';
(async()=>{
 try {
  const response=await fetch('/frame_loop.wasm',{cache:'no-store'});
  if(!response.ok)throw Error('Wasm HTTP '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  if(!WebAssembly.validate(bytes))throw Error('Browser WebAssembly.validate FAILED');
  const mod=await createModule({locateFile:()=>'/frame_loop.wasm'});
  const keys=Object.keys(mod).filter(k=>/nsmbw_loop_(tick|cpu_gpr)/.test(k));
  if(!keys.length)throw Error('No public synthetic W03 host exports in fresh module');
  if(Object.keys(mod).some(k=>/forgeForNativeTest|armCanonicalClock|ClockNativeTest|OSGetTime/.test(k)))
    throw Error('Private/native original HLE capability exposed to browser');
  window.__phase18Fresh={status:'pass',digest,keys};
 } catch(e){ window.__phase18Fresh={status:'fail',error:String(e?.stack||e)}; }
})();
</script>`;
  const profile=await mkdtemp(join(tmpdir(),'nsmb18-browser-'));
  const server=createServer(async(req,res)=>{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
    if(req.url==='/'){
      res.writeHead(200,{'content-type':'text/html;charset=utf-8','cache-control':'no-store'});
      res.end(req.method==='HEAD'?undefined:page);return;
    }
    if(!['/frame_loop.mjs','/frame_loop.wasm','/favicon.ico'].includes(req.url)){
      res.writeHead(404).end();return;
    }
    if(req.url==='/favicon.ico'){res.writeHead(204).end();return;}
    try{
      const name=req.url.slice(1);
      const data=await readFile(join(dir,name));
      res.writeHead(200,{'content-type':name.endsWith('.wasm')?
        'application/wasm':'text/javascript','cache-control':'no-store'});
      res.end(req.method==='HEAD'?undefined:data);
    }catch{res.writeHead(500).end();}
  });
  let chrome,socket,cdp;
  try{
    await new Promise((yes,no)=>server.once('error',no).listen(0,'127.0.0.1',yes));
    const origin='http://127.0.0.1:'+server.address().port;
    for(const forbidden of ['/.git/config','/private/game.iso','/frame_loop_fixture.wasm']){
      const response=await fetch(origin+forbidden);
      if(response.status!==404)throw Error('Browser server path allowlist failed');
    }
    const args=['--headless=new','--disable-extensions','--no-first-run',
      '--no-default-browser-check','--disable-dev-shm-usage',
      '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'];
    if(process.env.NSMB_BROWSER_NO_SANDBOX==='1')args.unshift('--no-sandbox');
    chrome=spawn(browser,args,{stdio:'ignore'});
    const port=await waitUntil(async()=>{
      const text=await readFile(join(profile,'DevToolsActivePort'),'utf8');
      return Number(text.split(/\r?\n/)[0])||null;
    },'Phase18 fresh Chrome DevTools port',14000);
    const targets=await waitUntil(async()=>{
      const r=await fetch('http://127.0.0.1:'+port+'/json');
      return (await r.json()).filter(x=>x.type==='page');
    },'Phase18 page discovery');
    socket=new WebSocket(targets[0].webSocketDebuggerUrl);
    await Promise.race([
      new Promise((yes,no)=>{
        socket.addEventListener('open',yes,{once:true});
        socket.addEventListener('error',no,{once:true});
      }),
      new Promise((_,no)=>setTimeout(()=>no(Error('CDP timeout')),5000))
    ]);
    cdp=new Cdp(socket);
    for(const method of ['Page.enable','Runtime.enable','Network.enable','Log.enable'])
      await cdp.send(method);
    await cdp.send('Page.setLifecycleEventsEnabled',{enabled:true});
    const nav=await cdp.goto(origin+'/');
    const result=await waitUntil(async()=>{
      const value=await cdp.evaluate('window.__phase18Fresh || null');
      return ['pass','fail'].includes(value?.status)?value:null;
    },'new exact Phase18 Wasm in REAL Chromium',22000,80);
    if(result.status!=='pass'||result.digest!==expected||
       nav.errors?.length||nav.httpErrors?.length)
      throw Error('BLOCKED-BROWSER: '+JSON.stringify({result,expected,nav}));
    console.log('PHASE18_NEW_WASM_REAL_CHROMIUM_MATCHED_NODE_SHA',expected);
    console.log('IMPORTANT: browser module load is NOT a native Wii OSGetTime or game test');
  }finally{
    cdp?.close()??socket?.close();
    await stopChild(chrome,'Phase18 exact Wasm browser verification');
    await rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:100});
    if(server.listening)await new Promise(yes=>server.close(yes));
  }
}
await run().catch(e=>fatal(String(e?.stack||e),65));
