import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import createProbe from '../dist/asyncify_probe.mjs';
const wasm = fileURLToPath(new URL('../dist/asyncify_probe.wasm', import.meta.url));
test('Asyncify preserves nested C++ local and call stack across browser-like timer yield', async () => {
  const instance = await createProbe({ locateFile: () => wasm });
  instance._nsmbw_async_reset();
  const started = instance.ccall('nsmbw_async_nested_probe','number',['number'],[10],{async:true});
  assert.equal(instance._nsmbw_async_phase(),1,'entered nested C++ function before yielding');
  const result = await started;
  assert.equal(result,83,'nested volatile local 27 survived unwind/resume');
  assert.equal(instance._nsmbw_async_phase(),2,'resumed after the delay');
});
