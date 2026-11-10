// Real Chromium physically invokes the NEW invented standalone leaf Wasm.
// This DOES NOT run the W03 scheduler or authorize any synthetic service.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Cdp,waitUntil,stopChild} from '../../../tests/browser/harness.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');

async function main(){
  const args=process.argv.slice(2);
  if(args.length!==4||args[0]!=='--wasm'||args[2]!=='--commit'||
     !isAbsolute(args[1])||!isAbsolute(args[3]))
    throw Error('DENY usage --wasm ABS_PATH --commit ABS_PATH');
  const browser=process.env.NSMB_BROWSER;
  if(!browser||!existsSync(browser))
    throw Error('BLOCKED-ENV: explicitly configure NSMB_BROWSER');
  const bytes=readFileSync(args[1]);
  const commit=JSON.parse(readFileSync(args[3],'utf8'));
  if(sha(bytes)!==commit.expectedWasmSha)
    throw Error('DENY physical Wasm changed after independent commitment');
  const expectedTag=Number.parseInt(commit.sourceSha.slice(0,8),16)>>>0;
  const page=[
    '<!doctype html><meta charset="utf-8"><title>P20 invented leaf real Wasm</title>',
    '<script>',
    'const vectors='+JSON.stringify(commit.vectors)+';',
    'const expectedSha='+JSON.stringify(commit.expectedWasmSha)+';',
    'const expectedTag='+expectedTag+';',
    '(async()=>{try{',
    'const response=await fetch("/leaf.wasm",{cache:"no-store"});',
    'if(!response.ok)throw Error("missing WASM");',
    'const b=new Uint8Array(await response.arrayBuffer());',
    'const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",b)))',
    '.map(x=>x.toString(16).padStart(2,"0")).join("");',
    'if(digest!==expectedSha||!WebAssembly.validate(b))throw Error("SHA/ABI mismatch");',
    'const module=new WebAssembly.Module(b);',
    'const imports=WebAssembly.Module.imports(module);',
    'if(imports.length)throw Error("import authority forbidden");',
    'const instance=new WebAssembly.Instance(module,{});',
    'const run=instance.exports.nsmb_p20_leaf_probe;',
    'const tag=instance.exports.nsmb_p20_leaf_source_tag;',
    'if(typeof run!=="function"||typeof tag!=="function"||',
    '(tag()>>>0)!==expectedTag)throw Error("wrong physical source function");',
    'let checks=0;',
    'for(const v of vectors){for(let field=0;field<5;field++){',
    'const actual=run(...v.args,field)>>>0;',
    'if(actual!==v.expect[field])throw Error("real Wasm leaf byte oracle mismatch");',
    'checks++;}}',
    'window.__p20={status:"pass",sha:digest,checks,vectors:vectors.length,',
    'realW03SchedulerInvoked:false,authenticReleaseEligible:false};',
    '}catch(error){window.__p20={status:"fail",error:String(error?.stack||error)}}})();',
    '</script>'
  ].join('\n');
  const server=createServer((req,res)=>{
    if(req.method!=='GET'||!['/','/leaf.wasm','/favicon.ico'].includes(req.url)){
      res.writeHead(404).end();return;
    }
    if(req.url==='/favicon.ico'){res.writeHead(204).end();return;}
    res.writeHead(200,{'cache-control':'no-store',
      'content-type':req.url==='/leaf.wasm'?'application/wasm':'text/html;charset=utf-8'});
    res.end(req.url==='/leaf.wasm'?bytes:page);
  });
  const profile=await mkdtemp(join(tmpdir(),'nsmb-p20-luigi-browser-'));
  let chrome,socket,cdp;
  try{
    await new Promise((ok,no)=>server.once('error',no).listen(0,'127.0.0.1',ok));
    const origin='http://127.0.0.1:'+server.address().port;
    for(const forbidden of ['/.git/config','/source.dol','/private/rom','/secrets']){
      const res=await fetch(origin+forbidden);
      if(res.status!==404)throw Error('browser origin allowlist unsafe');
    }
    const opts=['--headless=new','--disable-extensions','--no-first-run',
      '--no-default-browser-check','--disable-dev-shm-usage',
      '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'];
    if(process.env.NSMB_BROWSER_NO_SANDBOX==='1')opts.unshift('--no-sandbox');
    chrome=spawn(browser,opts,{stdio:'ignore'});
    const port=await waitUntil(async()=>{
      const value=await readFile(join(profile,'DevToolsActivePort'),'utf8');
      return Number(value.split(/\r?\n/)[0])||null;
    },'P20 one Chromium startup',14000);
    const tabs=await waitUntil(async()=>{
      const response=await fetch('http://127.0.0.1:'+port+'/json');
      return (await response.json()).filter(t=>t.type==='page');
    },'P20 tab',8000);
    socket=new WebSocket(tabs[0].webSocketDebuggerUrl);
    await Promise.race([
      new Promise((ok,no)=>{
        socket.addEventListener('open',ok,{once:true});
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
      const value=await cdp.evaluate('window.__p20 || null');
      return value?.status==='pass'||value?.status==='fail'?value:null;
    },'REAL P20 invented leaf execution in Chromium',23000,75);
    if(result.status!=='pass'||result.sha!==commit.expectedWasmSha||
       result.checks!==commit.vectors.length*5||
       result.realW03SchedulerInvoked!==false||
       nav.errors?.length||nav.httpErrors?.length)
      throw Error('browser did not execute same physical invented Wasm: '+
        JSON.stringify({result,errors:nav.errors,httpErrors:nav.httpErrors}));
    console.log(JSON.stringify({status:'P20_REAL_CHROMIUM_INVENTED_LEAF_STOP',
      sha:result.sha,checks:result.checks,vectors:result.vectors,
      realW03SchedulerInvoked:false,authenticReleaseEligible:false}));
  } finally{
    cdp?.close()??socket?.close();
    await stopChild(chrome,'P20 invented leaf browser');
    await rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:100});
    if(server.listening)await new Promise(ok=>server.close(ok));
  }
}
await main().catch(err=>{console.error('P20_BROWSER_REJECTED_STOP');process.exitCode=4});
