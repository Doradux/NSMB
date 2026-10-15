#pragma once
#include <cstdint>
#include <cstdlib>
// Phase6 PUBLIC SYNTHETIC STW fixture ONLY. No unrestricted Wii memory.h.
// Exactly 2 stores + inlined call; no hardware, interrupts, arbitrary
// translated code, pointer mapping, dynamic native symbols or FPR.
#ifdef NSMB_PHASE6_TRANSLATED_STORE_FIXTURE
extern "C" {
uint32_t nsmbw_interop_read32(uint32_t);
int nsmbw_mem_atomic_pair_write32(uint32_t,uint32_t,uint32_t,uint32_t);
int nsmbw_mem_error();
uint32_t nsmbw_interop_status();
uint32_t nsmbw_interop_retry_safe();
uint32_t nsmbw_interop_device_invoked();
}
namespace MemoryInline {
struct PendingStore {uint32_t address,original,value;};
inline PendingStore writes[2]{};
inline uint32_t n=0,errorCode=0,retrySafe=0;
inline uint32_t canonical(uint32_t addr){return addr&0x3FFFFFFFu;}
inline bool ordinaryRam(uint32_t addr) {
  // Strict mapped physical MEM1/MEM2; Wii device 0xCC region is
  // NOT ordinary RAM. Address must be a complete aligned 32-bit word.
  if((addr&3u)!=0 || (addr&0xC0000000u)==0x40000000u)return false;
  const uint32_t p=canonical(addr);
  return p<=0x017FFFFCu || (p>=0x10000000u && p<=0x17FFFFFCu);
}
inline void Begin(){n=errorCode=retrySafe=0;writes[0]=writes[1]={};}
inline uint32_t Fault(){return errorCode;}
inline uint32_t RetrySafe(){return retrySafe;}
inline void FlatWrite32(uint32_t guest,uint32_t value) {
 if(errorCode)return;
 if(!ordinaryRam(guest)){errorCode=7;retrySafe=0;return;}
 const uint32_t phys=canonical(guest);
 for(uint32_t i=0;i<n;++i)if(canonical(writes[i].address)==phys){
   writes[i].value=value;return;
 }
 if(n>=2){errorCode=7;retrySafe=0;return;}
 const uint32_t original=nsmbw_interop_read32(guest);
 const uint32_t status=nsmbw_interop_status();
 if(status){errorCode=status;retrySafe=nsmbw_interop_retry_safe()==1u &&
   nsmbw_interop_device_invoked()==0u;return;}
 writes[n++]={guest,original,value};
}
// Narrow read-your-own-write forwarding for our exact synthetic 4-op
// STW->LWZ->STW fixture. Nothing is written to guest RAM by a staged read;
// physically aliased cached/uncached addresses resolve to the same word.
// Deny MMIO, unaligned and unknown guest regions BEFORE any device callback.
inline uint32_t FlatRead32(uint32_t guest) {
 if(errorCode)return 0;
 if(!ordinaryRam(guest)){errorCode=7;retrySafe=0;return 0;}
 const uint32_t phys=canonical(guest);
 for(uint32_t i=0;i<n;++i)if(canonical(writes[i].address)==phys)
   return writes[i].value;
 const uint32_t word=nsmbw_interop_read32(guest);
 const uint32_t code=nsmbw_interop_status();
 if(code) {
   errorCode=code;
   retrySafe=0; // Conservative: a preceding store may be staged.
   return 0;
 }
 return word;
}
inline bool Commit() {
 if(errorCode)return false;
 if(n==0)return true;
 // All staging reads were checked by W07, but COMMIT MUST reserve both
 // distinct W04 physical pages atomically before mutating ANY byte/page
 // table. This prevents a quota fault after allocating the first NEW page
 // from leaving a ghost page when the second NEW page cannot fit.
 // Two aliases are coalesced in the journal and passed as one word twice.
 const auto& first=writes[0];
 const auto& second=writes[n==2?1:0];
 const int success=nsmbw_mem_atomic_pair_write32(
   first.address,first.value,second.address,second.value);
 if(success==1 && nsmbw_mem_error()==0)return true;
 errorCode=static_cast<uint32_t>(nsmbw_mem_error());
 if(!errorCode)errorCode=1u;
 retrySafe=0; // conservative: never replay unknown mixed-effects batch
 return false;
}
}
#endif
