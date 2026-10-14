import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphicsController } from '../gpu-lab.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

function fixture(gpu, { timeoutMs = 60, pixel = [28, 109, 168, 255] } = {}) {
  const listeners = {};
  const calls = { webgpuDraws: 0, canvasDraws: 0, deviceDestroyed: 0, bufferDestroyed: 0,
                  textureDestroyed: 0, unconfigured: 0 };
  const ctx2d = {
    fillStyle: '',
    fillRect() { calls.canvasDraws++; },
    getImageData() { return { data: Uint8Array.from(pixel) }; }
  };
  const webgpuContext = {
    configure() {},
    unconfigure() { calls.unconfigured++; },
    getCurrentTexture() { return { createView() { return {}; } }; }
  };
  const stage = { clientWidth: 600 };
  const gpuCanvas = { hidden: true, width: 0, height: 0, getContext: (type) =>
    type === 'webgpu' ? webgpuContext : null };
  const fallback = { hidden: false, width: 0, height: 0, getContext: (type) =>
    type === '2d' ? ctx2d : null };
  const status = { dataset: {}, textContent: '' };
  const diagnostics = { textContent: '' };
  const rerun = {
    addEventListener(name, fn) { listeners['button-' + name] = fn; },
    removeEventListener(name) { delete listeners['button-' + name]; }
  };
  const elements = {
    'gpu-canvas': gpuCanvas, canvas2d: fallback, stage, result: status,
    diagnostics, rerun
  };
  const win = {
    isSecureContext: true, devicePixelRatio: 1,
    addEventListener(name, fn) { listeners['win-' + name] = fn; },
    removeEventListener(name) { delete listeners['win-' + name]; }
  };
  const app = createGraphicsController({
    doc: { getElementById: id => elements[id] },
    nav: { gpu }, win, timeoutMs,
    textureUsage: { RENDER_ATTACHMENT: 1, COPY_SRC: 2 },
    bufferUsage: { COPY_DST: 4, MAP_READ: 8 },
    mapMode: { READ: 1 }
  });
  return { app, calls, status, diagnostics, fallback, gpuCanvas, listeners };
}

function makeDevice(pixel = [28, 109, 168, 255]) {
  const lost = deferred();
  const calls = { destroyed: 0, textures: 0, buffers: 0, queueSubmits: 0, unmapped: 0,
                  shaderModules: 0, pipelines: 0, triangleDraws: 0 };
  const device = {
    lost: lost.promise,
    destroy() { calls.destroyed++; },
    createShaderModule({ code }) {
      assert.match(code, /@vertex/);
      assert.match(code, /@fragment/);
      calls.shaderModules++;
      return {};
    },
    createRenderPipeline({ vertex, fragment }) {
      assert.equal(vertex.entryPoint, 'vs_main');
      assert.equal(fragment.entryPoint, 'fs_main');
      calls.pipelines++;
      return {};
    },
    createTexture() {
      return {
        createView() { return {}; },
        destroy() { calls.textures++; }
      };
    },
    createBuffer() {
      return {
        async mapAsync() {},
        getMappedRange() { return Uint8Array.from(pixel); },
        unmap() { calls.unmapped++; },
        destroy() { calls.buffers++; }
      };
    },
    createCommandEncoder() {
      return {
        beginRenderPass() { return {
          setPipeline() {}, draw(vertices) { assert.equal(vertices, 3); calls.triangleDraws++; }, end() {}
        }; },
        copyTextureToBuffer() {},
        finish() { return {}; }
      };
    },
    queue: {
      submit() { calls.queueSubmits++; },
      async onSubmittedWorkDone() {}
    }
  };
  return { device, lost, calls };
}

const browserGpu = (device) => ({
  requestAdapter: async () => ({
    requestDevice: async () => device
  }),
  getPreferredCanvasFormat: () => 'bgra8unorm'
});

test('W02: unsupported API reports Canvas PASS while WebGPU is UNAVAILABLE', async () => {
  const f = fixture(undefined);
  await f.app.run();
  assert.equal(f.app.state.mode, 'canvas2d');
  assert.equal(f.app.state.gpuStatus, 'unavailable');
  assert.equal(f.app.state.canvasStatus, 'passed');
  assert.match(f.status.textContent, /Canvas 2D only; WebGPU unavailable/);
  f.app.dispose();
});

test('W02: null adapter is unavailable, not successful WebGPU', async () => {
  const f = fixture({ requestAdapter: async () => null });
  await f.app.run();
  assert.equal(f.app.state.gpuStatus, 'unavailable');
  assert.equal(f.app.state.mode, 'canvas2d');
  f.app.dispose();
});

