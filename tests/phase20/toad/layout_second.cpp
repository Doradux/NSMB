#include "synthetic_service_v2.hpp"
#include <cstdint>
using namespace nsmbw::p20::services;
uint64_t toad20CrossTU(const RequestV2& request,
                        const ViewV2& view) noexcept{
 const auto result=compute(request,view);
 return result.computed()?result.candidate.rawTicks:0u;
}
