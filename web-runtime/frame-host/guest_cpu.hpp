#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <type_traits>

// Public source-only ABI SHAPE from upstream-nsmbw/runtime/include/isa/
// ppc_isa_context.h lines 17-62. This is not original Nintendo game code.
// Generated translator baseline uses extern "C" void fn(CpuContext* ctx).
union PPC_FPR {
  uint64_t raw;
  double d;
  struct {
#if __BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__
    float ps1, ps0;
#else
    float ps0, ps1;
#endif
  } paired;
};
struct CpuContext {
  uint32_t gpr[32];
  uint32_t cr,lr,ctr,xer,fpscr,pc;
  PPC_FPR fpr[32];
  uint32_t gqr[8];
  uint32_t hid0,hid1,hid2;
  uint32_t srr0,srr1,msr;
};
static_assert(std::is_standard_layout_v<CpuContext>);
static_assert(sizeof(PPC_FPR)==8 && alignof(PPC_FPR)==8);
static_assert(sizeof(CpuContext)==464 && alignof(CpuContext)==8);
static_assert(offsetof(CpuContext,gpr)==0);
static_assert(offsetof(CpuContext,cr)==128);
static_assert(offsetof(CpuContext,lr)==132);
static_assert(offsetof(CpuContext,ctr)==136);
static_assert(offsetof(CpuContext,xer)==140);
static_assert(offsetof(CpuContext,fpscr)==144);
static_assert(offsetof(CpuContext,pc)==148);
static_assert(offsetof(CpuContext,fpr)==152);
static_assert(offsetof(CpuContext,gqr)==408);
static_assert(offsetof(CpuContext,hid0)==440);
static_assert(offsetof(CpuContext,msr)==460);

// Plain C ABI accepted by ACTUAL upstream translator for normal generated
// functions. Synthetic fixture only; unlike translator output this function
// is handwritten and does not claim actual PPC instructions were translated.
extern "C" void nsmbw_synthetic_public_scalar(CpuContext* ctx);

namespace SyntheticCpu {
constexpr uint32_t Entry=0x80010000u, Callee=0x80010100u, Exit=0x8001FFF0u;
// The ABI context is the BASE of per-slot bookkeeping. A CpuContext* remains
// the exact pointer at offset 0; frame host owns the appended lifecycle.
struct State : public CpuContext {
  uint32_t steps=0,stackTop=0,inputGuest=0,outputGuest=0;
};
struct Outcome {
  bool ok=false,done=false;
  uint32_t error=0,retrySafe=0;
};
bool initialize(State& state,uint32_t pc,uint32_t stackTop,uint32_t inputGuest,
                uint32_t resultGuest,uint32_t salt);
Outcome step(State& state);
}
