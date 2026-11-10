// Layout is OUR C++17 synthetic ABI, never an original Wii PPC ABI.
#include "synthetic_service_dispatch.hpp"
#include <cstddef>
#include <cstdint>
#include <type_traits>
using namespace nsmbw::p19::services;
static_assert(sizeof(ServiceId)==4 && sizeof(Status)==4);
static_assert(sizeof(Origin)==1 && sizeof(Phase)==1);
static_assert(sizeof(Request)==48 && alignof(Request)==8);
static_assert(sizeof(GateView)==56 && alignof(GateView)==8);
static_assert(sizeof(Candidate)==56 && alignof(Candidate)==8);
static_assert(sizeof(Result)==64 && alignof(Result)==8);
static_assert(offsetof(Request,value)==40);
static_assert(offsetof(Candidate,ticks)==40);
static_assert(offsetof(Candidate,high32)==48);
static_assert(offsetof(Candidate,low32)==52);
static_assert(std::is_trivially_copyable<Request>::value);
static_assert(std::is_trivially_copyable<GateView>::value);
static_assert(std::is_trivially_copyable<Candidate>::value);
static_assert(std::is_trivially_copyable<Result>::value);
static_assert(noexcept(prepare(Request{},GateView{})));
int main(){return 0;}
