#!/usr/bin/env node
// Phase20: REAL Chromium must execute the SAME freshly compiled Wasm clock
// and same checks as Node, not just instantiate it. One allowlisted localhost
// server; exact Git/source/ABI proof + Node functional proof required first.
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {existsSync,readFileSync,realpathSync,lstatSync} from 'node:fs';
import {join,isAbsolute,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Cdp,waitUntil,stopChild} from '../../tests/browser/harness.mjs';

const here=fileURLToPath(new URL('.',import.meta.url));
const repo=resolve(here,'../..');
const oracle=join(repo,'tests/phase20/peach/private_service_oracle.mjs');
const sha=content=>createHash('sha256').update(content).digest('hex');
function fail(message,code=65){console.error(message);process.exitCode=code;}
async function main(){
  const [op,raw,...extra]=process.argv.slice(2);
  if(op!=='--verify'||!raw||extra.length||!isAbsolute(raw))
    return fail('DENY: Usage --verify ABSOLUTE_EXTERNAL_FRESH_WASM_DIR',64);
  const browser=process.env.NSMB_BROWSER;
  if(!browser||!existsSync(browser))
    return fail('BLOCKED-ENV: NSMB_BROWSER must be explicitly configured',78);
  if(!existsSync(raw))return fail('BLOCKED-ENV: Wasm output missing',78);
  const dir=realpathSync(raw),source=realpathSync(repo);
  if(dir===source||dir.startsWith(source+sep))
    return fail('DENY: source worktree cannot be Wasm output',64);
  const guard=spawnSync(process.execPath,[join(here,'verify_phase20_service_node.mjs'),'--verify',dir],
    {encoding:'utf8',timeout:25000});
  if(guard.status!==0)return fail('BLOCKED-PROVENANCE: static source/binary ABI gate: '+guard.stderr,
    guard.status===78?78:65);
  const file=name=>{
    const path=join(dir,name);
    if(lstatSync(path).isSymbolicLink())throw Error('DENY: artifact symlink '+name);
    return readFileSync(path);
  };
  const proof=JSON.parse(file('phase20_service_node_proof.json').toString('utf8'));
  const manifest=JSON.parse(file('phase18_artifact_manifest.json').toString('utf8'));
  const expectedWasm=sha(file('frame_loop.wasm'));
  const expectedMjs=sha(file('frame_loop.mjs'));
  const expectedOracle=sha(readFileSync(oracle));
  if(proof.schema!=='nsmb-phase20-native-quota-clock-v1' ||
     proof.sourceHead!==manifest.head ||
     proof.wasmSha256!==expectedWasm ||proof.mjsSha256!==expectedMjs||
     proof.oracleSha256!==expectedOracle ||
     proof.imageId!=='sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a' ||
     proof.node?.checks<25 ||proof.node?.stressCount!==1024 || proof.node?.exampleRemainingQuota!=='0')
    throw Error('BLOCKED-PROVENANCE: missing/mismatched Node DYNAMIC proof (not module load)');
  const page=`<!doctype html><meta charset="utf-8"><title>Phase20 W03 synthetic fresh Wasm</title>
<script type="module">
import createModule from '/frame_loop.mjs';
import {runPrivateServiceFixture} from '/private_service_oracle.mjs';
(async()=>{
 try {
  const started=performance.now();
  const wasmResponse=await fetch('/frame_loop.wasm',{cache:'no-store'});
  const mjsResponse=await fetch('/frame_loop.mjs',{cache:'no-store'});
  const oracleResponse=await fetch('/private_service_oracle.mjs',{cache:'no-store'});
  if(!wasmResponse.ok||!mjsResponse.ok||!oracleResponse.ok)
    throw Error('Missing exact source/fixture/browser artifact');
  const rawWasm=new Uint8Array(await wasmResponse.arrayBuffer());
  const rawMjs=new Uint8Array(await mjsResponse.arrayBuffer());
  const rawOracle=new Uint8Array(await oracleResponse.arrayBuffer());
  const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  if(!WebAssembly.validate(rawWasm))throw Error('Browser WebAssembly.validate FAILED');
  const [wasmSha,mjsSha,oracleSha]=await Promise.all([
    digest(rawWasm),digest(rawMjs),digest(rawOracle)]);
  const mod=await createModule({locateFile:()=>'/frame_loop.wasm'});
  const initMs=performance.now()-started;
  const result=runPrivateServiceFixture(mod,{stressCount:1024});
  window.__phase20Service={status:'pass',wasmSha,mjsSha,oracleSha,initMs,...result};
 } catch(error) {
  window.__phase20Service={status:'fail',error:String(error?.stack||error)};
 }
})();
</script>`;
  const server=createServer(async(req,res)=>{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
    if(req.url==='/'){
      res.writeHead(200,{'content-type':'text/html;charset=utf-8','cache-control':'no-store'});
      res.end(req.method==='HEAD'?undefined:page);return;
    }
    if(req.url==='/favicon.ico'){res.writeHead(204).end();return;}
    const paths={
      '/frame_loop.mjs':join(dir,'frame_loop.mjs'),
      '/frame_loop.wasm':join(dir,'frame_loop.wasm'),
      '/private_service_oracle.mjs':oracle
    };
    if(!Object.hasOwn(paths,req.url)){res.writeHead(404).end();return;}
    try{
      const bytes=await readFile(paths[req.url]);
      res.writeHead(200,{'cache-control':'no-store',
        'content-type':req.url.endsWith('.wasm')?'application/wasm':'text/javascript'});
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch{res.writeHead(500).end();}
  });
  const profile=await mkdtemp(join(tmpdir(),'nsmb-p19-peach-browser-'));
  let chrome,socket,cdp;
  try {
    await new Promise((yes,no)=>server.once('error',no).listen(0,'127.0.0.1',yes));
    const origin='http://127.0.0.1:'+server.address().port;
    for(const path of ['/.git/config','/secrets','.ssh/id_rsa','/original.iso',
                       '/frame_loop_fixture.wasm']){
      const url=path.startsWith('/')?path:'/'+path;
      const denial=await fetch(origin+url);
      if(denial.status!==404)throw Error('DENY: localhost file allowlist '+path);
    }
    const args=['--headless=new','--disable-extensions','--no-first-run',
      '--no-default-browser-check','--disable-dev-shm-usage',
      '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'];
    if(process.env.NSMB_BROWSER_NO_SANDBOX==='1')args.unshift('--no-sandbox');
    chrome=spawn(browser,args,{stdio:'ignore'});
    const port=await waitUntil(async()=>{
      const content=await readFile(join(profile,'DevToolsActivePort'),'utf8');
      return Number(content.split(/\r?\n/)[0])||null;
    },'Phase20 one Chromium session startup',14000);
    const tabs=await waitUntil(async()=>{
      const response=await fetch('http://127.0.0.1:'+port+'/json');
      return (await response.json()).filter(t=>t.type==='page');
    },'Phase20 Chrome page discovery',8000);
    socket=new WebSocket(tabs[0].webSocketDebuggerUrl);
    await Promise.race([
      new Promise((yes,no)=>{
        socket.addEventListener('open',yes,{once:true});
        socket.addEventListener('error',no,{once:true});
      }),
      new Promise((_,no)=>setTimeout(()=>no(Error('CDP socket timeout')),5000))
    ]);
    cdp=new Cdp(socket);
    for(const method of ['Page.enable','Runtime.enable','Network.enable','Log.enable'])
      await cdp.send(method);
    await cdp.send('Page.setLifecycleEventsEnabled',{enabled:true});
    const nav=await cdp.goto(origin+'/');
    const result=await waitUntil(async()=>{
      const value=await cdp.evaluate('window.__phase20Service || null');
      return value?.status==='pass'||value?.status==='fail'?value:null;
    },'REAL Chromium Phase20 W03 guest clock execution',25000,75);
    if(result.status!=='pass'||
       result.wasmSha!==expectedWasm||result.mjsSha!==expectedMjs||
       result.oracleSha!==expectedOracle||result.checks!==proof.node.checks||
       result.stressCount!==1024||nav.errors?.length||nav.httpErrors?.length)
      throw Error('BLOCKED-BROWSER: actual Phase20 guest failed: '+
        JSON.stringify({result,expectedWasm,nav}));
    console.log('PHASE20_CHROMIUM_REAL_PRIVATE_QUOTA_PASS',expectedWasm,
      'checks',result.checks,'stress',result.stressCount,
      'source',manifest.head);
    console.log('PHASE20_BROWSER_INIT_MS',result.initMs.toFixed(3),
      'STRESS_MS',result.stressMs.toFixed(3));
    console.log('PHASE20_NOT_ORIGINAL_WII_CODE_NOT_NINTENDO_HLE');
  }finally {
    cdp?.close()??socket?.close();
    await stopChild(chrome,'Phase20 exact synthetic clock browser');
    await rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:100});
    if(server.listening)await new Promise(yes=>server.close(yes));
  }
}
await main().catch(error=>fail(String(error?.stack||error),65));
