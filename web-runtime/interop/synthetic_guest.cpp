// W07 Phase 2: checked synthetic guest calls + typed, explicit C++ device policy.
// No translated Nintendo code, native host pointers in JS, or Wii OS emulation.
#include "device_policy.hpp"
#include <cstdint>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define W07_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define W07_EXPORT
#endif
extern "C" {
uint32_t nsmbw_mem_read8(uint32_t guest);
uint32_t nsmbw_mem_read16(uint32_t guest);
uint32_t nsmbw_mem_read32(uint32_t guest);
int nsmbw_mem_write8(uint32_t guest, uint32_t value);
int nsmbw_mem_write16(uint32_t guest, uint32_t value);
int nsmbw_mem_write32(uint32_t guest, uint32_t value);
int nsmbw_mem_error(void);
void nsmbw_mem_reset(void);
}

namespace {
uint32_t interopStatus = 0;
// Preserve legacy W07 status ABI: 0 OK, 1 unmapped, 2 wrap,
// 3 page quota/OOM, 4 unavailable MMIO/GX. New: 5 handler rejected,
// 6 malformed handler response/invalid scalar width.
constexpr uint32_t kMmioBegin = 0xCC000000u;
constexpr uint32_t kMmioEnd = 0xCE000000u;
bool overlapsDevice(uint32_t address, uint32_t width) noexcept {
    const uint64_t begin = address;
    const uint64_t end = begin + width;
    return begin < kMmioEnd && end > kMmioBegin;
}
uint32_t precheck(uint32_t address, uint32_t width) noexcept {
    if (width != 1 && width != 2 && width != 4) return 6;
    return static_cast<uint64_t>(address) + width > 0x100000000ull ? 2u : 0u;
}
uint32_t statusFromMemory(int code) noexcept {
    switch (code) {
      case 0: return 0;
      case 1: return 1;
      case 2: return 2;
      case 3: return 3;
      default: return 1; // unknown W04 errors fail closed
    }
}
uint32_t readChecked(uint32_t address, uint32_t width) {
    interopStatus = precheck(address, width);
    if (interopStatus != 0) return 0;
    if (overlapsDevice(address, width)) {
        uint32_t output = 0;
        interopStatus = NSMBDevice::access(NSMBDevice::Operation::Read, address, width, 0, output);
        return interopStatus == 0 ? output : 0;
    }
    uint32_t data = 0;
    if (width == 1) data = nsmbw_mem_read8(address);
    if (width == 2) data = nsmbw_mem_read16(address);
    if (width == 4) data = nsmbw_mem_read32(address);
    interopStatus = statusFromMemory(nsmbw_mem_error());
    return interopStatus == 0 ? data : 0;
}
uint32_t writeChecked(uint32_t address, uint32_t width, uint32_t value) {
    interopStatus = precheck(address, width);
    if (interopStatus != 0) return 0;
    if (overlapsDevice(address, width)) {
        uint32_t ignored = 0;
        interopStatus = NSMBDevice::access(NSMBDevice::Operation::Write,
                                           address, width, value, ignored);
        return interopStatus == 0 ? 1u : 0u;
    }
    int ok = 0;
    if (width == 1) ok = nsmbw_mem_write8(address, value);
    if (width == 2) ok = nsmbw_mem_write16(address, value);
    if (width == 4) ok = nsmbw_mem_write32(address, value);
    interopStatus = statusFromMemory(nsmbw_mem_error());
    if (!ok && interopStatus == 0) interopStatus = 1;
    return ok && interopStatus == 0 ? 1u : 0u;
}
} // namespace

extern "C" {
uint32_t W07_EXPORT nsmbw_interop_read8(uint32_t a) { return readChecked(a, 1); }
uint32_t W07_EXPORT nsmbw_interop_read16(uint32_t a) { return readChecked(a, 2); }
uint32_t W07_EXPORT nsmbw_interop_read32(uint32_t a) { return readChecked(a, 4); }
uint32_t W07_EXPORT nsmbw_interop_write8(uint32_t a, uint32_t v) { return writeChecked(a, 1, v); }
uint32_t W07_EXPORT nsmbw_interop_write16(uint32_t a, uint32_t v) { return writeChecked(a, 2, v); }
uint32_t W07_EXPORT nsmbw_interop_write32(uint32_t a, uint32_t v) { return writeChecked(a, 4, v); }
uint32_t W07_EXPORT nsmbw_interop_step(uint32_t sourceGuest,
                                        uint32_t destinationGuest,
                                        uint32_t addend) {
    // Preserve W07 scheduler ABI and status codes, but route device addresses
    // through a typed callback, never into ordinary W04 RAM.
    interopStatus = precheck(sourceGuest, 4);
    if (interopStatus != 0) return 0;
    interopStatus = precheck(destinationGuest, 4);
    if (interopStatus != 0) return 0;
    const uint32_t input = readChecked(sourceGuest, 4);
    if (interopStatus != 0) return 0; // zero read value is NOT an error
    // Unsigned C++ arithmetic wraps modulo 2^32.
    return writeChecked(destinationGuest, 4, input + addend);
}
uint32_t W07_EXPORT nsmbw_interop_status(void) { return interopStatus; }
void W07_EXPORT nsmbw_interop_reset(void) {
    nsmbw_mem_reset();
    NSMBDevice::clear(); // bound callbacks never outlive reset
    interopStatus = 0;
}
}
