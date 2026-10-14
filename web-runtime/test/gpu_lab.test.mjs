import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
let server, port;

async function freePort() {
  const probe = createServer();
  await new Promise((done) => probe.listen(0, '127.0.0.1', done));
  const value = probe.address().port;
  await new Promise((done) => probe.close(done));
  return value;
}

before(async () => {
  port = await freePort();
  server = spawn(process.execPath, ['server.js'], {
    cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(Error('Timed out starting local server')), 5000);
    server.once('exit', (code) => { clearTimeout(timer); fail(Error('Server exited: ' + code)); });
    server.stdout.once('data', () => { clearTimeout(timer); done(); });
  });
});

after(() => { if (server && !server.killed) server.kill(); });

test('the lab serves only allowlisted HTML and ESM with valid MIME types', async () => {
  const html = await fetch(`http://127.0.0.1:${port}/web-runtime/gpu-lab.html`);
  const script = await fetch(`http://127.0.0.1:${port}/web-runtime/gpu-lab.mjs`);
  const forbidden = await fetch(`http://127.0.0.1:${port}/.git/config`);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  assert.match(await html.text(), /Browser GPU feasibility lab/);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /application\/javascript/);
  assert.match(await script.text(), /readBackWebGpu/);
  assert.equal(forbidden.status, 404);
});

const candidates = [
  process.env.NSMB_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);
const browser = candidates.find(existsSync);

test('headless browser verifies the Canvas 2D fallback pixel readback', { skip: !browser && 'Chrome/Brave not installed' }, () => {
  const profile = mkdtempSync(join(tmpdir(), 'nsmb-w02-'));
  try {
    const result = spawnSync(browser, [
      '--headless=new', '--no-first-run', '--no-sandbox', '--disable-extensions',
      '--disable-gpu', `--user-data-dir=${profile}`,
      '--virtual-time-budget=5000', '--dump-dom',
      `http://127.0.0.1:${port}/web-runtime/gpu-lab.html`
    ], { encoding: 'utf8', timeout: 20000, maxBuffer: 3_000_000 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr?.slice(-500));
    assert.match(result.stdout, /id="result"[^>]+data-result="passed"[^>]+data-mode="canvas2d"/);
    assert.match(result.stdout, /2D draw and pixel readback verified/);
  } finally {
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
});
