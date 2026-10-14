import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const browsers = [
  process.env.NSMB_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].filter(Boolean);
const browser = browsers.find(existsSync);
async function freePort() {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}
test('actual browser runs Emscripten scheduler and 12 host-yielded context dispatches', {
  skip: !browser && 'Chrome/Brave unavailable',
  timeout: 24000
}, async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore','pipe','pipe']
  });
  const profile = mkdtempSync(join(tmpdir(), 'nsmb-w03-'));
  try {
    await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(Error('Node server startup timed out')), 4000);
      child.stdout.once('data', () => { clearTimeout(timer); done(); });
      child.once('exit', (code) => { clearTimeout(timer); reject(Error('Server exited '+code)); });
    });
    const checkUrl = async (p) => fetch('http://127.0.0.1:' + port + p);
    const html = await checkUrl('/web-runtime/scheduler-lab.html');
    const wasm = await checkUrl('/web-runtime/dist/scheduler.wasm');
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-type'), /text\/html/);
    assert.equal(wasm.status, 200);
    assert.match(wasm.headers.get('content-type'), /application\/wasm/);
    const secret = await checkUrl('/.git/config');
    assert.equal(secret.status, 404);

    const x = spawnSync(browser, [
      '--headless=new','--disable-gpu','--no-first-run','--no-sandbox',
      '--disable-extensions', '--user-data-dir=' + profile,
      '--virtual-time-budget=7000','--dump-dom',
      'http://127.0.0.1:' + port + '/web-runtime/scheduler-lab.html'
    ], { encoding: 'utf8', timeout: 18000, maxBuffer: 3000000 });
    assert.equal(x.error, undefined, x.error?.message);
    assert.equal(x.status, 0, x.stderr?.slice(-400));
    assert.match(x.stdout, /id="result"[^>]+data-status="passed"/);
    assert.match(x.stdout, /PASS — 3 contexts, 12 Wasm dispatches, Asyncify nested C\+\+ suspend\/resume/);
    assert.match(x.stdout, /Host async turns: 12/);
    assert.match(x.stdout, /Asyncify nested C\+\+ result: 83/);
  } finally {
    child.kill();
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
});
