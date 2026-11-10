// PHASE19 TEST-ONLY standalone WASM numeric PROBE. NOT W03 or Nintendo.
// This file intentionally exports an UNTRUSTED calculation to JS. Never
// link it into the real frame-host, never mint a native Ticket from it.
// Request/GateView are synthetic fixed-value data and can be FORGED.
#ifndef NSMB_P19_TOAD_TEST_PROBE
#error "Invented-only diagnostics need explicit TEST_PROBE build flag"
#endif
#include "synthetic_service_dispatch.hpp"
#include <cstdint>
using namespace nsmbw::p19::services;
namespace {
Result evaluate(uint32_t version,uint32_t service,uint64_t input,
                uint32_t origin,uint32_t quota) noexcept {
 Request r{};r.version=version;
 r.id=static_cast<ServiceId>(service);
 r.slot=1;r.expectedPc=kSyntheticEntryPc;
 r.epoch=1;r.revision=0;r.serial=1;r.value=input;
 GateView g{};g.slot=1;g.pc=kSyntheticEntryPc;
 g.epoch=1;g.revision=0;g.serial=1;
 g.remainingBudget=quota;
 g.origin=static_cast<Origin>(origin);
 g.phase=Phase::ready;g.enabled=true;g.guestReady=true;
 return prepare(r,g);
}
}
extern "C" {
uint32_t nsmbw_p19_test_only_status(uint32_t version,uint32_t service,
                                    uint64_t value,uint32_t origin,
                                    uint32_t quota) noexcept {
 return static_cast<uint32_t>(evaluate(version,service,value,
                                       origin,quota).status);
}
uint64_t nsmbw_p19_test_only_ticks(uint32_t version,uint32_t service,
                                   uint64_t value,uint32_t origin,
                                   uint32_t quota) noexcept {
 return evaluate(version,service,value,origin,quota).candidate.ticks;
}
uint32_t nsmbw_p19_test_only_low32(uint32_t version,uint32_t service,
                                   uint64_t value,uint32_t origin,
                                   uint32_t quota) noexcept {
 return evaluate(version,service,value,origin,quota).candidate.low32;
}
uint32_t nsmbw_p19_test_only_high32(uint32_t version,uint32_t service,
                                    uint64_t value,uint32_t origin,
                                    uint32_t quota) noexcept {
 return evaluate(version,service,value,origin,quota).candidate.high32;
}
}
