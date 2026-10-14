/* W02: Browser GPU platform feasibility only; no game code or assets. */
const gpuCanvas = document.getElementById('gpu-canvas');
const fallbackCanvas = document.getElementById('canvas2d');
const stage = document.getElementById('stage');
const result = document.getElementById('result');
const diagnostics = document.getElementById('diagnostics');
const rerun = document.getElementById('rerun');
const state = { mode: 'pending', result: 'pending', reason: '', width: 0, height: 0, checkedPixel: null };
let device = null;
let context = null;
let gpuLost = false;

function withTimeout(promise, step, timeoutMs = 4500) {
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(step + ' timed out')), timeoutMs);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timeout));
}

function setState(mode, outcome, reason, sample) {
  Object.assign(state, { mode, result: outcome, reason, checkedPixel: sample ?? null });
  result.dataset.mode = mode;
  result.dataset.result = outcome;
  result.textContent = (outcome === 'passed' ? 'PASS' : outcome === 'failed' ? 'FAIL' : 'CHECKING') +
    ' — ' + mode + ': ' + reason;
  diagnostics.textContent = JSON.stringify({
    webgpuApi: typeof navigator.gpu !== 'undefined',
    secureContext: window.isSecureContext,
    ...state
  }, null, 2);
}

function sizeCanvases() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.min(1920, Math.round(stage.clientWidth * ratio)));
  const height = Math.max(1, Math.round(width * 9 / 16));
  for (const canvas of [gpuCanvas, fallbackCanvas]) {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }
  state.width = width;
  state.height = height;
}

function draw2D(reason) {
  gpuCanvas.hidden = true;
  fallbackCanvas.hidden = false;
  sizeCanvases();
  const ctx = fallbackCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    setState('canvas2d', 'failed', '2D canvas context unavailable');
    return;
  }
  ctx.fillStyle = '#1c6da8';
  ctx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(Math.round(fallbackCanvas.width / 4), Math.round(fallbackCanvas.height / 4),
               Math.round(fallbackCanvas.width / 2), Math.round(fallbackCanvas.height / 2));
  const sample = Array.from(ctx.getImageData(0, 0, 1, 1).data);
  const valid = sample[0] === 28 && sample[1] === 109 && sample[2] === 168 && sample[3] === 255;
  setState('canvas2d', valid ? 'passed' : 'failed',
           (valid ? '2D draw and pixel readback verified' : '2D readback did not match the expected color') +
             (reason ? ' (WebGPU: ' + reason + ')' : ''), sample);
}

async function readBackWebGpu(gpu) {
  const expected = [28, 109, 168, 255];
  const color = { r: expected[0] / 255, g: expected[1] / 255, b: expected[2] / 255, a: 1 };
  const probe = gpu.createTexture({
    size: [1, 1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
  });
  const buffer = gpu.createBuffer({
    size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });
  try {
    const encoder = gpu.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [{
      view: probe.createView(), loadOp: 'clear', storeOp: 'store', clearValue: color
    }] });
    pass.end();
    encoder.copyTextureToBuffer(
      { texture: probe }, { buffer, bytesPerRow: 256 }, [1, 1, 1]
    );
    gpu.queue.submit([encoder.finish()]);
    await withTimeout(buffer.mapAsync(GPUMapMode.READ), 'GPU buffer mapping');
    const sample = Array.from(new Uint8Array(buffer.getMappedRange()).subarray(0, 4));
    buffer.unmap();
    const ok = sample.every((value, i) => Math.abs(value - expected[i]) <= 1);
    if (!ok) throw new Error('GPU pixel mismatch: ' + sample.join(','));
    return sample;
  } finally {
    buffer.destroy();
    probe.destroy();
  }
}

function drawWebGpu() {
  sizeCanvases();
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({ colorAttachments: [{
    view: context.getCurrentTexture().createView(),
    clearValue: { r: 28 / 255, g: 109 / 255, b: 168 / 255, a: 1 },
    loadOp: 'clear', storeOp: 'store'
  }] });
  pass.end();
  device.queue.submit([encoder.finish()]);
}

async function testRenderer() {
  setState('initializing', 'pending', 'Requesting a browser rendering device');
  if (!navigator.gpu || !window.isSecureContext) {
    draw2D(!window.isSecureContext ? 'secure context required' : 'API unavailable');
    return;
  }
  try {
    if (!device || gpuLost) {
      const adapter = await withTimeout(navigator.gpu.requestAdapter(), 'GPU adapter discovery');
      if (!adapter) throw new Error('no compatible GPU adapter');
      device = await withTimeout(adapter.requestDevice(), 'GPU device request');
      gpuLost = false;
      device.lost.then(info => {
        gpuLost = true;
        draw2D('GPU device lost: ' + info.message);
      });
      context = gpuCanvas.getContext('webgpu');
      if (!context) throw new Error('no WebGPU canvas context');
      context.configure({
        device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque'
      });
    }
    const sample = await readBackWebGpu(device);
    fallbackCanvas.hidden = true;
    gpuCanvas.hidden = false;
    drawWebGpu();
    await withTimeout(device.queue.onSubmittedWorkDone(), 'GPU queue submission');
    setState('webgpu', 'passed', 'WebGPU presentation and 1×1 render-pass GPU readback verified', sample);
  } catch (error) {
    draw2D(error instanceof Error ? error.message : String(error));
  }
}

window.__nsmbGpuLabState = state; // inspection by browser smoke tests only
rerun.addEventListener('click', () => { void testRenderer(); });
window.addEventListener('resize', () => {
  if (state.mode === 'webgpu' && !gpuLost) drawWebGpu();
  else if (state.mode === 'canvas2d') draw2D(state.reason.includes('WebGPU:') ? 'still in fallback mode' : '');
});
void testRenderer();
