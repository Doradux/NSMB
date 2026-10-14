// Test-only synthetic device fixture linked into a separate test Wasm module.
// Never linked into normal production/diagnostic checked_interop.wasm.
#include "../device_policy.hpp"
#include <cstdint>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif
namespace {
uint32_t calls = 0, lastAddress = 0, lastValue = 0, lastWidth = 0, lastRegion = 0;
uint32_t rejection = 0;
NSMBDevice::Reply handler(NSMBDevice::Region region, NSMBDevice::Operation operation,
                           uint32_t guest, uint32_t width, uint32_t value) noexcept {
    calls++;
    lastAddress = guest; lastValue = value; lastWidth = width;
    lastRegion = static_cast<uint32_t>(region);
    if (rejection == 1) return {NSMBDevice::Result::Rejected, 0};
    if (rejection == 2) return {static_cast<NSMBDevice::Result>(99), 0};
    if (rejection == 3) return {NSMBDevice::Result::Unhandled, 0};
    if (operation == NSMBDevice::Operation::Read) return {NSMBDevice::Result::Ok, 0x12345678u};
    return {NSMBDevice::Result::Ok, 0};
}
}
extern "C" {
void EXPORT nsmbw_test_policy_install(uint32_t mask) {
    calls = 0; rejection = 0;
    NSMBDevice::install(NSMBDevice::Region::Mmio, mask & 1 ? handler : nullptr);
    NSMBDevice::install(NSMBDevice::Region::GxFifo, mask & 2 ? handler : nullptr);
}
void EXPORT nsmbw_test_policy_rejection(uint32_t code) { rejection = code; }
uint32_t EXPORT nsmbw_test_policy_calls() { return calls; }
uint32_t EXPORT nsmbw_test_policy_last_address() { return lastAddress; }
uint32_t EXPORT nsmbw_test_policy_last_value() { return lastValue; }
uint32_t EXPORT nsmbw_test_policy_last_width() { return lastWidth; }
uint32_t EXPORT nsmbw_test_policy_last_region() { return lastRegion; }
}
