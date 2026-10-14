#include "device_policy.hpp"

// Single-thread-only synthetic policy registry. No device callbacks are
// registered in the ordinary browser build. Test fixtures are separate.
namespace {
NSMBDevice::Callback mmioHandler = nullptr;
NSMBDevice::Callback fifoHandler = nullptr;
bool callbackActive = false;
bool callbackViolated = false;
constexpr uint64_t kGuestLimit = 0x100000000ull;
constexpr uint32_t kMmioStart = 0xCC000000u;
constexpr uint32_t kMmioEnd = 0xCE000000u;
constexpr uint32_t kFifoStart = 0xCC008000u;
constexpr uint32_t kFifoEnd = 0xCC008100u;
bool overlaps(uint64_t begin, uint64_t end, uint64_t a, uint64_t b) noexcept {
    return begin < b && end > a;
}
} // namespace

namespace NSMBDevice {
void install(Region region, Callback callback) noexcept {
    if (callbackActive) { callbackViolated = true; return; }
    if (region == Region::Mmio) mmioHandler = callback;
    if (region == Region::GxFifo) fifoHandler = callback;
}
void clear() noexcept {
    if (callbackActive) { callbackViolated = true; return; }
    mmioHandler = nullptr;
    fifoHandler = nullptr;
    callbackViolated = false;
}

uint32_t access(Operation operation, uint32_t address, uint32_t width,
                uint32_t input, uint32_t& output, bool* callbackInvoked) noexcept {
    output = 0;
    if (callbackInvoked) *callbackInvoked = false;
    if (callbackActive) {
        callbackViolated = true;
        return 6; // Recursive device dispatch not supported.
    }
    if (width != 1 && width != 2 && width != 4) return 6;
    const uint64_t begin = address;
    const uint64_t end = begin + width;
    if (end > kGuestLimit) return 2;
    if (!overlaps(begin, end, kMmioStart, kMmioEnd)) return 1;
    if (begin < kMmioStart || end > kMmioEnd) return 4;

    Callback callback = mmioHandler;
    Region region = Region::Mmio;
    if (overlaps(begin, end, kFifoStart, kFifoEnd)) {
        if (begin < kFifoStart || end > kFifoEnd) return 4;
        region = Region::GxFifo;
        callback = fifoHandler;
    }
    if (!callback) return 4;
    if (callbackInvoked) *callbackInvoked = true;

    // Even a rejected or malformed callback MAY already have caused a device
    // side effect. The host must never blindly replay this operation.
    callbackActive = true;
    callbackViolated = false;
    const Reply reply = callback(region, operation, address, width, input);
    callbackActive = false;
    if (callbackViolated) { callbackViolated = false; return 6; }
    switch (reply.status) {
      case Result::Ok:
        output = reply.value & (width == 1 ? 0xFFu : width == 2 ? 0xFFFFu : 0xFFFFFFFFu);
        return 0;
      case Result::Unhandled: return 4;
      case Result::Rejected: return 5;
      default: return 6;
    }
}
} // namespace NSMBDevice
