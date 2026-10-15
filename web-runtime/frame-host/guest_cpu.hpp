#pragma once
#include <array>
#include <cstdint>

// Source-independent, fixed synthetic PPC-style call ABI. NOT PPC opcode
// decoding and NOT authentic Nintendo guest instructions or Wii fibers.
namespace SyntheticCpu {
constexpr uint32_t Entry = 0x80010000u;
constexpr uint32_t Callee = 0x80010100u;
constexpr uint32_t Exit = 0x8001FFF0u;
struct State {
  std::array<uint32_t,32> gpr{};
  uint32_t pc=0, lr=0, ctr=0, cr=0, xer=0;
  uint32_t steps=0;
  uint32_t stackTop=0; // host-only ownership metadata; NOT a PPC architectural register
};
struct Outcome {
  bool ok=false, done=false;
  uint32_t error=0, retrySafe=0;
};
bool initialize(State& state,uint32_t pc,uint32_t stackTop,uint32_t inputGuest,
                uint32_t resultGuest,uint32_t salt);
Outcome step(State& state);
}
