// Phase3 synthetic RuntimeServices input snapshot: one checked guest RAM word.
// NOT native Wii controller/IOS, no Gamepad access and no Nintendo data.
#include <cstdint>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif
extern "C" {
uint32_t nsmbw_interop_write32(uint32_t address, uint32_t value);
uint32_t nsmbw_interop_status();
uint32_t nsmbw_mem_read32(uint32_t address);
int nsmbw_mem_error();
}
namespace {
uint32_t lastStatus = 0;
bool ordinaryGuestRam(uint32_t address) {
    if ((address & 3u) != 0u) return false;
    if ((address & 0xC0000000u) == 0x40000000u) return false;
    const uint32_t physical = address & 0x3FFFFFFFu;
    return physical <= 0x017FFFFCu ||
           (physical >= 0x10000000u && physical <= 0x17FFFFFCu);
}
} // namespace

extern "C" {
// Schema v1, one 32-bit big-endian guest-memory store:
// [seq:u8][Y:i8][X:i8][buttons:u8] in native PowerPC memory byte order.
// buttons <=0xFF, each axis -127..127, sequence <=255.
// 7 is a service-specific invalid-input/alignment status; 0..6 keep W07 meanings.
uint32_t EXPORT nsmbw_services_input_store(uint32_t guestAddress,
                                            uint32_t buttons, int32_t axisX,
                                            int32_t axisY, uint32_t sequence) {
    lastStatus = 0;
    if (buttons > 255u || sequence > 255u ||
        axisX < -127 || axisX > 127 || axisY < -127 || axisY > 127) {
        lastStatus = 7;
        return 0;
    }
    if (!ordinaryGuestRam(guestAddress)) {
        // Cannot write through MMIO/GX even if an HLE callback was installed.
        lastStatus = 7;
        return 0;
    }
    const uint32_t packet = (sequence << 24u) |
        ((static_cast<uint32_t>(axisY) & 255u) << 16u) |
        ((static_cast<uint32_t>(axisX) & 255u) << 8u) |
        buttons;
    const uint32_t success = nsmbw_interop_write32(guestAddress, packet);
    lastStatus = nsmbw_interop_status();
    if (!success && lastStatus == 0) lastStatus = 1;
    return success && lastStatus == 0 ? 1u : 0u;
}
uint32_t EXPORT nsmbw_services_input_status() { return lastStatus; }
// Does not reset W04 RAM or W07 callbacks; host owns guest lifetime.
void EXPORT nsmbw_services_input_status_reset() { lastStatus = 0; }
}
