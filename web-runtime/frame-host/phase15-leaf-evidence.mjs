// Phase15 Peach: shared Node/Chromium contract over *already-committed* synthetic
// WebAssembly. Never use a real Nintendo function or claim these binaries rebuilt.
export const PINNED_WASM_SHA256 = Object.freeze({
  frame_loop: '32d4313e0ab8c27a6146d132492bd2f773fdb7c817534d2d4fb54e5fc6d185a1',
  frame_loop_translated_fixture: '7222c2e5bbd0174ce914d717c7a1b3f0d8b78d5382f21264796d573287516ba8',
  frame_loop_translated_readwrite_fixture: '61ab14a6a1c0d3eb9730671563d465b5481d720f9d8b6437bf822b2cdea5bf2c'
});
const assert = (ok, msg) => { if (!ok) throw Error('Phase15 synthetic ABI: ' + msg); };
const equal = (actual, expected, label) =>
  assert(actual === expected, label + ': expected ' + expected + ', actual ' + actual);
const call = (module, name, ...args) => {
  const fn = module['_nsmbw_' + name];
  assert(typeof fn === 'function', 'missing compiled C ABI export ' + name);
  return fn(...args);
};
const u32 = x => x >>> 0;
const LAYOUT = [464, 8, 0, 128, 132, 136, 140, 144, 148, 152, 408, 440, 460];

export async function verifyPinnedWasmBytes(getBytes) {
  const actual = {};
  for (const [name, expected] of Object.entries(PINNED_WASM_SHA256)) {
    const data = await getBytes(name);
    assert(WebAssembly.validate(data), 'invalid real Wasm bytes: ' + name);
    const compiled = new WebAssembly.Module(data);
    const imports = WebAssembly.Module.imports(compiled);
    assert(imports.length === 1 && imports[0].module === 'env' &&
      imports[0].name === 'emscripten_resize_heap' && imports[0].kind === 'function',
      name + ' unexpected native imports');
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    equal(hash, expected, name + ' pinned binary SHA-256');
    actual[name] = hash;
  }
  return actual;
}

export function exerciseTranslatedCpuContext(module) {
  call(module, 'loop_reset');
  for (let i = 0; i < LAYOUT.length; i++)
    equal(u32(call(module, 'loop_cpu_abi_layout', i)), LAYOUT[i], 'CpuContext layout ' + i);
  equal(u32(call(module, 'loop_cpu_abi_layout', 13)), 0xFFFFFFFF, 'unknown layout field');
  for (const stack of [0, 0x80005004, 0xCC008010]) {
    equal(call(module, 'loop_translated_spawn', 1, stack, 1, 0, 0), 0, 'reject malformed stack');
    equal(call(module, 'loop_state', 1), 0, 'reject before allocation');
    equal(call(module, 'mem_pages'), 0, 'reject before guest pages');
  }
  const starts = [0xFFFFFFFF, 0, 0x7FFFFFFF];
  for (let id = 1; id <= 3; id++) {
    equal(call(module, 'loop_translated_spawn', id, 0x80005010 + id * 0x1000,
      starts[id - 1], 0x81002000 + id, 0x81003000 + id), 1, 'valid translated spawn ' + id);
    equal(u32(call(module, 'loop_pc', id)), 0x80001000, 'pre-execution PC ' + id);
  }
  equal(call(module, 'loop_frame', 3), 3, 'bounded round robin 3 contexts');
  for (let id = 1; id <= 3; id++) {
    equal(u32(call(module, 'loop_cpu_gpr', id, 3)), u32(starts[id - 1] + 1), 'translated GPR3 ' + id);
    equal(u32(call(module, 'loop_pc', id)), 0x8001FFF0, 'translated return PC ' + id);
    equal(u32(call(module, 'loop_cpu_lr', id)), 0x8001FFF0, 'translated LR ' + id);
    equal(u32(call(module, 'loop_cpu_gpr', id, 1)), 0x80005010 + id * 0x1000, 'restored stack ' + id);
    equal(u32(call(module, 'loop_cpu_gpr', id, 2)), 0x81002000 + id, 'r2 SDA2 ' + id);
    equal(u32(call(module, 'loop_cpu_gpr', id, 13)), 0x81003000 + id, 'r13 SDA ' + id);
    equal(call(module, 'loop_state', id), 3, 'DONE translated ' + id);
    equal(call(module, 'loop_cpu_steps', id), 1, 'one Wasm invocation per translated leaf ' + id);
  }
  equal(call(module, 'mem_pages'), 0, 'register-only leaf must not allocate guest RAM');
  for (let i = 0; i < 48; i++) {
    call(module, 'loop_reset');
    equal(call(module, 'loop_state', 1), 0, 'reset guest state ' + i);
    equal(call(module, 'loop_cpu_gpr', 1, 3), 0, 'reset GPR3 ' + i);
    equal(call(module, 'mem_pages'), 0, 'reset pages ' + i);
    equal(call(module, 'loop_translated_spawn', 1, 0x80005010, i, 0, 0), 1, 'restart ' + i);
    equal(call(module, 'loop_frame', 1), 1, 'tick ' + i);
    equal(call(module, 'loop_cpu_gpr', 1, 3), i + 1, 'fresh context state ' + i);
  }
  return {contexts: 3, resetCycles: 48, cpuLayoutBytes: 464, translatedInvocations: 3};
}

