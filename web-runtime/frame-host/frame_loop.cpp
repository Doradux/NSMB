// W03 phase 2: synthetic cooperative contexts invoke W07 checked RAM.
// No Nintendo code or actual stackful Wii fibers. The host owns frame boundaries.
#include <array>
#include <cstdint>
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
}
namespace {
constexpr uint32_t CAPACITY = 8, MAX_OPS = 32, TRACE_SIZE = 256;
constexpr uint32_t READY=1, PAUSED=2, DONE=3, FAULT=4, CANCELLED=5;
struct Context {
  uint32_t id=0, state=0, pc=0, limit=0, source=0, destination=0, addend=0;
  uint32_t regA=0, yields=0, error=0;
};
std::array<Context,CAPACITY> tasks{};
std::array<uint32_t,TRACE_SIZE> trace{};
uint32_t cursor=0, traceCount=0, traceStart=0, traceDropped=0, lastError=0;
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
extern "C" {
void EXPORT nsmbw_loop_reset() {
  nsmbw_interop_reset();tasks={};trace={};cursor=traceCount=traceStart=traceDropped=lastError=0;
}
uint32_t EXPORT nsmbw_loop_error() {return lastError;}
int EXPORT nsmbw_loop_spawn(uint32_t id,uint32_t src,uint32_t dst,uint32_t delta,uint32_t limit) {
  lastError=0;
  if(!id||id>0xFFFFu||!limit||limit>MAX_OPS||find(id)){lastError=1;return 0;}
  for(auto& t:tasks) if(!t.id) {
    t={id,READY,0,limit,src,dst,delta,0,0,0};return 1;
  }
  lastError=2;return 0;
}
int EXPORT nsmbw_loop_suspend(uint32_t id) {
  lastError=0;auto* t=find(id);
  if(!t||t->state!=READY){lastError=3;return 0;}
  t->state=PAUSED;return 1;
}
int EXPORT nsmbw_loop_resume(uint32_t id) {
  lastError=0;auto* t=find(id);
  if(!t||t->state!=PAUSED){lastError=3;return 0;}
  t->state=READY;return 1;
}
int EXPORT nsmbw_loop_cancel(uint32_t id) {
  lastError=0;auto* t=find(id);
  if(!t||t->state==DONE||t->state==CANCELLED){lastError=3;return 0;}
  t->state=CANCELLED;return 1;
}
// Explicit cleanup: running/paused contexts cannot be destroyed behind a host frame.
// Trace remains historical; callers must pair recycled IDs with their own epoch.
int EXPORT nsmbw_loop_reap(uint32_t id) {
  lastError=0;auto* t=find(id);
  if(!t||(t->state!=DONE&&t->state!=FAULT&&t->state!=CANCELLED)) {
    lastError=3;return 0;
  }
  *t=Context{};
  return 1;
}
// Only quota error 3 is explicitly retryable after the host increases its
// sparse-page budget. Unsupported MMIO/device faults must remain rejected.
int EXPORT nsmbw_loop_retry_quota(uint32_t id) {
  lastError=0;auto* t=find(id);
  if(!t||t->state!=FAULT||t->error!=3u){lastError=3;return 0;}
  t->state=READY;
  t->error=0;
  return 1;
}
// One unit of scheduled guest work calls W07 compiled C++ checked function.
// Return ID dispatched, 0 exhausted, -1 all blocked, -2 invalid internal state.
int EXPORT nsmbw_loop_tick() {
  lastError=0;
  for(uint32_t offset=0;offset<CAPACITY;++offset) {
    const uint32_t index=(cursor+offset)%CAPACITY;
    auto& t=tasks[index];
    if(!t.id||t.state!=READY) continue;
    cursor=(index+1)%CAPACITY;
    if(!nsmbw_interop_step(t.source,t.destination,t.addend)) {
      t.error=nsmbw_interop_status();
      if(!t.error) t.error=1; // do not silently accept invalid W07 ABI
      t.state=FAULT;
      appendTrace((t.id<<16u)|0x8000u|t.pc);
      return static_cast<int>(t.id);
    }
    const uint32_t result=nsmbw_mem_read32(t.destination);
    const int error=nsmbw_mem_error();
    if(error) {
      t.error=static_cast<uint32_t>(error);
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
uint32_t EXPORT nsmbw_loop_pc(uint32_t id) {auto*t=find(id);return t?t->pc:0;}
uint32_t EXPORT nsmbw_loop_reg_a(uint32_t id) {auto*t=find(id);return t?t->regA:0;}
uint32_t EXPORT nsmbw_loop_guest_error(uint32_t id) {auto*t=find(id);return t?t->error:0;}
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
