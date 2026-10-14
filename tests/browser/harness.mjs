import { once } from 'node:events';
import { rmSync } from 'node:fs';

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function waitUntil(predicate, label, timeoutMs = 12000, intervalMs = 75) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  do {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) { lastError = error; }
    if (Date.now() >= deadline) break;
    await delay(Math.min(intervalMs, deadline - Date.now()));
  } while (true);
  throw new Error('Timed out: ' + label +
    (lastError ? '; last error: ' + (lastError.stack || lastError) : ''),
    lastError ? { cause: lastError } : undefined);
}

export async function stopChild(child, label, timeoutMs = 6000) {
  if (!child) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const settled = once(child, 'exit').then(() => true);
  child.kill();
  const closed = await Promise.race([settled, delay(timeoutMs).then(() => false)]);
  if (!closed) {
    if (process.platform === 'win32') {
      const { spawnSync } = await import('node:child_process');
      const forced = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        encoding: 'utf8', timeout: 3000
      });
      if (forced.status !== 0 && child.exitCode === null) {
        throw Error('Unable to terminate ' + label + ': ' + (forced.stderr || 'taskkill failed'));
      }
    } else child.kill('SIGKILL');
    const exited = await Promise.race([settled, delay(3000).then(() => false)]);
    if (!exited) throw Error(label + ' still alive after forced termination: PID ' + child.pid);
  }
}
export async function removeProfile(profile) {
  if (!profile) return;
  // Chromium can release Windows profile handles after it exits.
  await waitUntil(() => {
    rmSync(profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 120 });
    return true;
  }, 'delete temporary browser profile ' + profile, 4500, 150);
}