export function exerciseTranslatedCheckedMemory(module) {
  call(module, 'loop_reset');
  equal(call(module, 'mem_write32', 0x80010000, 0xAABBCCDD), 1, 'seed RAM');
  equal(call(module, 'loop_translated_store_spawn', 1, 0x80005010,
    0xC0010000, 0x80011000, 0x01020304, 0, 0), 1, 'translated memory spawn');
  equal(call(module, 'loop_frame', 1), 1, 'execute translated memory leaf');
  equal(call(module, 'loop_state', 1), 3, 'memory leaf complete');
  equal(u32(call(module, 'loop_cpu_gpr', 1, 5)), 0x01020304, 'LWZ observes staged STW');
  equal(u32(call(module, 'mem_read32', 0x80010000)), 0x01020304, 'committed aliased RAM');
  equal(u32(call(module, 'mem_read32', 0xC0011000)), 0x01020304, 'committed second word');
  equal(u32(call(module, 'loop_pc', 1)), 0x8001FFF0, 'memory leaf returns via LR');

  call(module, 'loop_reset');
  equal(call(module, 'mem_set_page_budget', 1), 1, 'set hard sparse quota');
  equal(call(module, 'loop_translated_store_spawn', 1, 0x80005010,
    0x80010000, 0x80011000, 0x11223344, 0, 0), 1, 'quota spawn');
  equal(call(module, 'loop_frame', 1), 1, 'quota fault step');
  equal(call(module, 'loop_state', 1), 4, 'quota must fault');
  equal(call(module, 'loop_guest_error', 1), 3, 'quota error code');
  equal(u32(call(module, 'loop_pc', 1)), 0x80001000, 'quota leaves entry PC');
  equal(call(module, 'loop_cpu_gpr', 1, 5), 0, 'no speculative LWZ');
  equal(call(module, 'mem_pages'), 0, 'no journal ghost pages');
  equal(call(module, 'mem_read32', 0x80010000), 0, 'rollback RAM first');
  equal(call(module, 'mem_read32', 0x80011000), 0, 'rollback RAM second');

  call(module, 'loop_reset');
  equal(call(module, 'loop_translated_store_spawn', 1, 0x80005010,
    0x80010000, 0xCC008000, 0x55667788, 0, 0), 1, 'MMIO denial spawn');
  equal(call(module, 'loop_frame', 1), 1, 'MMIO failure step');
  equal(call(module, 'loop_state', 1), 4, 'MMIO must fault');
  equal(call(module, 'loop_guest_error', 1), 7, 'source-specific MMIO denial');
  equal(u32(call(module, 'loop_pc', 1)), 0x80001000, 'MMIO leaves guest PC');
  equal(call(module, 'interop_device_invoked'), 0, 'no fake device callbacks');
  equal(call(module, 'loop_retry_quota', 1), 0, 'never replay device failure');
  equal(call(module, 'mem_pages'), 0, 'no device side-effect pages');
  return {forwarded: true, quotaRollback: true, mmioRejected: true};
}

export function exerciseUnsupportedCpuFeatures(module) {
  call(module, 'loop_reset');
  for (const feature of [1, 2, 4, 3, 7, 0x80000000]) {
    equal(call(module, 'loop_cpu_spawn_abi', 1, 0x80010000, 0x80005010,
      0x80004000, 0x80009000, 1, 0, 0, feature), 0,
      'FPR/paired/GQR/unknown rejected before guest mutation: ' + feature);
    equal(call(module, 'loop_error'), 8, 'unsupported feature status');
    equal(call(module, 'loop_state', 1), 0, 'unsupported feature no context');
    equal(call(module, 'mem_pages'), 0, 'unsupported feature no guest allocation');
  }
  assert(module._nsmbw_test_policy_install === undefined, 'normal binary must not expose mock device handlers');
  assert(module._nsmbw_loop_translated_spawn === undefined, 'normal binary must not contain test translated leaf');
  return {unsupportedMasks: 6, mutationBeforeReject: false};
}
