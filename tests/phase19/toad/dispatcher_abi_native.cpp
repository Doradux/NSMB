// Invented services ONLY. Native no-permission ABI candidate smoke.
#include "synthetic_service_dispatch.hpp"
#include <cstdint>
#include <iostream>
#include <type_traits>
using namespace nsmbw::p19::services;
static_assert(std::is_trivially_copyable<Request>::value);
static_assert(std::is_standard_layout<Request>::value);
static_assert(std::is_trivially_copyable<GateView>::value);
static_assert(std::is_trivially_copyable<Candidate>::value);
static_assert(std::is_standard_layout<Result>::value);
static_assert(noexcept(prepare(Request{},GateView{})));
int main(){
 GateView gate{};
 gate.slot=1;gate.pc=0x80010000u;gate.epoch=42;gate.revision=7;gate.serial=9;gate.phase=Phase::ready;
 gate.remainingBudget=2;gate.enabled=true;gate.guestReady=true;
 gate.origin=Origin::nativeScheduler;
 Request request{};
 request.version=kAbiVersion;request.id=ServiceId::rawClockFromNanoseconds;
 request.slot=1;request.expectedPc=0x80010000u;request.epoch=42;
 request.revision=7;request.serial=9;request.value=1000000000ULL;
 const auto result=prepare(request,gate);
 if(result.status!=Status::candidateOnly ||
    result.candidate.ticks!=60750000ULL ||
    result.candidate.high32!=0u ||
    result.candidate.low32!=60750000u)return 3;
 std::cout<<"PASS ABI_CANDIDATE_ONLY_UNAUTHENTICATED"<<'\n';
}