export class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.navigations = [];
    this.current = null;
    this.requestMap = new Map();
    this.contextMap = new Map();
    this.events = [];
    socket.addEventListener('message', event => this.receive(JSON.parse(event.data)));
    socket.addEventListener('close', () => {
      for (const [id, task] of this.pending) {
        clearTimeout(task.timer);
        task.reject(Error('CDP socket closed while waiting for ' + task.method));
        this.pending.delete(id);
      }
    });
  }
  receive(message) {
    if (message.id) {
      const task = this.pending.get(message.id);
      if (!task) return;
      this.pending.delete(message.id);
      clearTimeout(task.timer);
      message.error ? task.reject(Error(JSON.stringify(message.error))) : task.resolve(message.result);
      return;
    }
    const { method, params = {} } = message;
    this.events.push({ method, params }); // bounded diagnostic history
    if (this.events.length > 250) this.events.shift();
    if (method === 'Page.frameNavigated') {
      const f = params.frame;
      const nav = this.navigations.find(n => n.target === f.url && !n.frameId);
      if (nav) {
        nav.frameId = f.id;
        nav.loaderId = f.loaderId;
        this.current = nav;
        nav.activity = Date.now();
        for (const [id, request] of this.requestMap) {
          if (request.loaderId !== nav.loaderId) continue;
          // The initial document request predates frameNavigated.
          request.nav = nav;
          if (!request.finished) nav.inflight.add(id);
        }
        for (const [id, context] of this.contextMap) {
          if (context.frameId === nav.frameId && !context.nav) {
            context.nav = nav;
          }
        }
      }
    }
    const nav = this.current;
    if (method === 'Page.lifecycleEvent' && nav && params.frameId === nav.frameId &&
        params.loaderId === nav.loaderId && params.name === 'load') {
      nav.loaded = true;
      nav.activity = Date.now();
    }
    if (method === 'Network.requestWillBeSent') {
      const previous = this.requestMap.get(params.requestId);
      if (previous?.nav) previous.nav.inflight.delete(params.requestId);
      const associated = this.navigations.find(n => n.loaderId && params.loaderId === n.loaderId) || null;
      this.requestMap.set(params.requestId, {
        url: params.request.url, loaderId: params.loaderId, nav: associated, finished: false
      });
      if (associated) { associated.inflight.add(params.requestId); associated.activity = Date.now(); }
    }
    if (method === 'Network.responseReceived') {
      const req = this.requestMap.get(params.requestId);
      if (req?.nav && params.response.status >= 400) {
        req.nav.httpErrors.push(params.response.status + ' ' + params.response.url);
        req.nav.activity = Date.now();
      }
    }
    if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      const req = this.requestMap.get(params.requestId);
      if (req) {
        req.finished = true;
        if (req.nav) { req.nav.inflight.delete(params.requestId); req.nav.activity = Date.now(); }
      }
    }
    if (method === 'Runtime.executionContextCreated') {
      const frameId = params.context.auxData?.frameId;
      const owner = this.navigations.find(n => n.frameId === frameId && n === this.current);
      this.contextMap.set(params.context.id, { frameId, nav: owner || null });
    }
    if (method === 'Runtime.executionContextDestroyed') this.contextMap.delete(params.executionContextId);
    if (method === 'Runtime.executionContextsCleared') this.contextMap.clear();
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      const owner = this.contextMap.get(params.executionContextId)?.nav;
      if (owner) {
        owner.errors.push('console.error: ' +
          params.args.map(a => a.value || a.description || '').join(' '));
        owner.activity = Date.now();
      }
    }
    if (method === 'Runtime.exceptionThrown') {
      const owner = this.contextMap.get(params.exceptionDetails?.executionContextId)?.nav;
      if (owner) {
        owner.errors.push('Uncaught: ' + (params.exceptionDetails.text || 'exception'));
        owner.activity = Date.now();
      }
    }
    if (method === 'Log.entryAdded' && params.entry?.level === 'error') {
      const url = params.entry.url;
      // Log entries lack loader IDs; only credit them to a known request URL
      // in the current navigation, not an unrelated late error from an old page.
      const candidates = [...this.requestMap.values()].filter(req => req.url === url && req.nav);
      const owner = candidates.at(-1)?.nav;
      if (owner) {
        owner.errors.push('Log: ' + params.entry.text + ' at ' + url);
        owner.activity = Date.now();
      }
    }
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(Error('CDP timed out: ' + method));
      }, 10000);
      this.pending.set(id, { method, resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const reply = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true
    });
    if (reply.exceptionDetails) throw Error('Browser JS exception: ' + reply.exceptionDetails.text);
    return reply.result.value;
  }
  async goto(url, { idleMs = 250 } = {}) {
    const target = new URL(url).href;
    const nav = { target, frameId: null, loaderId: null, loaded: false,
      errors: [], httpErrors: [], inflight: new Set(), activity: Date.now() };
    this.navigations.push(nav);
    const result = await this.send('Page.navigate', { url: target });
    if (result.errorText || !result.loaderId) {
      throw Error('New frame navigation failed: ' + (result.errorText || 'missing loader ID'));
    }
    await waitUntil(async () => {
      if (!nav.loaded || nav.frameId !== result.frameId || nav.loaderId !== result.loaderId) return false;
      const tree = await this.send('Page.getFrameTree');
      if (tree.frameTree.frame.loaderId !== result.loaderId ||
          tree.frameTree.frame.url !== target) return false;
      return await this.evaluate('document.readyState === "complete" && location.href === ' +
        JSON.stringify(target));
    }, 'new document loader+load+URL ' + target);
    // Bounded event-quiescence after *this loader's* load. Chromium can leave
    // requests pending without a matching loadingFinished (e.g. speculative fetch),
    // so strict request-count zero is not a safe navigation completion criterion.
    await waitUntil(() => Date.now() - nav.activity >= idleMs,
      'event quiet after ' + target, 12000, 40);
    return nav;
  }
  get errors() { return this.current?.errors || []; }
  get httpErrors() { return this.current?.httpErrors || []; }
  close() { this.socket.close(); }
}
