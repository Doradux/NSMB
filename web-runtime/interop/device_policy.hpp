#pragma once
// W07 Phase 2: private in-Wasm C++ device dispatch contract.
// No pointers or callbacks ever cross the public JS/WASM C ABI.
#include <cstdint>

namespace NSMBDevice {
enum class Region : uint32_t { Mmio = 1, GxFifo = 2 };
enum class Operation : uint32_t { Read = 1, Write = 2 };
enum class Result : uint32_t { Ok = 0, Unhandled = 4, Rejected = 5, InvalidReply = 6 };
struct Reply {
    Result status;
    uint32_t value;
};
using Callback = Reply (*)(Region, Operation, uint32_t guestAddress,
                            uint32_t width, uint32_t value) noexcept;
void install(Region region, Callback callback) noexcept;
void clear() noexcept;
uint32_t access(Operation operation, uint32_t address, uint32_t width,
                uint32_t input, uint32_t& output, bool* callbackInvoked = nullptr) noexcept;
// Single-thread callback policy: no recursive dispatch or handler mutation.
// callbackInvoked remains true even for rejected/invalid replies because
// irreversible external side effects may have already occurred.
} // namespace NSMBDevice
