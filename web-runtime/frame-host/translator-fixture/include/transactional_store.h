#pragma once
#include <cstdint>
#include <cstdlib>
// Phase6 PUBLIC SYNTHETIC STW fixture ONLY. No unrestricted Wii memory.h.
// Exactly 2 stores + inlined call; no hardware, interrupts, arbitrary
// translated code, pointer mapping, dynamic native symbols or FPR.
#ifdef NSMB_PHASE6_TRANSLATED_STORE_FIXTURE
extern "C" {
uint32_t nsmbw_interop_read32(uint32_t);
uint32_t nsmbw_interop_write32(uint32_t,uint32_t);
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
inline bool Commit() {
 if(errorCode)return false;
 // Staging performs zero guest writes. Only pure RAM words can commit.
 // Each W07 write is a 4-byte checked atomic operation. Undo earlier
 // writes in REVERSE order on a later failure (all earlier pages are
 // now mapped, and no MMIO or device callbacks are permitted).
 uint32_t done=0;
 for(;done<n;++done){
   const uint32_t ok=nsmbw_interop_write32(writes[done].address,writes[done].value);
   const uint32_t status=nsmbw_interop_status();
   if(ok==1u && status==0u)continue;
   errorCode=status?status:1u;
   retrySafe=0; // conservative: committed RAM write before late fault
   while(done>0) {
     const auto& restore=writes[--done];
     if(nsmbw_interop_write32(restore.address,restore.original)!=1u ||
        nsmbw_interop_status()!=0u)std::abort(); // never silently succeed
   }
   return false;
 }
 return true;
}
}
#endif
