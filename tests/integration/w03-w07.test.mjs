import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Cdp, waitUntil, stopChild, removeProfile } from '../browser/harness.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const w03 = resolve(process.env.NSMB_W03_ROOT || root);
const w07 = resolve(process.env.NSMB_W07_ROOT || root);
const paths = new Map([
  ['/', [join(root, 'tests/integration/diagnostic.html'), 'text/html; charset=utf-8']],
  ['/scheduler.mjs', [join(w03, 'web-runtime/dist/scheduler.mjs'), 'application/javascript']],
  ['/scheduler.wasm', [join(w03, 'web-runtime/dist/scheduler.wasm'), 'application/wasm']],
  ['/checked_interop.mjs', [join(w07, 'web-runtime/interop/dist/checked_interop.mjs'), 'application/javascript']],
  ['/checked_interop.wasm', [join(w07, 'web-runtime/interop/dist/checked_interop.wasm'), 'application/wasm']]
]);
const browser = [process.env.NSMB_BROWSER,
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome'
].filter(Boolean).find(existsSync);

let server, chrome, profile, socket, session, origin;
const serve = (req, res) => {
  const resource = paths.get(req.url);
  if (!resource || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(404, {'content-type':'text/plain'}).end('Not found');
    return;
  }
  fs.readFile(resource[0]).then(bytes => {
    res.writeHead(200, {'content-type':resource[1], 'cache-control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : bytes);
  }, () => {res.writeHead(500).end('Resource unavailable')});
};
before(async () => {
  for (const [url, [pathname]] of paths) {
    assert.ok(existsSync(pathname), url + ' missing; set NSMB_W03_ROOT and NSMB_W07_ROOT to synthetic worktrees');
  }
  server = createServer(serve);
  await new Promise((yes, no) => server.once('error', no).listen(0, '127.0.0.1', yes));
  origin = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  const errors=[];
  try {session?.close()}catch(e){errors.push(e)}
  try {await stopChild(chrome, 'Chrome integration')}catch(e){errors.push(e)}
  try {await removeProfile(profile)}catch(e){errors.push(e)}
  if(server?.listening)try{await new Promise((yes,no)=>server.close(e=>e?no(e):yes()))}catch(e){errors.push(e)}
  if(errors.length)throw new AggregateError(errors,'Integration cleanup failed');
});

test('Node drives real W03/W07 Wasm through pause/restart, zero and typed memory errors', async () => {
  const w03module = (await import(pathToFileURL(paths.get('/scheduler.mjs')[0]).href)).default;
  const w07module = (await import(pathToFileURL(paths.get('/checked_interop.mjs')[0]).href)).default;
  const scheduler=await w03module({locateFile:()=>paths.get('/scheduler.wasm')[0]});
  const guest=await w07module({locateFile:()=>paths.get('/checked_interop.wasm')[0]});
  const s=(name,...args)=>scheduler['_nsmbw_sched_'+name](...args);
  const m=(name,...args)=>guest['_nsmbw_'+name](...args);
  s('reset');m('interop_reset');
  assert.equal(m('mem_set_page_budget',1),1);
  for(const id of [1,2,3])assert.equal(s('spawn',id,3),1);
  const dispatched=[];
  const drive=()=> {
    const id=s('step'); assert.ok(id>0);
    // MEM1 source is zero, legitimately mapped even without an allocated page.
    assert.equal(m('interop_step',0x80001000+id*8,0x90001000+id*8,id),1);
    assert.equal(m('interop_status'),0);
    assert.equal(m('mem_read32',0x90001000+id*8),id);
    dispatched.push(id);
  };
  for(let i=0;i<3;i++)drive();
  assert.equal(s('suspend',2),1);
  for(let i=0;i<4;i++)drive();
  assert.equal(s('step'),-1,'paused, not completed');
  assert.equal(s('resume',2),1);
  for(let i=0;i<2;i++)drive();
  assert.deepEqual(dispatched,[1,2,3,1,3,1,3,2,2]);
  assert.equal(s('done'),3);assert.equal(s('step'),0);
  assert.equal(s('trace_length'),9);
  const cases=[[0xCC000000,4],[0x40000000,1],[0xFFFFFFFE,2]];
  for(const [source,error] of cases){
    assert.equal(m('interop_step',source,0x90001020,7),0);
    assert.equal(m('interop_status'),error);
  }
  const pages=m('mem_pages');
  assert.equal(m('interop_step',0x80001000,0x90001FFF,7),0);
  assert.equal(m('interop_status'),3);
  assert.equal(m('mem_pages'),pages);
  assert.equal(m('mem_read8',0x90001FFF),0,'failed crossing store must be atomic');
  s('reset'); m('interop_reset');
  assert.equal(s('trace_length'),0);
  assert.equal(m('mem_pages'),0);
  assert.equal(m('interop_status'),0);
});

test('allowlist exposes only synthetic HTML/ESM/Wasm and denies private resources', async () => {
  for (const [route, [, mime]] of paths) {
    const result=await fetch(origin+route);
    assert.equal(result.status,200,route);
    assert.ok(result.headers.get('content-type').startsWith(mime),route);
    const body=Buffer.from(await result.arrayBuffer());
    assert.ok(body.length>0,route);
    if(route.endsWith('.wasm'))assert.equal(body.subarray(0,4).toString('hex'),'0061736d');
  }
  for (const route of ['/private/main.dol','/assets/world-1-1.png','/.git/config',
    '/C:%5cUsers%5ckakyg','/web-runtime/src/guest_memory.cpp']) {
    const response=await fetch(origin+route);
    assert.equal(response.status,404,route);
  }
});
test('real headless Chrome runs bounded frame loop and shows memory errors to UI', async t => {
  if(!browser) return t.skip('requires Chrome or Brave');
  profile=mkdtempSync(join(tmpdir(),'nsmb-peach-w03-w07-'));
  chrome=spawn(browser,['--headless=new','--no-first-run','--no-default-browser-check',
    '--disable-extensions','--disable-gpu','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  const port=await waitUntil(()=>{
    if(chrome.exitCode!==null)throw Error('Chrome exit='+chrome.exitCode);
    const file=join(profile,'DevToolsActivePort');
    return existsSync(file) && Number(readFileSync(file,'utf8').split(/\r?\n/)[0])||null;
  },'integration Chrome debugging port');
  const pages=await waitUntil(async()=>{
    const res=await fetch('http://127.0.0.1:'+port+'/json');
    return (await res.json()).filter(p=>p.type==='page');
  },'integration Chrome targets');
  socket=new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((ok,no)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',no,{once:true});
  });
  session=new Cdp(socket);
  for(const name of ['Page','Runtime','Network','Log'])await session.send(name+'.enable');
  await session.send('Page.setLifecycleEventsEnabled',{enabled:true});
  // Explicitly exercise Canvas fallback even on hosts with an experimental GPU adapter.
  await session.send('Page.addScriptToEvaluateOnNewDocument',{
    source:'Object.defineProperty(navigator,"gpu",{configurable:true,value:undefined});'
  });
  const nav=await session.goto(origin+'/');
  const result=await waitUntil(async()=>{
    const obj=await session.evaluate(String.raw`(() => {
      const node=document.getElementById('result');
      if(!node || node.dataset.state==='pending')return null;
      return {state:node.dataset.state,text:node.textContent,
        report:document.getElementById('details').textContent};
    })()`);
    return obj && obj.state!=='pending'?obj:null;
  },'W03/W07 browser modules and bounded frame loop',18000);
  assert.equal(result.state,'pass',result.text+'\n'+result.report);
  const report=JSON.parse(result.report);
  assert.deepEqual(report.dispatches,[1,2,3,1,3,1,3,2,2]);
  assert.equal(report.hostTurns,9);
  assert.equal(report.done,3);
  assert.equal(report.paused,0);
  assert.equal(report.validZeroRead,true);
  assert.deepEqual(report.errors.map(e=>e.status),[4,1,2,3]);
  assert.equal(report.pageCount,1);
  assert.equal(report.canvasFallback,'passed');
  assert.deepEqual(nav.errors,[]);
  assert.deepEqual(nav.httpErrors,[]);
});

test('128 reset/resume cycles stay bounded, deterministic and preserve guest-error policy', async () => {
  const [schedulerFactory, interopFactory] = await Promise.all([
    import(pathToFileURL(paths.get('/scheduler.mjs')[0]).href).then(m=>m.default),
    import(pathToFileURL(paths.get('/checked_interop.mjs')[0]).href).then(m=>m.default)
  ]);
  const sched=await schedulerFactory({locateFile:()=>paths.get('/scheduler.wasm')[0]});
  const guest=await interopFactory({locateFile:()=>paths.get('/checked_interop.wasm')[0]});
  const s=(name,...args)=>sched['_nsmbw_sched_'+name](...args);
  const m=(name,...args)=>guest['_nsmbw_'+name](...args);
  assert.equal(m('mem_set_page_budget',2),1);
  for(let cycle=0;cycle<128;cycle++){
    s('reset');m('interop_reset');
    assert.equal(m('mem_pages'),0);
    assert.equal(s('trace_length'),0);
    assert.equal(s('spawn',1,3),1); assert.equal(s('spawn',2,3),1);
    assert.equal(s('run_budget',1),1);
    assert.equal(s('suspend',1),1);
    assert.equal(s('run_budget',3),3);
    assert.equal(s('step'),-1,'blocked, not runaway');
    assert.equal(s('resume',1),1);
    assert.equal(s('run_budget',1024),2);
    assert.equal(s('done'),2);
    assert.equal(s('trace_length'),6);
    assert.equal(s('step'),0);
    assert.equal(m('interop_step',0x80001000,0x90001000,cycle),1);
    assert.equal(m('interop_status'),0);
    assert.equal(m('mem_read32',0x90001000)>>>0,cycle);
    assert.equal(m('interop_step',0xCC000000,0x90001004,1),0);
    assert.equal(m('interop_status'),4);
    assert.equal(m('mem_read32',0x90001004),0);
  }
});