test('W02: mocked WebGPU render, readback, cleanup succeeds', async () => {
  const fake = makeDevice();
  const f = fixture(browserGpu(fake.device));
  await f.app.run();
  assert.equal(f.app.state.mode, 'webgpu');
  assert.equal(f.app.state.gpuStatus, 'verified');
  assert.deepEqual(f.app.state.checkedPixel, [28, 109, 168, 255]);
  assert.equal(fake.calls.queueSubmits, 2);
  assert.equal(fake.calls.shaderModules, 1);
  assert.equal(fake.calls.pipelines, 1);
  assert.equal(fake.calls.triangleDraws, 1);
  assert.equal(fake.calls.buffers, 1);
  assert.equal(fake.calls.textures, 1);
  assert.equal(fake.calls.unmapped, 1);
  f.app.dispose();
  assert.equal(fake.calls.destroyed, 1);
});

test('W02: readback mismatch does not claim WebGPU success', async () => {
  const fake = makeDevice([255, 0, 0, 255]);
  const f = fixture(browserGpu(fake.device));
  await f.app.run();
  assert.equal(f.app.state.gpuStatus, 'failed');
  assert.equal(f.app.state.canvasStatus, 'passed');
  assert.match(f.app.state.reason, /pixel mismatch/);
  assert.equal(fake.calls.destroyed, 1);
  f.app.dispose();
});

test('W02: adapter request timeout finishes without infinite CHECKING', async () => {
  const pending = deferred();
  const f = fixture({ requestAdapter: () => pending.promise }, { timeoutMs: 10 });
  await f.app.run();
  assert.equal(f.app.state.gpuStatus, 'timeout');
  assert.equal(f.app.state.mode, 'canvas2d');
  assert.equal(f.status.dataset.gpuStatus, 'timeout');
  pending.resolve(null);
  await Promise.resolve();
  assert.equal(f.app.state.gpuStatus, 'timeout');
  f.app.dispose();
});

test('W02: overlapping reruns cannot overwrite the latest WebGPU state', async () => {
  const firstAdapter = deferred();
  const fake = makeDevice();
  let calls = 0;
  const gpu = {
    requestAdapter() {
      return ++calls === 1 ? firstAdapter.promise : Promise.resolve({
        requestDevice: async () => fake.device
      });
    },
    getPreferredCanvasFormat: () => 'bgra8unorm'
  };
  const f = fixture(gpu);
  const old = f.app.run();
  await f.app.run();
  assert.equal(f.app.state.gpuStatus, 'verified');
  firstAdapter.resolve(null);
  await old;
  assert.equal(f.app.state.gpuStatus, 'verified');
  assert.equal(f.app.state.mode, 'webgpu');
  f.app.dispose();
});

test('W02: late GPU device is destroyed after superseding the request', async () => {
  const pendingDevice = deferred();
  const stale = makeDevice();
  let calls = 0;
  const gpu = {
    requestAdapter: async () => {
      calls++;
      return calls === 1 ? { requestDevice: () => pendingDevice.promise } : null;
    }
  };
  const f = fixture(gpu);
  const old = f.app.run();
  await new Promise(resolve => setImmediate(resolve));
  await f.app.run();
  assert.equal(f.app.state.gpuStatus, 'unavailable');
  pendingDevice.resolve(stale.device);
  await old;
  assert.equal(stale.calls.destroyed, 1);
  assert.equal(f.app.state.gpuStatus, 'unavailable');
  f.app.dispose();
});

test('W02: old device loss does not overwrite a newer successful rerun', async () => {
  const first = makeDevice(), second = makeDevice();
  let count = 0;
  const gpu = {
    requestAdapter: async () => ({
      requestDevice: async () => (++count === 1 ? first.device : second.device)
    }),
    getPreferredCanvasFormat: () => 'bgra8unorm'
  };
  const f = fixture(gpu);
  await f.app.run();
  await f.app.run();
  first.lost.resolve({ message: 'stale device' });
  await Promise.resolve();
  assert.equal(f.app.state.gpuStatus, 'verified');
  assert.equal(f.app.state.mode, 'webgpu');
  assert.equal(first.calls.destroyed, 1);
  f.app.dispose();
});

test('W02: current device loss falls back and never reports GPU verified', async () => {
  const fake = makeDevice();
  const f = fixture(browserGpu(fake.device));
  await f.app.run();
  fake.lost.resolve({ message: 'adapter reset' });
  await Promise.resolve();
  assert.equal(f.app.state.gpuStatus, 'lost');
  assert.equal(f.app.state.mode, 'canvas2d');
  assert.equal(f.app.state.canvasStatus, 'passed');
  f.app.resize();
  assert.equal(f.app.state.gpuStatus, 'lost');
  f.app.dispose();
});
