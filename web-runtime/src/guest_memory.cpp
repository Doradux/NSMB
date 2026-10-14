// Copyright (c) 2026. Experimental NSMB Wii browser-port infrastructure.
// This is a sparse, aliased big-endian Wii RAM backend, not a CPU emulator.
// DO NOT connect translated guest accesses until memory-access semantics are verified.
#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <new>
#include <unordered_map>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define NSMBW_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define NSMBW_EXPORT
#endif

namespace {
constexpr uint32_t kPageShift = 12;
constexpr uint32_t kPageSize = 1u << kPageShift;
constexpr uint32_t kMem1End = 24u * 1024u * 1024u;
constexpr uint32_t kMem2Start = 0x10000000u;
constexpr uint32_t kMem2End = kMem2Start + 128u * 1024u * 1024u;
using Page = std::array<uint8_t, kPageSize>;
std::unordered_map<uint32_t, std::unique_ptr<Page>> pages;
int lastError = 0;

bool resolve(uint32_t guest, uint32_t& physical) {
    // MEM1/MEM2 physical, cached and uncached Wii RAM mirrors. A 0x40000000
    // mirror does not exist, and MMIO is outside the two physical banks.
    if ((guest & 0xC0000000u) == 0x40000000u) return false;
    physical = guest & 0x3FFFFFFFu;
    return physical < kMem1End ||
           (physical >= kMem2Start && physical < kMem2End);
}

bool validate(uint32_t address, uint32_t size) {
    lastError = 0;
    if (size == 0 || static_cast<uint64_t>(address) + size > 0x100000000ull) {
        lastError = 2; // Access wraps 32-bit address space.
        return false;
    }
    for (uint32_t n = 0; n < size; ++n) {
        uint32_t physical = 0;
        if (!resolve(address + n, physical)) {
            lastError = 1; // Unmapped / MMIO.
            return false;
        }
    }
    return true;
}

uint8_t readByte(uint32_t address) {
    uint32_t physical;
    resolve(address, physical);
    const auto iter = pages.find(physical >> kPageShift);
    if (iter == pages.end()) return 0;
    return (*(iter->second))[physical & (kPageSize - 1)];
}

bool writeByte(uint32_t address, uint8_t value) {
    uint32_t physical;
    resolve(address, physical);
    const uint32_t pageIndex = physical >> kPageShift;
    auto& page = pages[pageIndex];
    if (!page) {
        page.reset(new (std::nothrow) Page{});
        if (!page) {
            lastError = 3; // Allocation failure.
            return false;
        }
    }
    (*page)[physical & (kPageSize - 1)] = value;
    return true;
}

uint32_t read(uint32_t address, uint32_t width) {
    if (!validate(address, width)) return 0;
    uint32_t result = 0;
    for (uint32_t n = 0; n < width; ++n) {
        result = (result << 8) | readByte(address + n);
    }
    return result;
}

int write(uint32_t address, uint32_t width, uint32_t value) {
    if (!validate(address, width)) return 0;
    for (uint32_t n = 0; n < width; ++n) {
        const auto shift = (width - 1u - n) * 8u;
        if (!writeByte(address + n, static_cast<uint8_t>(value >> shift))) return 0;
    }
    return 1;
}
}  // namespace

extern "C" {
void NSMBW_EXPORT nsmbw_mem_reset() { pages.clear(); lastError = 0; }
int NSMBW_EXPORT nsmbw_mem_error() { return lastError; }
uint32_t NSMBW_EXPORT nsmbw_mem_pages() { return static_cast<uint32_t>(pages.size()); }
uint32_t NSMBW_EXPORT nsmbw_mem_read8(uint32_t address) { return read(address, 1); }
uint32_t NSMBW_EXPORT nsmbw_mem_read16(uint32_t address) { return read(address, 2); }
uint32_t NSMBW_EXPORT nsmbw_mem_read32(uint32_t address) { return read(address, 4); }
int NSMBW_EXPORT nsmbw_mem_write8(uint32_t address, uint32_t value) { return write(address, 1, value); }
int NSMBW_EXPORT nsmbw_mem_write16(uint32_t address, uint32_t value) { return write(address, 2, value); }
int NSMBW_EXPORT nsmbw_mem_write32(uint32_t address, uint32_t value) { return write(address, 4, value); }
}
