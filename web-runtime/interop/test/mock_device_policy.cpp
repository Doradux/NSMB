// Test-only synthetic device fixture. It must NEVER ship in normal Wasm.
#include "../device_policy.hpp"
#include <array>
#include <cstdint>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif
extern "C" { uint32_t nsmbw_interop_read32(uint32_t guest); }
namespace {
uint32_t calls = 0, lastAddress = 0, lastValue = 0, lastWidth = 0, lastRegion = 0;
uint32_t rejection = 0;
constexpr uint32_t kLogCap = 64;
std::array<uint32_t, kLogCap> events{};
uint32_t eventCount = 0, eventDropped = 0;
NSMBDevice::Reply handler(NSMBDevice::Region region, NSMBDevice::Operation operation,
                           uint32_t guest, uint32_t width, uint32_t value) noexcept {
    ++calls;
    lastAddress = guest; lastValue = value; lastWidth = width;
    lastRegion = static_cast<uint32_t>(region);
    const uint32_t event = (lastRegion << 16u) |
        (static_cast<uint32_t>(operation) << 8u) | width;
    if (eventCount < kLogCap) events[eventCount++] = event;
    else ++eventDropped;
    if (rejection == 1 || rejection == 6) return {NSMBDevice::Result::Rejected, 0};
    if (rejection == 2) return {static_cast<NSMBDevice::Result>(99), 0};
    if (rejection == 3) return {NSMBDevice::Result::Unhandled, 0};
    if (rejection == 4) {
        (void)nsmbw_interop_read32(guest); // illegal nested dispatch; must return code 6
        return {NSMBDevice::Result::Ok, 0xABCD};
    }
    if (rejection == 5) {
        NSMBDevice::clear(); // illegal callback registry mutation mid-access
        return {NSMBDevice::Result::Ok, 0xABCD};
    }
    if (operation == NSMBDevice::Operation::Read)
        return {NSMBDevice::Result::Ok, 0x12345678u};
    return {NSMBDevice::Result::Ok, 0};
}
}
extern "C" {
void EXPORT nsmbw_test_policy_install(uint32_t mask) {
    calls = 0; rejection = 0; eventCount = 0; eventDropped = 0; events = {};
    NSMBDevice::install(NSMBDevice::Region::Mmio, mask & 1 ? handler : nullptr);
    NSMBDevice::install(NSMBDevice::Region::GxFifo, mask & 2 ? handler : nullptr);
}
void EXPORT nsmbw_test_policy_rejection(uint32_t code) { rejection = code; }
uint32_t EXPORT nsmbw_test_policy_calls() { return calls; }
uint32_t EXPORT nsmbw_test_policy_last_address() { return lastAddress; }
uint32_t EXPORT nsmbw_test_policy_last_value() { return lastValue; }
uint32_t EXPORT nsmbw_test_policy_last_width() { return lastWidth; }
uint32_t EXPORT nsmbw_test_policy_last_region() { return lastRegion; }
uint32_t EXPORT nsmbw_test_policy_events() { return eventCount; }
uint32_t EXPORT nsmbw_test_policy_event_at(uint32_t index) {
    return index < eventCount ? events[index] : 0;
}
uint32_t EXPORT nsmbw_test_policy_dropped() { return eventDropped; }
}
