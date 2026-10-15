// Source-only copyright-free function using the ACTUAL translator's baseline
// exported C++ function signature: extern "C" void fn(CpuContext* ctx).
// Unlike the translator this file is handwritten: it is an ABI seam test,
// NOT generated PowerPC translation, code decoding or gameplay.
#include "guest_cpu.hpp"
#include <cstdint>

extern "C" void nsmbw_synthetic_public_scalar(CpuContext* ctx) {
  if(!ctx) return;
  const uint32_t word=ctx->gpr[3];
  const uint64_t lowByte=word&255u;
  const uint64_t sequence=(word>>24u)&255u;
  const uint64_t salt=ctx->gpr[5];
  const uint64_t result=lowByte+sequence+salt;
  ctx->gpr[3]=static_cast<uint32_t>(result);
  ctx->gpr[4]=static_cast<uint32_t>(result>>32u);
  // Incoming LR and r1/r2/r13 are caller-owned ABI state. Even if this
  // synthetic fixture has an r3/r4 pair return, it must not fake a float.
}
