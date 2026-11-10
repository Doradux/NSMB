#pragma once
// INVENTED PPC-Lite only. Public by-value data is NEVER a W03 capability.
// No native CPU pointers, W03 Tickets or grants cross this boundary.
#include <cstdint>
#include <type_traits>
namespace nsmbw::p20::toy {
constexpr uint32_t kExpectedPc=0x80010000u;
constexpr uint32_t kMaxSteps=128u;
enum class Status : uint32_t {
  ok=0, wrongPc=1, unknownEntry=2, unsupportedOpcode=3,
  recursion=4, stepLimit=5, badBranch=6
};
struct Input final {
  uint32_t entryOffset=0, expectedPc=kExpectedPc, gpr3=0;
  uint32_t lr=0, stackSentinel=0, maxSteps=kMaxSteps;
};
struct Result final {
  Status status=Status::unknownEntry;
  uint32_t gpr3=0, lr=0, returnPc=0, steps=0;
  constexpr bool computed() const noexcept {return status==Status::ok;}
};
static_assert(std::is_standard_layout_v<Input>);
static_assert(std::is_trivially_copyable_v<Input>);
static_assert(std::is_standard_layout_v<Result>);
static_assert(sizeof(Input)==24 && sizeof(Result)==20);
static_assert(!Result{}.computed());
// Pure evaluator; expectedPc here is only a synthetic ABI consistency
// check, NOT a lease / quota / origin / clock permission.
Result evaluate(const Input& input) noexcept;
} // namespace nsmbw::p20::toy
// Public TEST-ONLY scalar probe for native + Wasm source/oracle comparison,
// not a production W03 authorization/guest dispatch API.
extern "C" uint32_t nsmb_p20_leaf_probe(uint32_t entry,uint32_t pc,
  uint32_t gpr3,uint32_t lr,uint32_t sentinel,uint32_t maxSteps,
  uint32_t field);
extern "C" uint32_t nsmb_p20_leaf_source_tag();
