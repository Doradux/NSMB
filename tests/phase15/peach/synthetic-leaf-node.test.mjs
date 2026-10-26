// Phase15 Peach — already-compiled public synthetic Wasm, not rebuilt here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PINNED_WASM_SHA256, verifyPinnedWasmBytes, exerciseTranslatedCpuContext,
  exerciseTranslatedCheckedMemory, exerciseUnsupportedCpuFeatures
} from '../../../web-runtime/frame-host/phase15-leaf-evidence.mjs';
import createCpu from '../../../web-runtime/frame-host/dist/frame_loop_translated_fixture.mjs';
import createRam from '../../../web-runtime/frame-host/dist/frame_loop_translated_readwrite_fixture.mjs';
import createNormal from '../../../web-runtime/frame-host/dist/frame_loop.mjs';

const base = new URL('../../../web-runtime/frame-host/dist/', import.meta.url);
const bytes = name => readFile(new URL(name + '.wasm', base));
const build = async (factory, name) => factory({
  locateFile: () => fileURLToPath(new URL(name + '.wasm', base))
});

test('pinned compiled synthetic Wasm SHA256, WebAssembly.validate and minimal ABI imports', async () => {
  const digests = await verifyPinnedWasmBytes(bytes);
  assert.deepEqual(digests, PINNED_WASM_SHA256);
  for (const [name, expected] of Object.entries(PINNED_WASM_SHA256))
    assert.equal(createHash('sha256').update(await bytes(name)).digest('hex'), expected);
});
test('actual compiled translator synthetic CpuContext leaf: GPR, PC, LR, SP, ABI, isolation, 48 resets', async () => {
  const module = await build(createCpu, 'frame_loop_translated_fixture');
  assert.deepEqual(exerciseTranslatedCpuContext(module),
    {contexts:3, resetCycles:48, cpuLayoutBytes:464, translatedInvocations:3});
});
test('actual compiled translated STW/LWZ/STW: checked RAM forwarding, late quota and MMIO rollback', async () => {
  const module = await build(createRam, 'frame_loop_translated_readwrite_fixture');
  assert.deepEqual(exerciseTranslatedCheckedMemory(module),
    {forwarded:true, quotaRollback:true, mmioRejected:true});
});
test('production-shaped compiled CpuContext denies FPR/GQR/unknown features before allocation', async () => {
  const module = await build(createNormal, 'frame_loop');
  assert.deepEqual(exerciseUnsupportedCpuFeatures(module),
    {unsupportedMasks:6, mutationBeforeReject:false});
});
