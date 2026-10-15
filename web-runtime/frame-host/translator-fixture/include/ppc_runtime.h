#pragma once
// Minimal self-contained public synthetic translation TEST ABI. This is NOT
// the Wii runtime's full ppc_runtime.h: unsupported ISA helpers will fail
// compilation rather than receiving an invented success implementation.
#include "../../guest_cpu.hpp"
#ifndef MKW_RESTRICT
#define MKW_RESTRICT __restrict__
#endif
