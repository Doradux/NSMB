import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const candidates = [process.env.NSMB_BROWSER,
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'
].filter(Boolean);
const browser = candidates.find(existsSync);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const maxWait = async (predicate, label, ms = 12000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const value = await predicate(); if (value) return value; } catch {}
    await sleep(100);
  }
  throw Error('Timed out: ' + label);
};
async function freePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.errors = [];
    this.httpErrors = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const task = this.pending.get(message.id);
        if (!task) return;
        this.pending.delete(message.id);
        clearTimeout(task.timeout);
        message.error ? task.reject(Error(JSON.stringify(message.error))) : task.resolve(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push('Uncaught: ' + (message.params.exceptionDetails.text || 'exception'));
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        this.errors.push('console.error: ' + message.params.args.map(a => a.value || a.description || '').join(' '));
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        this.errors.push('Log: ' + message.params.entry.text + ' at ' + (message.params.entry.url || '(no url)'));
      }
      if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
        this.httpErrors.push(message.params.response.status + ' ' + message.params.response.url);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id); reject(Error('CDP timed out: ' + method));
      }, 10000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const reply = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (reply.exceptionDetails) throw Error('Browser JS exception: ' + reply.exceptionDetails.text);
    return reply.result.value;
  }
  async goto(url) {
    this.errors.length = 0;
    this.httpErrors.length = 0;
    await this.send('Page.navigate', { url });
    await maxWait(async () => (await this.evaluate('document.readyState')) === 'complete', 'page load');
  }
  close() { this.socket.close(); }
}

let server, chrome, session, port, profile;
const base = () => 'http://127.0.0.1:' + port;
before(async () => {
  assert.ok(browser, 'Install Chrome or Brave, or set NSMB_BROWSER to its executable');
  port = await freePort();
  server = spawn(process.execPath, ['server.js'], {
    cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore'
  });
  await maxWait(async () => (await fetch(base())).status === 200, 'HTTP server');
  profile = mkdtempSync(join(tmpdir(), 'nsmb-peach-w06-'));
  chrome = spawn(browser, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-gpu', '--no-sandbox', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });
  const debug = await maxWait(() => {
    const file = join(profile, 'DevToolsActivePort');
    return existsSync(file) && readFileSync(file, 'utf8').split(/\r?\n/)[0];
  }, 'Chrome DevTools port');
  const pages = await maxWait(async () => {
    const r = await fetch('http://127.0.0.1:' + debug + '/json');
    return (await r.json()).filter(p => p.type === 'page');
  }, 'Chrome page target');
  const socket = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  session = new Cdp(socket);
  for (const domain of ['Page', 'Runtime', 'Network', 'Log']) await session.send(domain + '.enable');
});
after(async () => {
  if (session) session.close();
  if (chrome) chrome.kill();
  if (server) server.kill();
  if (profile) {
    // Chromium may still be releasing files immediately after process termination on Windows.
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); } catch {}
  }
});

test('home and diagnostic are English pages with explicit non-gameplay status', async () => {
  for (const route of ['/', '/web-runtime/lab.html']) {
    const response = await fetch(base() + route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    const body = await response.text();
    assert.match(body, /<html lang="en">/);
    assert.match(body, /not (?:the game|gameplay|Mario gameplay|ported yet|playable)|not console emulation/i);
  }
});

test('all page assets respond with the correct MIME and original PNG is 1920x1080', async () => {
  const resources = [
    ['/styles.css', 'text/css'], ['/app.js', 'application/javascript'],
    ['/assets/favicon.svg', 'image/svg+xml'], ['/assets/world-1-1.png', 'image/png'],
    ['/web-runtime/dist/guest_memory.mjs', 'application/javascript'],
    ['/web-runtime/dist/guest_memory.wasm', 'application/wasm']
  ];
  for (const [path, mime] of resources) {
    const response = await fetch(base() + path);
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get('content-type').startsWith(mime), path);
    const data = Buffer.from(await response.arrayBuffer());
    assert.ok(data.length > 0, path + ' is empty');
    if (path.endsWith('.png')) {
      assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.deepEqual([data.readUInt32BE(16), data.readUInt32BE(20)], [1920, 1080]);
    }
  }
});

