import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Cdp, waitUntil, stopChild, removeProfile, delay } from './harness.mjs';

class MockSocket {
  constructor() { this.handlers = new Map(); this.last = null; this.commands = []; }
  addEventListener(name, callback) { this.handlers.set(name, callback); }
  emit(method, params) {
    this.handlers.get('message')({ data: JSON.stringify({ method, params }) });
  }
  send(raw) {
    const { id, method, params } = JSON.parse(raw);
    this.commands.push(method);
    this.last?.({ id, method, params }, this);
  }
  reply(id, result) {
    this.handlers.get('message')({ data: JSON.stringify({ id, result }) });
  }
  close() { this.handlers.get('close')?.(); }
}
test('polling preserves useful last exception in the timeout cause', async () => {
  await assert.rejects(
    waitUntil(() => { throw Error('DevToolsActivePort permission denied'); }, 'Chrome startup', 20, 5),
    err => err.message.includes('DevToolsActivePort permission denied') &&
      err.cause?.message === 'DevToolsActivePort permission denied'
  );
});

test('CDP navigation cannot return a stale document despite readyState complete', async () => {
  const ws = new MockSocket();
  const cdp = new Cdp(ws);
  const url = 'http://127.0.0.1:61234/new';
  let newFrame = false, done = false;
  ws.last = (req, socket) => {
    if (req.method === 'Page.navigate') {
      socket.reply(req.id, { frameId: 'frame1', loaderId: 'NEW' });
      // A previous page is still complete; new one takes a measurable time.
      setTimeout(() => {
        socket.emit('Network.requestWillBeSent', {
          requestId: 'r1', loaderId: 'NEW', request: { url }
        });
        socket.emit('Page.frameNavigated', {
          frame: { id: 'frame1', loaderId: 'NEW', url }
        });
        newFrame = true;
        socket.emit('Runtime.executionContextCreated', { context: {
          id: 123, auxData: { frameId: 'frame1' }
        }});
        socket.emit('Page.lifecycleEvent', {
          frameId: 'frame1', loaderId: 'NEW', name: 'load'
        });
        socket.emit('Network.loadingFinished', { requestId: 'r1' });
      }, 45);
    } else if (req.method === 'Page.getFrameTree') {
      socket.reply(req.id, { frameTree: { frame: {
        loaderId: newFrame ? 'NEW' : 'OLD', url: newFrame ? url : 'about:blank'
      }}});
    } else if (req.method === 'Runtime.evaluate') {
      socket.reply(req.id, { result: { value: true } }); // even old document passes readyState
    }
  };
  const navigating = cdp.goto(url, { idleMs: 10 }).then(() => { done = true; });
  await delay(15);
  assert.equal(done, false, 'old page must not satisfy new navigation');
  await navigating;
  assert.ok(newFrame);
  assert.equal(cdp.current.loaderId, 'NEW');
  assert.equal(cdp.current.loaded, true);
  assert.ok(ws.commands.includes('Page.getFrameTree'));
  cdp.close();
});

test('late console/resource events belong to the original loader, not next navigation', async () => {
  const ws = new MockSocket(), cdp = new Cdp(ws);
  const urlOld = 'http://127.0.0.1:61234/a';
  const urlNew = 'http://127.0.0.1:61234/b';
  const old = { target: urlOld, loaderId: 'OLD', frameId: 'f', loaded: true,
    errors: [], httpErrors: [], inflight: new Set(), activity: Date.now() };
  const current = { target: urlNew, loaderId: 'NEW', frameId: 'f', loaded: true,
    errors: [], httpErrors: [], inflight: new Set(), activity: Date.now() };
  cdp.navigations.push(old, current);
  cdp.current = current;
  cdp.contextMap.set(1, { frameId: 'f', nav: old });
  cdp.contextMap.set(2, { frameId: 'f', nav: current });
  const missing = urlOld + '/missing';
  ws.emit('Network.requestWillBeSent', { requestId: 'oldReq', loaderId: 'OLD',
    request: { url: missing } });
  ws.emit('Network.responseReceived', { requestId: 'oldReq',
    response: { url: missing, status: 404 } });
  ws.emit('Log.entryAdded', { entry: { level: 'error', url: missing,
    text: 'late 404 from old page' } });
  ws.emit('Runtime.consoleAPICalled', { type: 'error', executionContextId: 1,
    args: [{ value: 'old error' }] });
  ws.emit('Runtime.consoleAPICalled', { type: 'error', executionContextId: 2,
    args: [{ value: 'new error' }] });
  assert.equal(old.httpErrors.length, 1);
  assert.equal(old.errors.length, 2);
  assert.deepEqual(current.httpErrors, []);
  assert.deepEqual(current.errors, ['console.error: new error']);
  cdp.close();
});

test('terminating child waits for exit; profile deletion is verifiable', async () => {
  const proc = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 10000)'],
    { stdio: 'ignore' });
  await delay(80);
  await stopChild(proc, 'synthetic test child', 3000);
  assert.ok(proc.exitCode !== null || proc.signalCode !== null);
  const profile = mkdtempSync(join(tmpdir(), 'nsmb-harness-unit-'));
  writeFileSync(join(profile, 'probe.txt'), 'temporary');
  await removeProfile(profile);
  assert.equal(existsSync(profile), false);
});

test('late Log 404 from reused asset URL cannot falsely fail the next loader', async () => {
  const ws = new MockSocket(), cdp = new Cdp(ws);
  const a = { target: 'http://127.0.0.1/a', loaderId: 'OLD', frameId: 'f',
    errors: [], httpErrors: [], inflight: new Set(), activity: Date.now() };
  const b = { target: 'http://127.0.0.1/b', loaderId: 'NEW', frameId: 'f',
    errors: [], httpErrors: [], inflight: new Set(), activity: Date.now() };
  cdp.navigations.push(a, b); cdp.current = b;
  const url = 'http://127.0.0.1/shared/favicon.ico';
  ws.emit('Network.requestWillBeSent', { requestId: 'old', loaderId: 'OLD',
    request: { url } });
  ws.emit('Network.responseReceived', { requestId: 'old',
    response: { url, status: 404 } });
  ws.emit('Network.loadingFinished', { requestId: 'old' });
  ws.emit('Network.requestWillBeSent', { requestId: 'new', loaderId: 'NEW',
    request: { url } });
  ws.emit('Network.responseReceived', { requestId: 'new',
    response: { url, status: 200 } });
  ws.emit('Network.loadingFinished', { requestId: 'new' });
  ws.emit('Log.entryAdded', { entry: { level: 'error', url, text: 'late old 404' } });
  assert.equal(a.httpErrors.length, 1, 'HTTP failures retain correct loader via requestId');
  assert.deepEqual(b.httpErrors, []);
  assert.deepEqual(b.errors, [], 'Log-only ambiguous old error must not fail new document');
  assert.equal(cdp.ambiguousLogEntries.length, 1, 'ambiguous Log is retained as diagnostics');
  cdp.close();
});
