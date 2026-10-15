// Phase5 public synthetic host tick snapshot. NOT OSGetTime/OSGetTick HLE.
// A single checked 32-bit guest RAM write; no wall-clock, IRQ or MMIO callback.
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
}
namespace {
uint32_t serviceStatus=0;
bool guestRamWord(uint32_t address) noexcept {
    if((address & 3u) != 0u || (address & 0xC0000000u) == 0x40000000u) return false;
    const uint32_t physical=address & 0x3FFFFFFFu;
    return physical <= 0x017FFFFCu ||
           (physical >= 0x10000000u && physical <= 0x17FFFFFCu);
}
}
extern "C" {
// This is only the LOW 32-bit virtual-tick snapshot, not an authentic 64-bit
// PowerPC timebase read, OSGetSystemTime or any SDA/interrupt/fiber service.
// The caller owns the full 64-bit monotonic timebase and advance policy.
uint32_t EXPORT nsmbw_services_tick_store32(uint32_t guestAddress,uint32_t lowTicks) {
    serviceStatus=0;
    if(!guestRamWord(guestAddress)){serviceStatus=7u;return 0;}
    const uint32_t ok=nsmbw_interop_write32(guestAddress,lowTicks);
    serviceStatus=nsmbw_interop_status();
    if(ok!=1u || serviceStatus!=0u) {
        if(serviceStatus==0u)serviceStatus=1u;
        return 0;
    }
    return 1;
}
uint32_t EXPORT nsmbw_services_tick_status() {return serviceStatus;}
void EXPORT nsmbw_services_tick_status_reset() {serviceStatus=0;}
}
