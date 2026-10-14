// W07: deterministic synthetic guest-function shape, not translated game code.
// Linked together with W04's bounded sparse guest memory in one Wasm module.
#include <cstdint>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define W07_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define W07_EXPORT
#endif
extern "C" {
uint32_t nsmbw_mem_read32(uint32_t guestAddress);
int nsmbw_mem_write32(uint32_t guestAddress, uint32_t value);
int nsmbw_mem_error(void);
void nsmbw_mem_reset(void);
}

namespace {
uint32_t interopStatus = 0;
constexpr uint32_t kMmioBegin = 0xCC000000u;
constexpr uint32_t kMmioEnd = 0xCE000000u;

// Stable synthetic status ABI: 0 OK, 1 unmapped, 2 32-bit address overflow,
// 3 guest-page quota/allocation, 4 unsupported guest device policy (MMIO/GX).
uint32_t statusForAddress(uint32_t address) {
    const uint64_t endExclusive = static_cast<uint64_t>(address) + 4u;
    if (endExclusive > 0x100000000ull) return 2;
    if (static_cast<uint64_t>(address) < kMmioEnd && endExclusive > kMmioBegin) return 4;
    return 0;
}
uint32_t statusFromMemory(int code) {
    switch (code) {
        case 0: return 0;
        case 1: return 1;
        case 2: return 2;
        case 3: return 3;
        default: return 1; // Fail closed; never report unsupported errors as success.
    }
}
} // namespace

extern "C" {
// Represents a minimal translated-style guest action:
//     destinationGuest[0..3] = sourceGuest[0..3] + addend modulo 2^32.
// No native pointers, no original Mario functions or Wii OS devices.
uint32_t W07_EXPORT nsmbw_interop_step(uint32_t sourceGuest,
                                     uint32_t destinationGuest,
                                     uint32_t addend) {
    interopStatus = 0;
    // Only guest addresses cross this C interface. Check device policy first.
    // A device write must never be silently treated as ordinary guest RAM.
    if ((interopStatus = statusForAddress(sourceGuest)) != 0) return 0;
    if ((interopStatus = statusForAddress(destinationGuest)) != 0) return 0;

    const uint32_t value = nsmbw_mem_read32(sourceGuest);
    interopStatus = statusFromMemory(nsmbw_mem_error());
    if (interopStatus != 0) return 0; // Zero from a successful read IS valid data.

    const uint32_t result = value + addend; // C++ unsigned overflow wraps modulo 2^32.
    if (!nsmbw_mem_write32(destinationGuest, result)) {
        interopStatus = statusFromMemory(nsmbw_mem_error());
        if (interopStatus == 0) interopStatus = 1; // Unexpected backend failure, fail closed.
        return 0;
    }
    interopStatus = statusFromMemory(nsmbw_mem_error());
    return interopStatus == 0 ? 1u : 0u;
}
uint32_t W07_EXPORT nsmbw_interop_status(void) { return interopStatus; }
void W07_EXPORT nsmbw_interop_reset(void) {
    nsmbw_mem_reset(); // W04 retains a host-selected page budget across reset.
    interopStatus = 0;
}
}
