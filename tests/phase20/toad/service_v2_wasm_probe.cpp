// EXPLICIT TEST-ONLY standalone Wasm PURE math probe. NOT W03 or Nintendo.
// No JS/native Ticket, no mutable W03 ledger, no authority or quota issuer.
#ifndef NSMB_TOAD_P20_TEST_ONLY_PROBE
#error "This is a test-only probe, never link into real W03 build"
#endif
#include "synthetic_service_v2.hpp"
#include <cstdint>
namespace s=nsmbw::p20::services;
static s::ResultV2 sample(uint32_t version,uint32_t id,uint64_t number,
                          uint32_t origin,uint32_t quota) noexcept{
 s::RequestV2 r{};
 r.version=version;r.service=static_cast<s::ServiceId>(id);
 r.slot=1;r.expectedPc=s::kSyntheticPc;
 r.epoch=1;r.value=number;
 s::ViewV2 v{};
 v.slot=1;v.currentPc=s::kSyntheticPc;v.epoch=1;
 v.claimedBudget=quota;v.origin=static_cast<s::OriginClaim>(origin);
 v.phase=s::PhaseClaim::ready;v.guestReady=true;v.enabled=true;
 return s::compute(r,v);
}
extern "C" {
// Public test-only JS wrappers prove that even a plausible forged GateView
// merely returns a numeric candidate, NEVER a W03 execution grant.
uint32_t nsmbw_p20_test_only_status(uint32_t version,uint32_t id,
 uint64_t number,uint32_t origin,uint32_t quota) noexcept {
 return static_cast<uint32_t>(sample(version,id,number,origin,quota).status);
}
uint64_t nsmbw_p20_test_only_ticks(uint32_t version,uint32_t id,
 uint64_t number,uint32_t origin,uint32_t quota) noexcept {
 return sample(version,id,number,origin,quota).candidate.rawTicks;
}
uint32_t nsmbw_p20_test_only_high32(uint32_t version,uint32_t id,
 uint64_t number,uint32_t origin,uint32_t quota) noexcept {
 return sample(version,id,number,origin,quota).candidate.high32;
}
uint32_t nsmbw_p20_test_only_low32(uint32_t version,uint32_t id,
 uint64_t number,uint32_t origin,uint32_t quota) noexcept {
 return sample(version,id,number,origin,quota).candidate.low32;
}
uint32_t nsmbw_p20_test_only_proposed_cost(uint32_t version,uint32_t id,
 uint64_t number,uint32_t origin,uint32_t quota) noexcept {
 return sample(version,id,number,origin,quota).candidate.proposedCost;
}
}
