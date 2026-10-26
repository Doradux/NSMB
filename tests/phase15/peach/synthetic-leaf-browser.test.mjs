// Phase15 Peach: real Chromium execution of EXACT same committed synthetic Wasm
// and pure JS contract exercised by synthetic-leaf-node.test.mjs.
// Opt-in NSMB_BROWSER=/absolute/chrome; on AppArmor hosts where sandbox cannot
// launch, NSMB_BROWSER_NO_SANDBOX=1 is an explicit LOCAL-ONLY QA concession.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {access, readFile, mkdtemp, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {Cdp, waitUntil, stopChild} from '../../browser/harness.mjs';
import {PINNED_WASM_SHA256} from '../../../web-runtime/frame-host/phase15-leaf-evidence.mjs';

const executable = process.env.NSMB_BROWSER;
const present = executable && await access(executable).then(() => true, () => false);
const base = new URL('../../../web-runtime/frame-host/', import.meta.url);
const allowed = new Map([
  ['/phase15-leaf-evidence.mjs', ['phase15-leaf-evidence.mjs','text/javascript']],
  ...Object.keys(PINNED_WASM_SHA256).flatMap(name => [
    ['/dist/' + name + '.mjs', ['dist/' + name + '.mjs','text/javascript']],
    ['/dist/' + name + '.wasm', ['dist/' + name + '.wasm','application/wasm']]
  ])
]);
const page = `<!doctype html><meta charset="utf-8"><title>Synthetic PPC Wasm QA</title>
<script type="module">
import {verifyPinnedWasmBytes, exerciseTranslatedCpuContext,
  exerciseTranslatedCheckedMemory, exerciseUnsupportedCpuFeatures
} from '/phase15-leaf-evidence.mjs';
import createCpu from '/dist/frame_loop_translated_fixture.mjs';
import createRam from '/dist/frame_loop_translated_readwrite_fixture.mjs';
import createNormal from '/dist/frame_loop.mjs';
(async () => {
  try {
    const digests = await verifyPinnedWasmBytes(async name => {
      const response = await fetch('/dist/' + name + '.wasm',{cache:'no-store'});
      if (!response.ok) throw Error('Wasm HTTP ' + response.status);
      return new Uint8Array(await response.arrayBuffer());
    });
    const cpu = await createCpu({locateFile: () => '/dist/frame_loop_translated_fixture.wasm'});
    const ram = await createRam({locateFile: () => '/dist/frame_loop_translated_readwrite_fixture.wasm'});
    const normal = await createNormal({locateFile: () => '/dist/frame_loop.wasm'});
    window.__phase15Peach = {
      status:'pass', digests,
      cpu: exerciseTranslatedCpuContext(cpu),
      ram: exerciseTranslatedCheckedMemory(ram),
      unsupported: exerciseUnsupportedCpuFeatures(normal)
    };
  } catch (error) {
    window.__phase15Peach = {status:'fail', error:String(error?.stack || error)};
  }
})();
</script>`;

test('real Chromium and Node execute identical pinned Wasm and identical strict synthetic ABI checks',
  {skip: !present && 'NSMB_BROWSER unavailable; no browser execution evidence',
   timeout: 45000}, async () => {
    const profile = await mkdtemp(join(tmpdir(), 'nsmb-peach15-chrome-'));
    const server = createServer(async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end(); return;
      }
      if (req.url === '/') {
        res.writeHead(200,{'content-type':'text/html;charset=utf-8','cache-control':'no-store'});
        res.end(req.method === 'HEAD' ? undefined : page); return;
      }
      if (req.url === '/favicon.ico') {res.writeHead(204).end(); return;}
      const record = allowed.get(req.url);
      if (!record) {res.writeHead(404).end(); return;}
      try {
        const data = await readFile(new URL(record[0],base));
        res.writeHead(200,{'content-type':record[1],'cache-control':'no-store'});
        res.end(req.method === 'HEAD' ? undefined : data);
      } catch {res.writeHead(500).end();}
    });
    let browser, socket, cdp;
    try {
      await new Promise((yes,no) => server.once('error',no).listen(0,'127.0.0.1',yes));
      const origin = 'http://127.0.0.1:'+server.address().port;
      for (const route of ['/.git/config','/private/game.iso','/dist/frame_loop_fixture.wasm',
        '/translator-fixture/out/synthetic.dol','/web-runtime/runtime-services/private']) {
        const response = await fetch(origin + route);
        assert.equal(response.status,404,'strictly restricted local HTTP root '+route);
      }
      const args = ['--headless=new','--disable-extensions','--no-first-run',
        '--no-default-browser-check','--disable-dev-shm-usage',
        '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'];
      if (process.env.NSMB_BROWSER_NO_SANDBOX === '1') args.unshift('--no-sandbox');
      browser = spawn(executable,args,{stdio:'ignore',env:process.env});
      const port = await waitUntil(async () => {
        const info = await readFile(join(profile,'DevToolsActivePort'),'utf8');
        return Number(info.split(/\r?\n/)[0]) || null;
      },'Peach Phase15 real Chromium DevToolsActivePort',14000);
      const targets = await waitUntil(async () => {
        const r=await fetch('http://127.0.0.1:'+port+'/json');
        return (await r.json()).filter(x => x.type==='page');
      },'Peach real Chromium targets');
      socket=new WebSocket(targets[0].webSocketDebuggerUrl);
      await Promise.race([
        new Promise((yes,no) => {socket.addEventListener('open',yes,{once:true});
          socket.addEventListener('error',no,{once:true});}),
        new Promise((_,reject) => setTimeout(()=>reject(Error('CDP open timeout')),5000))
      ]);
      cdp=new Cdp(socket);
      for (const method of ['Page.enable','Runtime.enable','Network.enable','Log.enable'])
        await cdp.send(method);
      await cdp.send('Page.setLifecycleEventsEnabled',{enabled:true});
      const nav=await cdp.goto(origin+'/');
      const result=await waitUntil(async () => {
        const data=await cdp.evaluate('window.__phase15Peach || null');
        return ['pass','fail'].includes(data?.status) ? data : null;
      }, 'Chromium same-Wasm CpuContext proof',20000,80);
      assert.equal(result.status,'pass',JSON.stringify(result));
      assert.deepEqual(result.digests,PINNED_WASM_SHA256);
      assert.deepEqual(result.cpu,
        {contexts:3,resetCycles:48,cpuLayoutBytes:464,translatedInvocations:3});
      assert.deepEqual(result.ram,{forwarded:true,quotaRollback:true,mmioRejected:true});
      assert.deepEqual(result.unsupported,{unsupportedMasks:6,mutationBeforeReject:false});
      assert.deepEqual(nav.errors,[]);
      assert.deepEqual(nav.httpErrors,[]);
    } finally {
      cdp?.close() ?? socket?.close();
      await stopChild(browser,'phase15 Peach synthetic Chromium QA');
      await rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:100});
      if (server.listening) await new Promise(yes=>server.close(yes));
    }
});
