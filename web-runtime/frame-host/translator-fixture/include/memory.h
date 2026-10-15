#pragma once
#include <cstdint>
#ifdef NSMB_PHASE6_TRANSLATED_STORE_FIXTURE
#include "transactional_store.h"
#endif
// Only source-only test fixture with ONE synthetic lwz r3,0(r4).
// No host pointers, no full MemoryInline, no unsupported writes.
#ifdef NSMB_PHASE5_TRANSLATED_LOAD_FIXTURE
extern "C" {
uint32_t nsmbw_interop_read32(uint32_t guest);
uint32_t nsmbw_interop_status();
uint32_t nsmbw_interop_retry_safe();
uint32_t nsmbw_interop_device_invoked();
}
namespace MemoryInline {
inline uint32_t errorCode=0, safeToRetry=0;
inline void ResetError(){errorCode=safeToRetry=0;}
inline uint32_t Fault(){return errorCode;}
inline uint32_t RetrySafe(){return safeToRetry;}
inline uint32_t FlatRead32(uint32_t address) {
 const uint32_t value=nsmbw_interop_read32(address);
 // Capture status IMMEDIATELY after checked C++ W07 access, before any
 // interleaved operation could reset global typed MMIO metadata.
 errorCode=nsmbw_interop_status();
 safeToRetry=nsmbw_interop_retry_safe()==1 &&
             nsmbw_interop_device_invoked()==0 ? 1u : 0u;
 return errorCode?0u:value;
}
}
#endif
