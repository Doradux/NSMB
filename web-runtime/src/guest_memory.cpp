// Copyright (c) 2026. Experimental NSMB Wii browser-port infrastructure.
// A bounded sparse MEM1/MEM2 backend, not a CPU emulator or full Wii memory policy.
// MMIO, DMA, executable-write guards and threading are not implemented.
#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <new>

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
constexpr uint32_t kMem1Pages = kMem1End / kPageSize;
constexpr uint32_t kMem2Pages = (kMem2End - kMem2Start) / kPageSize;
constexpr uint32_t kTotalPages = kMem1Pages + kMem2Pages;

// Fixed, zero-initialized page-pointer tables cost about 152 KiB on Wasm32
// (304 KiB on 64-bit native). No rehash or insertion allocation is possible.
// Only the 4 KiB data pages are allocated lazily. This is single-threaded.
using Page = std::array<uint8_t, kPageSize>;
std::array<std::unique_ptr<Page>, kMem1Pages> mem1Pages;
std::array<std::unique_ptr<Page>, kMem2Pages> mem2Pages;
uint32_t allocatedPages = 0;
uint32_t pageBudget = kTotalPages;
int lastError = 0;

// Error 1: unmapped/MMIO, 2: guest address wraps, 3: RAM quota/allocation
// failure, 4: invalid argument or attempted budget shrink below live pages.
bool resolve(uint32_t guest, uint32_t& physical) {
    // Wii RAM has physical/cached/uncached aliases, not an arbitrary 4 GiB map.
    // Reject the 0x40000000 mirror and any non-MEM1/MEM2 location.
    if ((guest & 0xC0000000u) == 0x40000000u) return false;
    physical = guest & 0x3FFFFFFFu;
    return physical < kMem1End ||
           (physical >= kMem2Start && physical < kMem2End);
}

bool validate(uint32_t address, uint32_t width) {
    lastError = 0;
    // Width is checked here so this loop remains O(1), even for future callers.
    if (width != 1 && width != 2 && width != 4) {
        lastError = 4;
        return false;
    }
    if (static_cast<uint64_t>(address) + width > 0x100000000ull) {
        lastError = 2;
        return false;
    }
    for (uint32_t n = 0; n < width; ++n) {
        uint32_t physical = 0;
        if (!resolve(address + n, physical)) {
            lastError = 1;
            return false;
        }
    }
    return true;
}

std::unique_ptr<Page>& pageFor(uint32_t physical) {
    // Caller must first validate the physical range via resolve.
    if (physical < kMem1End) return mem1Pages[physical >> kPageShift];
    return mem2Pages[(physical - kMem2Start) >> kPageShift];
}

uint8_t readByte(uint32_t address) {
    uint32_t physical = 0;
    resolve(address, physical); // validated by read()
    const auto& page = pageFor(physical);
    if (!page) return 0;
    return (*page)[physical & (kPageSize - 1u)];
}

uint32_t read(uint32_t address, uint32_t width) {
    if (!validate(address, width)) return 0;
    uint32_t result = 0;
    for (uint32_t n = 0; n < width; ++n) {
        result = (result << 8u) | readByte(address + n);
    }
    return result;
}

int write(uint32_t address, uint32_t width, uint32_t value) {
    if (!validate(address, width)) return 0;

    // A 1/2/4-byte write touches at most two physical 4 KiB pages.
    // Collect distinct slots so aliased virtual addresses never double-allocate.
    std::array<std::unique_ptr<Page>*, 2> slots{};
    uint32_t touched = 0;
    for (uint32_t n = 0; n < width; ++n) {
        uint32_t physical = 0;
        resolve(address + n, physical); // validated by validate()
        auto* slot = &pageFor(physical);
        if ((touched > 0 && slots[0] == slot) || (touched > 1 && slots[1] == slot)) continue;
        if (touched == slots.size()) {
            lastError = 4; // Defensive check if access widths change.
            return 0;
        }
        slots[touched++] = slot;
    }

    uint32_t needed = 0;
    for (uint32_t n = 0; n < touched; ++n) if (!*slots[n]) ++needed;
    if (needed > pageBudget - allocatedPages) {
        lastError = 3;
        return 0;
    }

    // Reserve every missing page before mutating any page table or guest byte.
    // A failure releases staged pages automatically and leaves guest RAM intact.
    std::array<std::unique_ptr<Page>, 2> staging{};
    for (uint32_t n = 0; n < touched; ++n) {
        if (!*slots[n]) {
            staging[n].reset(new (std::nothrow) Page{});
            if (!staging[n]) {
                lastError = 3;
                return 0;
            }
        }
    }
    for (uint32_t n = 0; n < touched; ++n) {
        if (staging[n]) {
            slots[n]->swap(staging[n]);
            ++allocatedPages;
        }
    }

    // No fallible operation remains: a cross-page write is all-or-nothing.
    for (uint32_t n = 0; n < width; ++n) {
        uint32_t physical = 0;
        resolve(address + n, physical);
        const uint32_t shift = (width - 1u - n) * 8u;
        (*pageFor(physical))[physical & (kPageSize - 1u)] =
            static_cast<uint8_t>(value >> shift);
    }
    return 1;
}
} // namespace

