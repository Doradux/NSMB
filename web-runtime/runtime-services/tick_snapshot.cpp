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
// Versioned native registration fallback for LEGACY structural facades that
// forward only store32/status. Address 0xFFFFFFFC is never valid guest RAM;
// this exact address + value pair is a HOST SERVICE CONTROL REQUEST ONLY.
// It MUST NOT be treated as a guest tick write or a Wii MMIO success.
constexpr uint32_t kHostClaimAddress=0xFFFFFFFCu;
constexpr uint32_t kHostClaimCode=0x5449434Bu; // "TICK"
// One irreversible claim per actual C++/Wasm INSTANCE for the entire lifetime.
// JS structural facades and duplicate ESM copies all delegate to this native
// static, so they cannot become independent authorities for shared guest RAM.
// Module-wide guest reset does not release the host time authority.
bool tickClaimed=false;
bool guestRamWord(uint32_t address) noexcept {
    if((address & 3u) != 0u || (address & 0xC0000000u) == 0x40000000u) return false;
    const uint32_t physical=address & 0x3FFFFFFFu;
    return physical <= 0x017FFFFCu ||
           (physical >= 0x10000000u && physical <= 0x17FFFFFCu);
}
}
extern "C" {
// Registration only: does not read or write guest memory or invoke a device.
// Called by the host adapter on initialization. There is no release API,
// including through nsmbw_loop_reset(), to prevent stale JS alias owners.
// Only the registered native host time authority may drive CpuContext samples.
uint32_t EXPORT nsmbw_services_tick_is_claimed() { return tickClaimed ? 1u : 0u; }
uint32_t EXPORT nsmbw_services_tick_claim() {
    if(tickClaimed) return 0u;
    tickClaimed=true;
    return 1u;
}
// This is only the LOW 32-bit virtual-tick snapshot, not an authentic 64-bit
// PowerPC timebase read, OSGetSystemTime or any SDA/interrupt/fiber service.
// The caller owns the full 64-bit monotonic timebase and advance policy.
uint32_t EXPORT nsmbw_services_tick_store32(uint32_t guestAddress,uint32_t lowTicks) {
    serviceStatus=0;
    if(guestAddress==kHostClaimAddress && lowTicks==kHostClaimCode) {
        // No W04 page allocation, device callback or guest clock mutation.
        // Legacy facades and raw module claims use the SAME tickClaimed bit.
        if(tickClaimed){serviceStatus=8u;return 0u;}
        tickClaimed=true;
        return 1u;
    }
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
