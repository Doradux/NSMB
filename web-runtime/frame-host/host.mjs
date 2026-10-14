// Browser host loop for compiled W03 + W07, not a guest CPU or native fiber.
export const GuestState = Object.freeze({READY: 1, PAUSED: 2, DONE: 3, FAULT: 4, CANCELLED: 5});

export function createFrameHost(module, {
  ids, budget = 2, maxFrames = 128,
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = handle => cancelAnimationFrame(handle),
  onFrame = () => {}
} = {}) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.some(id => !Number.isInteger(id) || id < 1 || id > 65535)) {
    throw new TypeError('At least one positive integer guest ID is required');
  }
  if (new Set(ids).size !== ids.length) throw new TypeError('Duplicate guest ID');
  if (!Number.isInteger(budget) || budget < 1 || budget > 64) throw new RangeError('Frame budget 1..64');
  if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 10000) throw new RangeError('Max frames 1..10000');

  function invoke(name, ...args) {
    const fn = module['_nsmbw_loop_' + name];
    if (typeof fn !== 'function') throw new Error('Missing Wasm W03 export: ' + name);
    return fn(...args);
  }
  let frames = 0;
  let running = false;
  let handle = null;
  let settle = null;
  let disposed = false;
  let insideFrame = false;
  let runGeneration = 0;

  const snapshot = () => ({
    frames,
    ready: invoke('ready'),
    paused: invoke('paused'),
    done: invoke('done'),
    faulted: invoke('faulted'),
    cancelled: invoke('cancelled'),
    contexts: ids.map(id => ({
      id, state: invoke('state', id), pc: invoke('pc', id),
      regA: invoke('reg_a', id) >>> 0,
      guestError: invoke('guest_error', id), yields: invoke('yields', id)
    })),
    traceLength: invoke('trace_length')
  });

  function frame(fromAnimationCallback = false) {
    if (disposed) throw new Error('Frame host disposed');
    if (running && !fromAnimationCallback) throw new Error('Manual dispatch while frame host running');
    if (insideFrame) throw new Error('Reentrant frame rejected');
    if (frames >= maxFrames) throw new Error('Frame limit reached: ' + maxFrames);
    insideFrame = true;
    try {
      const executed = invoke('frame', budget);
      if (executed < 0) throw new Error('Wasm host frame fault: ' + invoke('error'));
      frames++;
      const current = { ...snapshot(), executed };
      onFrame(current);
      return current;
    } finally {
      insideFrame = false;
    }
  }

  function stop(reason = 'paused') {
    if (!running) return;
    running = false;
    ++runGeneration; // reject stale callbacks even if restarted immediately
    const oldHandle = handle;
    handle = null;
    const done = settle;
    settle = null;
    // Cancellation can fail in hostile browser shims: the tick is still gated
    // by running=false, so no guest work can execute from a stale callback.
    if (oldHandle !== null) { try { cancelFrame(oldHandle); } catch {} }
    done?.({ reason, ...snapshot() });
  }

  function start() {
    if (disposed) return Promise.reject(new Error('Frame host disposed'));
    if (running) return Promise.reject(new Error('Frame host already running'));
    running = true;
    const thisRun = ++runGeneration;
    return new Promise((resolve, reject) => {
      settle = resolve;
      const tick = () => {
        handle = null;
        if (!running || thisRun !== runGeneration) return;
        try {
          const value = frame(true);
          if (!running || thisRun !== runGeneration) return;
          if (value.ready === 0) {
            stop(value.paused || value.faulted ? 'blocked' : 'completed');
          } else if (frames >= maxFrames) {
            stop('frame-limit');
          } else {
            handle = requestFrame(tick);
          }
        } catch (error) {
          running = false;
          settle = null;
          reject(error);
        }
      };
      try {
        handle = requestFrame(tick);
      } catch (error) {
        // Promise rejection alone does NOT clear the host-owned run state.
        running = false;
        settle = null;
        handle = null;
        reject(error);
      }
    });
  }

  function dispose() {
    stop('disposed');
    disposed = true;
  }

  return {
    frame: () => frame(false), start, stop, dispose, snapshot,
    suspend: id => invoke('suspend', id),
    resume: id => invoke('resume', id),
    cancel: id => invoke('cancel', id),
    retryQuota: id => invoke('retry_quota', id),
    get running() { return running; }
  };
}