extern "C" {
#ifdef NSMB_PHASE6_TRANSLATED_STORE_FIXTURE
// TEST-ONLY exact two-word ordinary RAM transaction for actual generated
// public PPC STW fixture. Preallocate ALL missing pages before touching either
// guest byte or page pointer. No MMIO, DMA, HLE, native guest pointers, or
// arbitrary write-set length. The regular runtime does NOT export this API.
int NSMBW_EXPORT nsmbw_mem_atomic_pair_write32(
    uint32_t addressA,uint32_t valueA,uint32_t addressB,uint32_t valueB) {
    if (!validate(addressA,4) || !validate(addressB,4)) return 0;
    if ((addressA&3u) || (addressB&3u)) {lastError=4;return 0;}
    uint32_t physicalA=0,physicalB=0;
    if(!resolve(addressA,physicalA) || !resolve(addressB,physicalB)) {
        lastError=1;return 0;
    }
    auto* slotA=&pageFor(physicalA);
    auto* slotB=&pageFor(physicalB);
    const uint32_t needed=(!*slotA ? 1u:0u)+
                          (slotB!=slotA && !*slotB ? 1u:0u);
    if(needed>pageBudget-allocatedPages){lastError=3;return 0;}
    std::unique_ptr<Page> stagedA,stagedB;
    if(!*slotA){
      stagedA.reset(new(std::nothrow) Page{});
      if(!stagedA){lastError=3;return 0;}
    }
    if(slotB!=slotA && !*slotB){
      stagedB.reset(new(std::nothrow) Page{});
      if(!stagedB){lastError=3;return 0;}
    }
    // Staging succeeded; after this point no fallible operation remains.
    if(stagedA){slotA->swap(stagedA);++allocatedPages;}
    if(stagedB){slotB->swap(stagedB);++allocatedPages;}
    for(uint32_t i=0;i<4u;++i){
      (**slotA)[(physicalA+i)&(kPageSize-1u)]=
        static_cast<uint8_t>(valueA>>((3u-i)*8u));
    }
    for(uint32_t i=0;i<4u;++i){
      (**slotB)[(physicalB+i)&(kPageSize-1u)]=
        static_cast<uint8_t>(valueB>>((3u-i)*8u));
    }
    lastError=0;return 1;
}
#endif
void NSMBW_EXPORT nsmbw_mem_reset() {
    for (auto& page : mem1Pages) page.reset();
    for (auto& page : mem2Pages) page.reset();
    allocatedPages = 0;
    lastError = 0;
    // Intentionally keep the host-selected budget after a reset.
}
int NSMBW_EXPORT nsmbw_mem_error() { return lastError; }
uint32_t NSMBW_EXPORT nsmbw_mem_pages() { return allocatedPages; }
int NSMBW_EXPORT nsmbw_mem_set_page_budget(uint32_t maxPages) {
    if (maxPages > kTotalPages || maxPages < allocatedPages) {
        lastError = 4;
        return 0;
    }
    pageBudget = maxPages;
    lastError = 0;
    return 1;
}
uint32_t NSMBW_EXPORT nsmbw_mem_read8(uint32_t address) { return read(address, 1); }
uint32_t NSMBW_EXPORT nsmbw_mem_read16(uint32_t address) { return read(address, 2); }
uint32_t NSMBW_EXPORT nsmbw_mem_read32(uint32_t address) { return read(address, 4); }
int NSMBW_EXPORT nsmbw_mem_write8(uint32_t address, uint32_t value) { return write(address, 1, value); }
int NSMBW_EXPORT nsmbw_mem_write16(uint32_t address, uint32_t value) { return write(address, 2, value); }
int NSMBW_EXPORT nsmbw_mem_write32(uint32_t address, uint32_t value) { return write(address, 4, value); }
}