test('unknown routes and path traversal are denied without disclosing files', async () => {
  for (const path of ['/does-not-exist', '/.git/config', '/server.js',
    '/web-runtime/src/guest_memory.cpp', '/%2e%2e/%2e%2e/secret',
    '/%2f..%2fprivate-data', '/C:%5cWindows%5cwin.ini']) {
    const response = await fetch(base() + path);
    assert.equal(response.status, 404, path);
    assert.equal(await response.text(), 'Not found', path);
  }
  assert.equal((await fetch(base())).status, 200, 'server remains healthy');
});

test('home renders English navigation, conceptual preview and no broken image', async () => {
  await session.goto(base() + '/');
  const info = await session.evaluate(String.raw`(() => {
    const img = document.querySelector('.preview-frame img');
    return { lang: document.documentElement.lang, title: document.title,
      disclaimer: document.body.innerText.includes('No playable build is available yet'),
      nav: [...document.querySelectorAll('nav a')].map(a => a.textContent.trim()),
      loaded: img.complete && img.naturalWidth > 0,
      dimensions: [img.naturalWidth, img.naturalHeight],
      imageAlt: img.getAttribute('alt') || '',
      diagnosticLink: !!document.querySelector('a[href="/web-runtime/lab.html"]')
    };
  })()`);
  assert.equal(info.lang, 'en');
  assert.match(info.title, /Browser Port/);
  assert.equal(info.disclaimer, true);
  assert.deepEqual(info.nav, ['Preview', 'How it works', 'Progress']);
  assert.equal(info.loaded, true);
  assert.deepEqual(info.dimensions, [1920, 1080]);
  assert.ok(info.imageAlt.length > 35, 'Image must have descriptive alt');
  assert.ok(info.diagnosticLink);
});

test('desktop and phone viewports do not cause horizontal page overflow', async () => {
  for (const width of [1440, 390, 320]) {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width, height: 900, mobile: width < 500, deviceScaleFactor: 1
    });
    await session.goto(base() + '/');
    const layout = await session.evaluate(String.raw`(() => ({
      width: window.innerWidth, scroll: document.documentElement.scrollWidth,
      hero: !!document.getElementById('hero-title'),
      picture: document.querySelector('.preview-frame img').getBoundingClientRect().width
    }))()`);
    assert.equal(layout.width, width, width + 'px viewport expanded to ' + layout.width + 'px');
    assert.ok(layout.scroll <= width + 1, width + 'px overflow: ' + layout.scroll);
    assert.equal(layout.hero, true);
    assert.ok(layout.picture > 0 && layout.picture <= width, 'preview must fit screen');
  }
  await session.send('Emulation.clearDeviceMetricsOverride');
});

test('keyboard Tab focus reaches visible links in the homepage', async () => {
  await session.goto(base() + '/');
  await session.evaluate('document.activeElement.blur()');
  await session.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  const focused = await session.evaluate('({ tag: document.activeElement.tagName, label: document.activeElement.getAttribute("aria-label") })');
  assert.equal(focused.tag, 'A');
  assert.ok(focused.label, 'Back-to-top anchor has an accessible label');
});

test('real browser runs all 11 WebAssembly memory checks', async () => {
  await session.goto(base() + '/web-runtime/lab.html');
  const info = await maxWait(async () => {
    const value = await session.evaluate(String.raw`(() => ({ status: document.getElementById('result').textContent,
      lines: document.getElementById('log').textContent.split('\n') }))()`);
    return /^PASS|^FAIL/.test(value.status) ? value : null;
  }, 'browser WASM check completion', 15000);
  assert.equal(info.status, 'PASS — 11 checks executed in the browser', info.lines.join('; '));
  assert.equal(info.lines.length, 11);
  for (const line of info.lines) assert.match(line, /^✓ /, line);
});

test('browser loads diagnostic page without JS console errors', async () => {
  assert.deepEqual(session.errors, [], session.errors.join('\n') + '\nRequests: ' + session.httpErrors.join(', '));
  assert.equal((await fetch(base() + '/web-runtime/lab.html')).status, 200);
});

test('malformed percent encoding returns a controlled error without crashing the server', async () => {
  let response;
  try {
    response = await fetch(base() + '/%');
  } catch (error) {
    assert.fail('Server crashed or reset the connection on /%: ' + error.message);
  }
  assert.ok([400, 404].includes(response.status), 'unsafe request should return 400/404');
  assert.equal((await fetch(base())).status, 200, 'server must survive invalid input');
});
