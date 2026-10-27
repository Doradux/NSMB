// W03 phase 2: synthetic cooperative contexts invoke W07 checked RAM.
// No Nintendo code or actual stackful Wii fibers. The host owns frame boundaries.
#include <array>
#include <cstdint>
#include "guest_cpu.hpp"
#include "trusted_cpu_service.hpp"
#if defined(NSMB_PHASE5_TRANSLATED_FIXTURE) || defined(NSMB_PHASE5_TRANSLATED_LOAD_FIXTURE) || defined(NSMB_PHASE6_TRANSLATED_STORE_FIXTURE)
extern "C" void func_80001000(CpuContext* ctx);
#endif
#if defined(NSMB_PHASE5_TRANSLATED_LOAD_FIXTURE) || defined(NSMB_PHASE6_TRANSLATED_STORE_FIXTURE)
#include "translator-fixture/include/memory.h"
#endif
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif
extern "C" {
uint32_t nsmbw_interop_step(uint32_t source, uint32_t destination, uint32_t addend);
uint32_t nsmbw_interop_status();
uint32_t nsmbw_mem_read32(uint32_t address);
int nsmbw_mem_error();
void nsmbw_interop_reset();
#ifdef W03_HAS_W07_RETRY_METADATA
// Optional ABI from independently developed W07 phase 3, when linked explicitly.
uint32_t nsmbw_interop_retry_safe();
uint32_t nsmbw_interop_device_invoked();
#endif
}
namespace {
constexpr uint32_t CAPACITY = 8, MAX_OPS = 32, TRACE_SIZE = 256;
constexpr uint32_t READY=1, PAUSED=2, DONE=3, FAULT=4, CANCELLED=5;
struct Context {
  uint32_t id=0, state=0, pc=0, limit=0, source=0, destination=0, addend=0;
  uint32_t regA=0, yields=0, error=0, retrySafe=1;
  uint32_t kind=0; // 0 previous W03 synthetic interop, 1 synthetic PPC call ABI
  SyntheticCpu::State cpu{};
  // Private W16 native-only service authority. Never marshalled into JS.
  uint64_t serviceOwner=0, outstandingService=0;
};
std::array<Context,CAPACITY> tasks{};
std::array<uint32_t,TRACE_SIZE> trace{};
uint32_t cursor=0, traceCount=0, traceStart=0, traceDropped=0, lastError=0;
// A global epoch invalidates all old capabilities even across reset/reap or
// 32-bit guest ID recycling. Integer exhaustion permanently fails closed.
uint64_t serviceEpoch=1, serviceSerial=1;
bool serviceExhausted=false, dispatching=false, serviceExecuting=false;
uint64_t nextServiceSerial() noexcept {
  if(serviceExhausted || serviceSerial==UINT64_MAX) {
    serviceExhausted=true;return 0;
  }
  return ++serviceSerial;
}
struct DispatchScope final {
  DispatchScope() noexcept {dispatching=true;}
  ~DispatchScope() noexcept {dispatching=false;}
};
// Conservative current-W07 fallback: a guest device address might already
// have caused side effects before a later checked RAM allocation fails.
// W04 cached/uncached addresses are aliases of the SAME physical guest bytes.
// Preflight all CPU guest memory reservations before accepting new contexts.
// uint64 arithmetic avoids overflow when comparing 32-bit guest ranges.
bool guestOrdinaryRam(uint32_t addr,uint32_t size) {
  if((addr&0xC0000000u)==0x40000000u)return false;
  const uint64_t begin=static_cast<uint64_t>(addr&0x3FFFFFFFu);
  const uint64_t end=begin+size;
  return end<=0x01800000ull ||
         (begin>=0x10000000ull && end<=0x18000000ull);
}
bool guestRegionsOverlap(uint32_t addrA,uint32_t lenA,uint32_t addrB,uint32_t lenB) {
  // Exclusive range reservations apply to W04 MEM1/MEM2 RAM ONLY.
  // MMIO/GX is a device operation: multiple guests may address the SAME
  // register/FIFO, with failures handled by W07 per guest, not preflight.
  if(!guestOrdinaryRam(addrA,lenA) || !guestOrdinaryRam(addrB,lenB))
    return false;
  const uint64_t a=static_cast<uint64_t>(addrA&0x3FFFFFFFu);
  const uint64_t b=static_cast<uint64_t>(addrB&0x3FFFFFFFu);
  return a<b+lenB && b<a+lenA;
}
bool mayTouchDevice(uint32_t address) {
  const uint64_t begin=address, end=begin+4u;
  return begin<0xCE000000ull && end>0xCC000000ull;
}
uint32_t retrySafeForFault(uint32_t source,uint32_t destination) {
  const bool unsafeAddress=mayTouchDevice(source)||mayTouchDevice(destination);
#ifdef W03_HAS_W07_RETRY_METADATA
  // W07 global metadata MUST be consumed immediately after the failing step,
  // before any other checked access or context switch resets it.
  return !unsafeAddress && nsmbw_interop_retry_safe()==1u &&
         nsmbw_interop_device_invoked()==0u ? 1u : 0u;
#else
  return unsafeAddress ? 0u : 1u;
#endif
}
void appendTrace(uint32_t event) {
  if(traceCount<trace.size()){
    trace[(traceStart+traceCount)%TRACE_SIZE]=event;
    ++traceCount;
  } else {
    trace[traceStart]=event;
    traceStart=(traceStart+1)%TRACE_SIZE;
    ++traceDropped;
  }
}
Context* find(uint32_t id) {
  if (!id) return nullptr;
  for (auto& t:tasks) if (t.id==id) return &t;
  return nullptr;
}
uint32_t count(uint32_t state) {
  uint32_t n=0;for (const auto& t:tasks) if(t.id&&t.state==state) ++n;return n;
}
}
// The C++ service API is intentionally outside extern "C" + EXPORT. JS does
// not receive a ticket factory, pointer, context setter or HLE override.
namespace nsmbw::trusted_cpu {
Ticket leaseSynthetic(uint32_t guest) noexcept {
  auto* t=find(guest);
  if(!t || t->kind!=1 || t->state!=READY || dispatching ||
     serviceExecuting || serviceExhausted || !t->serviceOwner)return {};
  const uint64_t serial=nextServiceSerial();
  if(!serial)return {};
  t->outstandingService=serial; // all previous tickets now invalid
  return Ticket{guest,serviceEpoch,t->serviceOwner,serial};
}
Status publishSyntheticPair(Ticket& ticket,uint32_t expectedPc,
                            uint64_t ticks) noexcept {
  // Fail closed: every attempt consumes its caller-side ticket, including
  // wrong-PC, reentrant, unsupported and stale attempts. A valid in-flight
  // ticket also retires globally BEFORE checking mutable guest state so
  // copies cannot be replayed after a failed authorization attempt.
  const uint64_t offeredSerial=ticket.serial_;
  ticket.serial_=0;
  const bool busy=dispatching || serviceExecuting;
  if(!ticket.guest_ || !offeredSerial)
    return busy ? Status::executing : Status::invalidTicket;
  auto* t=find(ticket.guest_);
  const bool authorized=t && ticket.epoch_==serviceEpoch &&
     !serviceExhausted && t->serviceOwner==ticket.owner_ &&
     t->outstandingService==offeredSerial && t->serviceOwner!=0;
  // Retire a valid ticket EVEN when a separate guest is dispatching.
  // An MMIO callback must not leave replayable copies for later use.
  if(authorized)t->outstandingService=0;
  if(busy)return Status::executing;
  if(!authorized)return Status::stale;
  if(t->state!=READY || t->kind!=1)return Status::notReady;
  if(t->cpu.pc!=expectedPc)return Status::pcMismatch;
  serviceExecuting=true;
  // No checked memory/device calls. Exactly two GPR writes in one native
  // operation; neither PC nor stack advances. Checked RAM unchanged.
  t->cpu.gpr[3]=static_cast<uint32_t>(ticks>>32u);
  t->cpu.gpr[4]=static_cast<uint32_t>(ticks);
  serviceExecuting=false;
  return Status::ok;
}
#ifdef NSMB_PHASE16_TRUSTED_CPU_TEST
Ticket forgeForNativeTest(uint32_t guest,uint64_t epoch,
                          uint64_t owner,uint64_t serial) noexcept {
  return Ticket{guest,epoch,owner,serial};
}
#endif
}
extern "C" {
void EXPORT nsmbw_loop_reset() {
  // A synchronous W07 device callback cannot tear down a running guest.
  if(dispatching || serviceExecuting){lastError=8;return;}
  // Do not reset the authority serial/epoch to a previously valid value.
  if(serviceEpoch==UINT64_MAX)serviceExhausted=true;
  else ++serviceEpoch;
  nsmbw_interop_reset();tasks={};trace={};cursor=traceCount=traceStart=traceDropped=lastError=0;
}
uint32_t EXPORT nsmbw_loop_error() {return lastError;}
int EXPORT nsmbw_loop_spawn(uint32_t id,uint32_t src,uint32_t dst,uint32_t delta,uint32_t limit) {
  if(dispatching || serviceExecuting){lastError=8;return 0;}
  lastError=0;
  if(!id||id>0xFFFFu||!limit||limit>MAX_OPS||find(id)){lastError=1;return 0;}
  for(auto& t:tasks) if(!t.id) {
    t={id,READY,0,limit,src,dst,delta,0,0,0,1};return 1;
  }
  lastError=2;return 0;
}
// Additive W03 phase4 spawn: same round-robin scheduler, same W04/W07 RAM.
int EXPORT nsmbw_loop_cpu_spawn(uint32_t id,uint32_t entry,uint32_t stackTop,
                               uint32_t inputGuest,uint32_t outputGuest,uint32_t salt) {
  if(dispatching || serviceExecuting){lastError=8;return 0;}
  lastError=0;
  if(!id||id>0xFFFFu||find(id)){lastError=1;return 0;}
  SyntheticCpu::State s{};
  if(!SyntheticCpu::initialize(s,entry,stackTop,inputGuest,outputGuest,salt)){
    lastError=1;return 0;
  }
  const uint32_t stackBase=s.stackTop-16u;
  // A checked write may succeed yet corrupt the input packet, another
  // context's frame or its output. Validate the physical alias ownership
  // BEFORE spawning. Shared read-only input is allowed; writable output
  // or stack must never overlap any other reserved word.
  if(guestRegionsOverlap(stackBase,16,inputGuest,4) ||
     guestRegionsOverlap(stackBase,16,outputGuest,4) ||
     guestRegionsOverlap(inputGuest,4,outputGuest,4)) {
    lastError=1;return 0;
  }
  for(const auto& existing:tasks)if(existing.id&&existing.kind!=0) {
    const uint32_t theirStack=existing.cpu.stackTop-16u;
    const uint32_t theirInput=existing.cpu.inputGuest;
    const uint32_t theirOutput=existing.cpu.outputGuest;
    if(guestRegionsOverlap(stackBase,16,theirStack,16) ||
       guestRegionsOverlap(stackBase,16,theirInput,4) ||
       guestRegionsOverlap(stackBase,16,theirOutput,4) ||
       guestRegionsOverlap(inputGuest,4,theirStack,16) ||
       guestRegionsOverlap(inputGuest,4,theirOutput,4) ||
       guestRegionsOverlap(outputGuest,4,theirStack,16) ||
       guestRegionsOverlap(outputGuest,4,theirInput,4) ||
       guestRegionsOverlap(outputGuest,4,theirOutput,4)) {
      lastError=1;return 0;
    }
  }
  for(auto& t:tasks)if(!t.id){
    t=Context{};
    const auto owner=nextServiceSerial();
    if(!owner){lastError=8;return 0;}
    t.id=id;t.state=READY;t.limit=32;t.retrySafe=1;t.kind=1;t.cpu=s;
    t.serviceOwner=owner;
    return 1;
  }
  lastError=2;return 0;
}
// Source-translator ABI-shaped initialization. The actual compiler emits
// extern "C" void f(CpuContext*), not a direct integer function. These
// initializer values are per-context, not global persistent Wii state.
// feature bit0=FPR, bit1=paired-single, bit2=GQR/quantized: explicitly reject
// until the complete corresponding runtime semantics are implemented.
int EXPORT nsmbw_loop_cpu_spawn_abi(uint32_t id,uint32_t entry,uint32_t stackTop,
  uint32_t inputGuest,uint32_t outputGuest,uint32_t salt,
  uint32_t sda2,uint32_t sda1,uint32_t featureMask) {
  if(dispatching || serviceExecuting){lastError=8;return 0;}
  if(featureMask) {lastError=8;return 0;}
  if(!nsmbw_loop_cpu_spawn(id,entry,stackTop,inputGuest,outputGuest,salt))
    return 0;
  auto* t=find(id);
  t->cpu.gpr[2]=sda2;
  t->cpu.gpr[13]=sda1;
  return 1;
}
#if defined(NSMB_PHASE5_TRANSLATED_FIXTURE)
// Test-only: invoke REAL C# translator-generated C++ (2 synthetic PPC
// instructions) through exact CpuContext* baseline ABI, one host dispatch.
int EXPORT nsmbw_loop_translated_spawn(uint32_t id,uint32_t stackTop,
                                     uint32_t initialR3,uint32_t sda2,uint32_t sda1) {
  if(dispatching || serviceExecuting){lastError=8;return 0;}
  // Reuse complete physical guest RAM ownership validation of normal W03.
  if(!nsmbw_loop_cpu_spawn(id,SyntheticCpu::Entry,stackTop,
                           0x80004000u,0x80008000u+id*0x1000u,0u))
    return 0;
  auto* t=find(id);
  t->kind=2;
  t->cpu.pc=0x80001000u;
  t->cpu.gpr[3]=initialR3;
  t->cpu.gpr[2]=sda2;t->cpu.gpr[13]=sda1;
  return 1;
}
#endif
#ifdef NSMB_PHASE5_TRANSLATED_LOAD_FIXTURE
// Another TEST-ONLY real-generated two-instruction PPC fixture:
// lwz r3,0(r4); blr. The inputGuest is a checked 32-bit W04/W07 address,
// never a native pointer. No side-effectful guest memory writes emitted.
int EXPORT nsmbw_loop_translated_load_spawn(uint32_t id,uint32_t stackTop,
    uint32_t inputGuest,uint32_t sda2,uint32_t sda1) {
  if(dispatching || serviceExecuting){lastError=8;return 0;}
  if(!nsmbw_loop_cpu_spawn(id,SyntheticCpu::Entry,stackTop,
                          inputGuest,0x80008000u+id*0x1000u,0u))
    return 0;
  auto* t=find(id);
  t->kind=2;
  t->cpu.pc=0x80001000u;
  t->cpu.gpr[3]=0xDEADBEEFu;
  t->cpu.gpr[2]=sda2;t->cpu.gpr[13]=sda1;
  return 1;
}
#endif
#ifdef NSMB_PHASE6_TRANSLATED_STORE_FIXTURE
// TEST ONLY: actual Translator.Cli-generated two stw + inlined bl/blr.
// Writes are staged & checked using W07; snapshot fields hold original
// guest addresses irrespective of mutable PPC registers.
int EXPORT nsmbw_loop_translated_store_spawn(uint32_t id,uint32_t stackTop,
 uint32_t destinationA,uint32_t destinationB,uint32_t payload,
 uint32_t sda2,uint32_t sda1) {
  if(dispatching || serviceExecuting){lastError=8;return 0;}
 lastError=0;
 if(!id||id>0xFFFFu||find(id)||!guestOrdinaryRam(stackTop-16u,16u) ||
    (stackTop&15u)!=0u || stackTop<16u) {lastError=1;return 0;}
 const uint32_t base=stackTop-16u;
 if(guestRegionsOverlap(base,16u,destinationA,4u) ||
    guestRegionsOverlap(base,16u,destinationB,4u)) {
   lastError=1;return 0;
 }
 for(const auto& t:tasks)if(t.id&&t.kind!=0) {
   const uint32_t otherBase=t.cpu.stackTop-16u;
   if(guestRegionsOverlap(base,16u,otherBase,16u) ||
      guestRegionsOverlap(base,16u,t.cpu.inputGuest,4u) ||
      guestRegionsOverlap(base,16u,t.cpu.outputGuest,4u) ||
      guestRegionsOverlap(destinationA,4u,otherBase,16u) ||
      guestRegionsOverlap(destinationB,4u,otherBase,16u) ||
      guestRegionsOverlap(destinationA,4u,t.cpu.inputGuest,4u) ||
      guestRegionsOverlap(destinationB,4u,t.cpu.inputGuest,4u) ||
      guestRegionsOverlap(destinationA,4u,t.cpu.outputGuest,4u) ||
      guestRegionsOverlap(destinationB,4u,t.cpu.outputGuest,4u)) {
     lastError=1;return 0;
   }
 }
 SyntheticCpu::State cpu{};
 if(!SyntheticCpu::initialize(cpu,SyntheticCpu::Entry,stackTop,
     0x80004000u,0x80008000u,0u)) {lastError=1;return 0;}
 for(auto& t:tasks)if(!t.id) {
   t=Context{};t.id=id;t.state=READY;t.kind=3;t.limit=1;t.retrySafe=0;
   t.cpu=cpu;t.cpu.pc=0x80001000u;t.cpu.gpr[3]=payload;
   t.cpu.gpr[4]=destinationA;t.cpu.gpr[6]=destinationB;
   t.cpu.gpr[2]=sda2;t.cpu.gpr[13]=sda1;
   // Immutable RAM ownership, untouched by translated GPR changes.
   t.cpu.inputGuest=destinationA;t.cpu.outputGuest=destinationB;
   return 1;
 }
 lastError=2;return 0;
}
#endif
int EXPORT nsmbw_loop_suspend(uint32_t id) {
  if(dispatching || serviceExecuting){lastError=8;return 0;}
  lastError=0;auto* t=find(id);
  if(!t||t->state!=READY){lastError=3;return 0;}
  t->outstandingService=0;
  t->state=PAUSED;return 1;
}
int EXPORT nsmbw_loop_resume(uint32_t id) {
  if(dispatching || serviceExecuting){lastError=8;return 0;}
  lastError=0;auto* t=find(id);
  if(!t||t->state!=PAUSED){lastError=3;return 0;}
  t->state=READY;return 1;
}
int EXPORT nsmbw_loop_cancel(uint32_t id) {
  if(dispatching || serviceExecuting){lastError=8;return 0;}
  lastError=0;auto* t=find(id);
  if(!t||t->state==DONE||t->state==CANCELLED){lastError=3;return 0;}
  t->outstandingService=0;
  t->state=CANCELLED;return 1;
}
// Explicit cleanup: running/paused contexts cannot be destroyed behind a host frame.
// Trace remains historical; callers must pair recycled IDs with their own epoch.
int EXPORT nsmbw_loop_reap(uint32_t id) {
  if(dispatching || serviceExecuting){lastError=8;return 0;}
  lastError=0;auto* t=find(id);
  if(!t||(t->state!=DONE&&t->state!=FAULT&&t->state!=CANCELLED)) {
    lastError=3;return 0;
  }
  *t=Context{}; // all outstanding capabilities go stale
  return 1;
}
// Only quota error 3 is explicitly retryable after the host increases its
// sparse-page budget. Unsupported MMIO/device faults must remain rejected.
int EXPORT nsmbw_loop_retry_quota(uint32_t id) {
  if(dispatching || serviceExecuting){lastError=8;return 0;}
  lastError=0;auto* t=find(id);
  if(!t||t->state!=FAULT||t->error!=3u||t->retrySafe!=1u){lastError=3;return 0;}
  t->state=READY;
  t->error=0;
  return 1;
}
// One unit of scheduled guest work calls W07 compiled C++ checked function.
// Return ID dispatched, 0 exhausted, -1 all blocked, -2 invalid internal state.
int EXPORT nsmbw_loop_tick() {
  if(dispatching || serviceExecuting){lastError=8;return -2;}
  DispatchScope guard{};
  lastError=0;
  for(uint32_t offset=0;offset<CAPACITY;++offset) {
    const uint32_t index=(cursor+offset)%CAPACITY;
    auto& t=tasks[index];
    if(!t.id||t.state!=READY) continue;
    // A scheduled step invalidates outstanding host-issued service tickets.
    t.outstandingService=0;
    cursor=(index+1)%CAPACITY;
#ifdef NSMB_PHASE6_TRANSLATED_STORE_FIXTURE
    if(t.kind==3) {
      CpuContext candidate=static_cast<const CpuContext&>(t.cpu);
      MemoryInline::Begin();
      func_80001000(&candidate); // ORIGINAL PUBLIC translator C++ unmodified
      const bool committed=MemoryInline::Commit();
      if(!committed) {
        t.error=MemoryInline::Fault();
        t.retrySafe=MemoryInline::RetrySafe();
        t.state=FAULT;
        appendTrace((t.id<<16u)|0x8000u|t.pc);
        return static_cast<int>(t.id);
      }
      static_cast<CpuContext&>(t.cpu)=candidate;
      ++t.cpu.steps;t.cpu.pc=SyntheticCpu::Exit;t.regA=t.cpu.gpr[3];
      ++t.pc;t.state=DONE;
      appendTrace((t.id<<16u)|t.pc);
      return static_cast<int>(t.id);
    }
#endif
#if defined(NSMB_PHASE5_TRANSLATED_FIXTURE) || defined(NSMB_PHASE5_TRANSLATED_LOAD_FIXTURE)
    if(t.kind==2) {
      // Real C# translator output, not handwritten JS or fake CPU emulation.
      // This synthetic 2-instruction function has no memory or device calls.
#ifdef NSMB_PHASE5_TRANSLATED_LOAD_FIXTURE
      // Generated code itself is unmodified. Run it on a temporary
      // register context, then commit only on checked W07 success.
      // This transaction covers the *one synthetic read*, not arbitrary
      // generated funcs with writes/OS calls or other side effects.
      CpuContext candidate=static_cast<const CpuContext&>(t.cpu);
      MemoryInline::ResetError();
      func_80001000(&candidate);
      const uint32_t memoryError=MemoryInline::Fault();
      if(memoryError) {
        t.error=memoryError;
        t.retrySafe=MemoryInline::RetrySafe();
        t.state=FAULT;
        appendTrace((t.id<<16u)|0x8000u|t.pc);
        return static_cast<int>(t.id);
      }
      static_cast<CpuContext&>(t.cpu)=candidate;
#else
      func_80001000(static_cast<CpuContext*>(&t.cpu));
#endif
      ++t.cpu.steps;
      t.cpu.pc=SyntheticCpu::Exit;
      t.regA=t.cpu.gpr[3];
      ++t.pc;
      t.state=DONE;
      appendTrace((t.id<<16u)|t.pc);
      return static_cast<int>(t.id);
    }
#endif
    if(t.kind==1){
      const auto outcome=SyntheticCpu::step(t.cpu);
      if(!outcome.ok){
        t.error=outcome.error;
        t.retrySafe=outcome.retrySafe;
        t.state=FAULT;
        appendTrace((t.id<<16u)|0x8000u|t.pc);
        return static_cast<int>(t.id);
      }
      t.regA=t.cpu.gpr[3];
      ++t.pc; // count synthetic instructions, CPU.pc is actual guest call address
      if(outcome.done)t.state=DONE;
      else ++t.yields;
      appendTrace((t.id<<16u)|t.pc);
      return static_cast<int>(t.id);
    }
    if(!nsmbw_interop_step(t.source,t.destination,t.addend)) {
      t.error=nsmbw_interop_status();
      t.retrySafe=retrySafeForFault(t.source,t.destination);
      if(!t.error) t.error=1; // do not silently accept invalid W07 ABI
      t.state=FAULT;
      appendTrace((t.id<<16u)|0x8000u|t.pc);
      return static_cast<int>(t.id);
    }
    const uint32_t result=nsmbw_mem_read32(t.destination);
    const int error=nsmbw_mem_error();
    if(error) {
      t.error=static_cast<uint32_t>(error);
      t.retrySafe=0; // guest write already succeeded; do not replay side effects
      t.state=FAULT;
      appendTrace((t.id<<16u)|0x8000u|t.pc);
      return static_cast<int>(t.id);
    }
    t.regA=result;
    t.source=t.destination;
    t.destination+=4u; // next W07 check catches invalid address/wrap
    ++t.pc;
    if(t.pc==t.limit)t.state=DONE;
    else ++t.yields;
    appendTrace((t.id<<16u)|t.pc);
    return static_cast<int>(t.id);
  }
  return count(PAUSED)+count(FAULT)?-1:0;
}
int EXPORT nsmbw_loop_frame(uint32_t budget) {
  if(!budget||budget>64){lastError=1;return -2;}
  for(uint32_t n=0;n<budget;++n) {
    const int id=nsmbw_loop_tick();
    if(id==-2)return -2;
    if(id<=0)return static_cast<int>(n);
  }
  return static_cast<int>(budget);
}
uint32_t EXPORT nsmbw_loop_state(uint32_t id) {auto*t=find(id);return t?t->state:0;}
uint32_t EXPORT nsmbw_loop_pc(uint32_t id) {auto*t=find(id);return t?(t->kind!=0?t->cpu.pc:t->pc):0;}
uint32_t EXPORT nsmbw_loop_cpu_steps(uint32_t id) {auto*t=find(id);return t&&t->kind!=0?t->cpu.steps:0;}
uint32_t EXPORT nsmbw_loop_cpu_gpr(uint32_t id,uint32_t index) {
  auto*t=find(id);return t&&t->kind!=0&&index<32?t->cpu.gpr[index]:0;
}
uint32_t EXPORT nsmbw_loop_cpu_lr(uint32_t id){auto*t=find(id);return t&&t->kind!=0?t->cpu.lr:0;}
uint32_t EXPORT nsmbw_loop_cpu_ctr(uint32_t id){auto*t=find(id);return t&&t->kind!=0?t->cpu.ctr:0;}
uint32_t EXPORT nsmbw_loop_cpu_cr(uint32_t id){auto*t=find(id);return t&&t->kind!=0?t->cpu.cr:0;}
uint32_t EXPORT nsmbw_loop_cpu_xer(uint32_t id){auto*t=find(id);return t&&t->kind!=0?t->cpu.xer:0;}
uint32_t EXPORT nsmbw_loop_cpu_fpscr(uint32_t id){auto*t=find(id);return t&&t->kind!=0?t->cpu.fpscr:0;}
uint32_t EXPORT nsmbw_loop_cpu_gqr(uint32_t id,uint32_t index) {
  auto*t=find(id);return t&&t->kind!=0&&index<8?t->cpu.gqr[index]:0;
}
// Public translator's canonical C++ context: versioned observables for
// independent test/ABI review. Never expose host pointers into Wasm JS.
uint32_t EXPORT nsmbw_loop_cpu_abi_layout(uint32_t field) {
  switch(field) {
    case 0:return static_cast<uint32_t>(sizeof(CpuContext));
    case 1:return static_cast<uint32_t>(alignof(CpuContext));
    case 2:return static_cast<uint32_t>(offsetof(CpuContext,gpr));
    case 3:return static_cast<uint32_t>(offsetof(CpuContext,cr));
    case 4:return static_cast<uint32_t>(offsetof(CpuContext,lr));
    case 5:return static_cast<uint32_t>(offsetof(CpuContext,ctr));
    case 6:return static_cast<uint32_t>(offsetof(CpuContext,xer));
    case 7:return static_cast<uint32_t>(offsetof(CpuContext,fpscr));
    case 8:return static_cast<uint32_t>(offsetof(CpuContext,pc));
    case 9:return static_cast<uint32_t>(offsetof(CpuContext,fpr));
    case 10:return static_cast<uint32_t>(offsetof(CpuContext,gqr));
    case 11:return static_cast<uint32_t>(offsetof(CpuContext,hid0));
    case 12:return static_cast<uint32_t>(offsetof(CpuContext,msr));
    default:return UINT32_MAX;
  }
}
uint32_t EXPORT nsmbw_loop_reg_a(uint32_t id) {auto*t=find(id);return t?t->regA:0;}
uint32_t EXPORT nsmbw_loop_guest_error(uint32_t id) {auto*t=find(id);return t?t->error:0;}
uint32_t EXPORT nsmbw_loop_retry_safe(uint32_t id) {auto*t=find(id);return t?t->retrySafe:0;}
uint32_t EXPORT nsmbw_loop_yields(uint32_t id) {auto*t=find(id);return t?t->yields:0;}
uint32_t EXPORT nsmbw_loop_ready(){return count(READY);}
uint32_t EXPORT nsmbw_loop_paused(){return count(PAUSED);}
uint32_t EXPORT nsmbw_loop_done(){return count(DONE);}
uint32_t EXPORT nsmbw_loop_faulted(){return count(FAULT);}
uint32_t EXPORT nsmbw_loop_cancelled(){return count(CANCELLED);}
uint32_t EXPORT nsmbw_loop_trace_length(){return traceCount;}
uint32_t EXPORT nsmbw_loop_trace_dropped(){return traceDropped;}
uint32_t EXPORT nsmbw_loop_trace_at(uint32_t index){
  if(index>=traceCount){lastError=1;return 0;}
  lastError=0;return trace[(traceStart+index)%TRACE_SIZE];
}
}
