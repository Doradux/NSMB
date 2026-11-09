// The exact public W03-to-Toad header surface, no C++ mock authorization.
#include "time64_pure_candidate.hpp"
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <type_traits>
static_assert(std::is_trivially_copyable<nsmbw::w18::Candidate>::value);
static_assert(std::is_trivially_copyable<nsmbw::w18::Result>::value);
static_assert(noexcept(nsmbw::w18::fromNanoseconds(0)));
static_assert(noexcept(nsmbw::w18::makeTicks(0)));
static_assert(noexcept(nsmbw::w18::addTicks(0,1)));
static_assert(noexcept(nsmbw::w18::requireMonotonic({0},0)));
int main() {
 using namespace nsmbw::w18;
 auto a=fromNanoseconds(1000000000ULL);
 if(!a.ok()||a.candidate.ticks!=60750000||a.candidate.high32()!=0||
    a.candidate.low32()!=60750000)return 3;
 auto b=makeTicks(0x100000001ULL);
 if(b.candidate.high32()!=1||b.candidate.low32()!=1)return 4;
 if(addTicks(std::numeric_limits<uint64_t>::max(),1).error!=Error::overflow)return 5;
 if(requireMonotonic({4},5)!=Error::regression)return 6;
 if(signedNanos(-1).error!=Error::invalid)return 7;
 std::cout<<"PURE_ABI_PASS 5 checks"<<'\n';
}
