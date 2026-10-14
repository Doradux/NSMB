/* W02 graphics diagnostics. Browser WebGPU probe, not a Wii/GX renderer. */
const EXPECTED = [28, 109, 168, 255];
const COLOR = { r: EXPECTED[0] / 255, g: EXPECTED[1] / 255, b: EXPECTED[2] / 255, a: 1 };

export class GpuLabError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'GpuLabError';
    this.status = status;
  }
}

export function createGraphicsController({
  doc, nav, win, textureUsage, bufferUsage, mapMode, timeoutMs = 4500
}) {
  const gpuCanvas = doc.getElementById('gpu-canvas');
  const fallbackCanvas = doc.getElementById('canvas2d');
  const stage = doc.getElementById('stage');
  const result = doc.getElementById('result');
  const diagnostics = doc.getElementById('diagnostics');
  const rerun = doc.getElementById('rerun');
  const state = {
    mode: 'pending', result: 'pending', gpuStatus: 'checking', canvasStatus: 'not_run',
    reason: '', width: 0, height: 0, checkedPixel: null, generation: 0
  };
  let currentRun = null;
  let generation = 0;
  let closed = false;

  const isLatest = (run) => !closed && currentRun === run;
  const isCurrent = (run) => isLatest(run) && run.active;
  const describe = (status) => {
    if (status === 'verified') return 'verified';
    if (status === 'unavailable') return 'unavailable';
    if (status === 'timeout') return 'timed out';
    if (status === 'lost') return 'device lost';
    return 'failed';
  };

  function update(mode, outcome, gpuStatus, canvasStatus, reason, sample = null) {
    Object.assign(state, {
      mode, result: outcome, gpuStatus, canvasStatus, reason,
      checkedPixel: sample, generation
    });
    result.dataset.mode = mode;
    result.dataset.result = outcome;
    result.dataset.gpuStatus = gpuStatus;
    if (mode === 'webgpu') {
      result.textContent = 'PASS — WebGPU GPU-render/pass readback verified (synthetic only)';
    } else if (mode === 'canvas2d') {
      result.textContent = (outcome === 'passed' ? 'PASS — Canvas 2D only' : 'FAIL — Canvas 2D') +
        '; WebGPU ' + describe(gpuStatus) + ': ' + reason;
    } else {
      result.textContent = 'CHECKING — browser graphics initialization';
    }
    diagnostics.textContent = JSON.stringify({
      webgpuApi: Boolean(nav.gpu), secureContext: Boolean(win.isSecureContext), ...state
    }, null, 2);
  }

  function resizeCanvases() {
    const ratio = Math.min(win.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.min(1920, Math.round(stage.clientWidth * ratio)));
    const height = Math.max(1, Math.round(width * 9 / 16));
    for (const canvas of [gpuCanvas, fallbackCanvas]) {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    }
    state.width = width;
    state.height = height;
  }

  function disposeRun(run) {
    if (!run || run.disposed) return;
    run.active = false; // first, so device.lost handlers cannot repaint stale UI
    run.disposed = true;
    try { run.context?.unconfigure?.(); } catch {}
    try { run.device?.destroy?.(); } catch {}
    run.device = null;
    run.context = null;
  }

  async function bounded(promise, label, run, onLate) {
    let expired = false;
    let timeout;
    const checked = Promise.resolve(promise).then((value) => {
      if (expired || !isCurrent(run)) {
        try { onLate?.(value); } catch {}
        throw new GpuLabError('cancelled', label + ' arrived after cancellation');
      }
      return value;
    });
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        expired = true;
        reject(new GpuLabError('timeout', label + ' exceeded ' + timeoutMs + 'ms'));
      }, timeoutMs);
    });
    try {
      return await Promise.race([checked, deadline]);
    } finally {
      clearTimeout(timeout);
    }
  }

  function draw2D(run, gpuStatus, reason) {
    if (!isLatest(run)) return;
    gpuCanvas.hidden = true;
    fallbackCanvas.hidden = false;
    resizeCanvases();
    try {
      const ctx = fallbackCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('2D canvas context unavailable');
      ctx.fillStyle = '#1c6da8';
      ctx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(fallbackCanvas.width / 4), Math.round(fallbackCanvas.height / 4),
                   Math.round(fallbackCanvas.width / 2), Math.round(fallbackCanvas.height / 2));
      const sample = Array.from(ctx.getImageData(0, 0, 1, 1).data);
      const pass = sample.length === 4 && sample.every((x, i) => x === EXPECTED[i]);
      update('canvas2d', pass ? 'passed' : 'failed', gpuStatus,
             pass ? 'passed' : 'failed', reason, sample);
    } catch (error) {
      update('canvas2d', 'failed', gpuStatus, 'failed',
             reason + '; Canvas failed: ' + String(error?.message || error));
    }
  }

  async function gpuReadback(run) {
    const device = run.device;
    const probe = device.createTexture({
      size: [1, 1, 1], format: 'rgba8unorm',
      usage: textureUsage.RENDER_ATTACHMENT | textureUsage.COPY_SRC
    });
    let buffer;
    let mapped = false;
    try {
      // Synthetic programmable pipeline: a fullscreen triangle generated from
      // vertex_index, with a constant-color fragment shader. No game assets.
      const module = device.createShaderModule({
        code: `
@vertex fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
  let vertices = array<vec2f, 3>(
    vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0)
  );
  return vec4f(vertices[vertexIndex], 0.0, 1.0);
}
@fragment fn fs_main() -> @location(0) vec4f {
  return vec4f(0.10980392, 0.42745098, 0.65882353, 1.0);
}`
      });
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs_main' },
        fragment: { module, entryPoint: 'fs_main', targets: [{ format: 'rgba8unorm' }] },
        primitive: { topology: 'triangle-list' }
      });
      buffer = device.createBuffer({
        size: 256, usage: bufferUsage.COPY_DST | bufferUsage.MAP_READ
      });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: probe.createView(), loadOp: 'clear', storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 }
        }]
      });
      pass.setPipeline(pipeline);
      pass.draw(3);
      pass.end();
      encoder.copyTextureToBuffer({ texture: probe }, { buffer, bytesPerRow: 256 }, [1, 1, 1]);
      device.queue.submit([encoder.finish()]);
      await bounded(buffer.mapAsync(mapMode.READ), 'GPU buffer mapping', run);
      if (!isCurrent(run)) throw new GpuLabError('cancelled', 'GPU work was superseded');
      mapped = true;
      const sample = Array.from(new Uint8Array(buffer.getMappedRange()).subarray(0, 4));
      if (!sample.every((value, i) => Math.abs(value - EXPECTED[i]) <= 1)) {
        throw new GpuLabError('failed', 'GPU pixel mismatch: ' + sample.join(','));
      }
      return sample;
    } finally {
      if (mapped) {
        try { buffer.unmap(); } catch {}
      }
      try { buffer?.destroy(); } catch {}
      try { probe.destroy(); } catch {}
    }
  }

  function drawGpu(run) {
    if (!isCurrent(run)) return;
    resizeCanvases();
    const encoder = run.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: run.context.getCurrentTexture().createView(),
        loadOp: 'clear', storeOp: 'store', clearValue: COLOR
      }]
    });
    pass.end();
    run.device.queue.submit([encoder.finish()]);
  }

  async function run() {
    if (closed) return { ...state };
    const old = currentRun;
    const task = { id: ++generation, active: true, disposed: false, device: null, context: null };
    currentRun = task;
    disposeRun(old);
    update('initializing', 'pending', 'checking', 'not_run', 'Acquiring WebGPU adapter');

    if (!win.isSecureContext || !nav.gpu) {
      draw2D(task, 'unavailable',
             !win.isSecureContext ? 'a secure origin is required' : 'WebGPU API is unavailable');
      return { ...state };
    }

    try {
      const adapter = await bounded(nav.gpu.requestAdapter(), 'GPU adapter discovery', task);
      if (!adapter) throw new GpuLabError('unavailable', 'no compatible GPU adapter');
      task.device = await bounded(adapter.requestDevice(), 'GPU device request', task,
                                  (lateDevice) => lateDevice?.destroy?.());
      if (!task.device) throw new GpuLabError('unavailable', 'GPU device is unavailable');

      const ownedDevice = task.device;
      Promise.resolve(ownedDevice.lost).then((info) => {
        if (!isCurrent(task) || task.device !== ownedDevice) return;
        disposeRun(task);
        draw2D(task, 'lost', 'GPU device lost: ' + String(info?.message || 'unknown'));
      }).catch((err) => {
        if (isCurrent(task)) {
          disposeRun(task);
          draw2D(task, 'lost', 'GPU device loss: ' + String(err?.message || err));
        }
      });
      task.context = gpuCanvas.getContext('webgpu');
      if (!task.context) throw new GpuLabError('failed', 'WebGPU canvas context unavailable');
      task.context.configure({
        device: task.device, format: nav.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque'
      });

      const pixel = await gpuReadback(task);
      if (!isCurrent(task)) return { ...state };
      drawGpu(task);
      await bounded(task.device.queue.onSubmittedWorkDone(), 'GPU queue completion', task);
      if (!isCurrent(task)) return { ...state };
      fallbackCanvas.hidden = true;
      gpuCanvas.hidden = false;
      update('webgpu', 'passed', 'verified', 'not_run',
             'Synthetic WGSL vertex/fragment pipeline, canvas submission and 1x1 pixel readback', pixel);
    } catch (error) {
      if (!isCurrent(task)) return { ...state };
      const status = error instanceof GpuLabError ? error.status : 'failed';
      const reason = String(error?.message || error);
      disposeRun(task);
      draw2D(task, status, reason);
    }
    return { ...state };
  }

  function resize() {
    if (!currentRun || !isLatest(currentRun)) return;
    const task = currentRun;
    if (state.mode === 'webgpu') {
      try { drawGpu(task); } catch (error) {
        disposeRun(task);
        draw2D(task, 'failed', 'WebGPU resize failed: ' + String(error?.message || error));
      }
    } else if (state.mode === 'canvas2d') {
      draw2D(task, state.gpuStatus, state.reason);
    }
  }

  function dispose() {
    closed = true;
    disposeRun(currentRun);
    currentRun = null;
    rerun?.removeEventListener?.('click', onClick);
    win.removeEventListener?.('resize', resize);
  }
  function onClick() { void run(); }

  rerun?.addEventListener?.('click', onClick);
  win.addEventListener?.('resize', resize);
  return { run, resize, dispose, state };
}

if (typeof document !== 'undefined' && typeof navigator !== 'undefined') {
  const controller = createGraphicsController({
    doc: document, nav: navigator, win: window,
    textureUsage: typeof GPUTextureUsage === 'undefined' ? {} : GPUTextureUsage,
    bufferUsage: typeof GPUBufferUsage === 'undefined' ? {} : GPUBufferUsage,
    mapMode: typeof GPUMapMode === 'undefined' ? {} : GPUMapMode
  });
  window.__nsmbGpuLabState = controller.state;
  void controller.run();
}
