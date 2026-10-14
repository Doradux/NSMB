// Synthetic nested C++ call-stack unwinding test using Emscripten Asyncify.
// One suspended async call; NOT a concurrent HostContext fiber replacement.
#include <cstdint>
#include <emscripten/emscripten.h>
namespace {
uint32_t phase = 0;
uint32_t deep(uint32_t value) {
  volatile uint32_t preserved = value + 7u;
  ++phase;
  emscripten_sleep(1); // unwind Wasm to JS, resume after timer without blocking UI
  ++phase;
  return preserved * 3u + phase;
}
uint32_t middle(uint32_t value) { return deep(value * 2u); }
}
extern "C" {
void EMSCRIPTEN_KEEPALIVE nsmbw_async_reset() { phase = 0; }
uint32_t EMSCRIPTEN_KEEPALIVE nsmbw_async_phase() { return phase; }
uint32_t EMSCRIPTEN_KEEPALIVE nsmbw_async_nested_probe(uint32_t seed) {
  return middle(seed);
}
}
