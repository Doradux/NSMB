// A single Asyncify wasm instance cannot safely unwind two overlapping stacks.
// Reject overlap synchronously before calling Emscripten ccall. No timed lock release.
export function createExclusiveAsyncifyCaller(instance) {
  if (typeof instance?.ccall !== 'function') throw new TypeError('Emscripten instance with ccall required');
  let busy = false;
  return Object.freeze({
    get busy() { return busy; },
    async call(name, returnType='number', argumentTypes=[], args=[]) {
      if (busy) throw new Error('Asyncify instance busy: overlapping calls rejected');
      busy = true;
      try {
        return await instance.ccall(name, returnType, argumentTypes, args, { async: true });
      } finally {
        busy = false; // only actual settlement permits the next continuation
      }
    }
  });
}
