// Copyright-free PHASE16 native integration QA. Links the ACTUAL frame_loop.cpp,
// guest_cpu.cpp, W04/W07 and input service; no real Wii code or HLE hooks.
#include "../../../web-runtime/frame-host/trusted_cpu_service.hpp"
#include "../../../web-runtime/interop/device_policy.hpp"
#include <cstdlib>
#include <iostream>
#include <cstdint>
#include <type_traits>
using nsmbw::trusted_cpu::Status;
using nsmbw::trusted_cpu::Ticket;
using nsmbw::trusted_cpu::leaseSynthetic;
using nsmbw::trusted_cpu::publishSyntheticPair;
using nsmbw::trusted_cpu::forgeForNativeTest;
static_assert(!std::is_constructible_v<Ticket,uint32_t,uint64_t,uint64_t,uint64_t>,
              "Native guest code cannot create an arbitrary ticket");
static_assert(std::is_trivially_copyable_v<Ticket>,
              "Ticket snapshots support deterministic stale-replay tests");
extern "C" {
void nsmbw_loop_reset();
int nsmbw_loop_cpu_spawn(uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t);
int nsmbw_loop_frame(uint32_t);
int nsmbw_loop_tick();
uint32_t nsmbw_loop_state(uint32_t);
uint32_t nsmbw_loop_pc(uint32_t);
uint32_t nsmbw_loop_cpu_gpr(uint32_t,uint32_t);
uint32_t nsmbw_loop_cpu_lr(uint32_t);
uint32_t nsmbw_loop_cpu_steps(uint32_t);
int nsmbw_loop_suspend(uint32_t);
int nsmbw_loop_resume(uint32_t);
int nsmbw_loop_cancel(uint32_t);
int nsmbw_loop_reap(uint32_t);
uint32_t nsmbw_mem_pages();
int nsmbw_mem_set_page_budget(uint32_t);
uint32_t nsmbw_mem_read32(uint32_t);
int nsmbw_mem_write32(uint32_t,uint32_t);
uint32_t nsmbw_loop_guest_error(uint32_t);
}
namespace {
int count=0;
void check(bool ok,const char* detail) {
  if(!ok){std::cerr<<"FAIL "<<detail<<'\n';std::exit(2);}
  std::cout<<"PASS "<<detail<<'\n';++count;
}
constexpr uint32_t ENTRY=0x80010000u, EXIT=0x8001FFF0u;
int spawn(uint32_t id,uint32_t input=0x80004000u) {
  return nsmbw_loop_cpu_spawn(id,ENTRY,0x80005010u+id*0x1000u,
                              input,0x8000C000u+id*0x1000u,0u);
}
Status reentryStatus=Status::ok;
Ticket deviceLease{};
bool callbackResetBlocked=false;
int callbackCancel=99, callbackSpawn=99, callbackNestedTick=99;
NSMBDevice::Reply onDevice(NSMBDevice::Region,NSMBDevice::Operation,
                          uint32_t,uint32_t,uint32_t) noexcept {
  reentryStatus=publishSyntheticPair(deviceLease,ENTRY+8u,0xF0E0D0C0B0A09080ULL);
  nsmbw_loop_reset();
  callbackResetBlocked=nsmbw_loop_state(1)==1 && nsmbw_loop_pc(1)==ENTRY+8u;
  callbackCancel=nsmbw_loop_cancel(1);
  callbackSpawn=spawn(3);
  callbackNestedTick=nsmbw_loop_tick();
  return {NSMBDevice::Result::Rejected,0};
}
}
int main(){
  nsmbw_loop_reset();
  check(spawn(1)==1,"real W03 slot1 created");
  check(spawn(2)==1,"real W03 slot2 created");
  check(nsmbw_loop_state(1)==1&&nsmbw_loop_state(2)==1,"two guests READY");
  auto a=leaseSynthetic(1);
  auto oldA=a;
  auto b=leaseSynthetic(2);
  auto bogus=Ticket{};
  check(publishSyntheticPair(bogus,ENTRY,7)==Status::invalidTicket,
        "default bogus token denied");
  auto forged=forgeForNativeTest(1,0,0,0);
  check(publishSyntheticPair(forged,ENTRY,7)==Status::invalidTicket,
        "forged blank ticket denied");
  forged=forgeForNativeTest(1,0,UINT64_MAX,UINT64_MAX);
  check(publishSyntheticPair(forged,ENTRY,7)==Status::stale,
        "forged nonempty ticket denied");
  check(publishSyntheticPair(a,ENTRY+4u,7)==Status::pcMismatch,
        "wrong expected PC denies before mutation");
  check(nsmbw_loop_cpu_gpr(1,3)==0&&nsmbw_loop_cpu_gpr(1,4)==0x80004000u,
        "wrong PC leaves both GPR3/GPR4 unchanged");
  check(nsmbw_loop_cpu_lr(1)==EXIT&&nsmbw_loop_pc(1)==ENTRY,
        "wrong PC preserves LR and PC");
  check(nsmbw_loop_cpu_gpr(1,1)==0x80006010u,"wrong PC preserves stack");
  check(nsmbw_mem_pages()==0,"wrong PC does not allocate guest RAM");
  check(nsmbw_mem_write32(0x80011000u,0xAABBCCDDu)==1,
        "seed authentic W04 word for mutation negative oracle");
  check(publishSyntheticPair(a,ENTRY+8u,42)==Status::pcMismatch &&
        nsmbw_mem_read32(0xC0011000u)==0xAABBCCDDu,
        "wrong PC cannot change existing checked guest RAM word");
  // Issuing replacement token invalidates previous ticket without touching CPU.
  auto newer=leaseSynthetic(1);
  check(publishSyntheticPair(a,ENTRY,0)==Status::stale,
        "older lease denied after newer issuance");
  check(publishSyntheticPair(newer,ENTRY,0x100000002ULL)==Status::ok,
        "trusted service commits synthetic time pair into REAL scheduler CPU");
  check(nsmbw_loop_cpu_gpr(1,3)==1&&nsmbw_loop_cpu_gpr(1,4)==2,
        "upper32 exactly GPR3, lower32 exactly GPR4");
  check(nsmbw_loop_cpu_gpr(1,1)==0x80006010u &&
        nsmbw_loop_cpu_lr(1)==EXIT && nsmbw_loop_pc(1)==ENTRY,
        "successful register pair commit does NOT move PC/LR/SP");
  check(nsmbw_mem_pages()==1 && nsmbw_loop_cpu_steps(1)==0,
        "register-only publish cannot allocate EXTRA memory or run guest step");
  check(publishSyntheticPair(newer,ENTRY,9)==Status::invalidTicket,
        "same ticket cannot replay twice");
  check(publishSyntheticPair(oldA,ENTRY,9)==Status::stale,
        "pre-replacement duplicate token cannot replay");
  check(nsmbw_loop_cpu_gpr(1,3)==1&&nsmbw_loop_cpu_gpr(1,4)==2,
        "failed replays leave committed GPRs untouched");
  check(nsmbw_loop_cpu_gpr(2,3)==0&&nsmbw_loop_cpu_gpr(2,4)==0x80004000u,
        "guest2 remains isolated from guest1");
  check(publishSyntheticPair(b,ENTRY,0xFFFFFFFFFFFFFFFFULL)==Status::ok,
        "guest2 accepts distinct full64 value");
  check(nsmbw_loop_cpu_gpr(2,3)==UINT32_MAX&&nsmbw_loop_cpu_gpr(2,4)==UINT32_MAX,
        "uint64 max split lossless");

  auto suspendTicket=leaseSynthetic(1);
  check(nsmbw_loop_suspend(1)==1,"suspend actual W03 guest");
  check(publishSyntheticPair(suspendTicket,ENTRY,10)==Status::stale ||
        publishSyntheticPair(suspendTicket,ENTRY,10)==Status::notReady,
        "suspended ticket denied with no CPU mutation");
  check(nsmbw_loop_resume(1)==1,"resume real W03 guest");
  check(publishSyntheticPair(suspendTicket,ENTRY,10)!=Status::ok,
        "old ticket remains invalid after resume");
  auto fresh=leaseSynthetic(1);
  check(publishSyntheticPair(fresh,ENTRY,0xFFFFFFFF00000000ULL)==Status::ok,
        "new ticket after resume can publish");
  check(nsmbw_loop_cpu_gpr(1,3)==UINT32_MAX &&
        nsmbw_loop_cpu_gpr(1,4)==0,
        "full64 split high32 preserved, low32 zero");

  auto preStep=leaseSynthetic(1);
  check(nsmbw_loop_frame(1)==1,"actual W03 CPU instruction step");
  check(nsmbw_loop_pc(1)==ENTRY+4u,"W03 PC advances one instruction");
  check(publishSyntheticPair(preStep,ENTRY,9)==Status::stale,
        "scheduler tick invalidates outstanding capability");
  check(nsmbw_mem_pages()>0,"actual W03 stwu touched checked guest RAM");
  auto afterStep=leaseSynthetic(1);
  check(publishSyntheticPair(afterStep,ENTRY,0)==Status::pcMismatch,
        "old PC denied after scheduled CPU transition");
  check(publishSyntheticPair(afterStep,ENTRY+4u,0xABCDEF0102030405ULL)==Status::ok,
        "current expectedPC can commit new register pair");
  check(nsmbw_loop_pc(1)==ENTRY+4u,"successful service preserves current PC");
  check(nsmbw_loop_cpu_gpr(1,3)==0xABCDEF01u &&
        nsmbw_loop_cpu_gpr(1,4)==0x02030405u,
        "new full64 pair committed atomically at current PC");

  auto beforeReset=leaseSynthetic(1);
  nsmbw_loop_reset();
  check(nsmbw_loop_state(1)==0 && nsmbw_mem_pages()==0,"real scheduler reset drops guests+pages");
  check(spawn(1)==1,"recycled same guest ID after reset");
  check(publishSyntheticPair(beforeReset,ENTRY,23)==Status::stale,
        "reset epoch prevents stale token controlling recycled ID");
  check(nsmbw_loop_cpu_gpr(1,3)==0&&nsmbw_loop_cpu_gpr(1,4)==0x80004000u,
        "failed stale token cannot mutate newly recycled guest");
  auto afterReset=leaseSynthetic(1);
  check(publishSyntheticPair(afterReset,ENTRY,0x200000005ULL)==Status::ok,
        "new epoch issues independent valid token");

  auto cancelled=leaseSynthetic(1);
  check(nsmbw_loop_cancel(1)==1,"cancel actual W03 guest");
  check(publishSyntheticPair(cancelled,ENTRY,23)!=Status::ok,"cancel invalidates service ticket");
  check(nsmbw_loop_reap(1)==1,"reap terminal W03 context");
  check(spawn(1)==1,"same guest ID after reap");
  check(publishSyntheticPair(cancelled,ENTRY,23)!=Status::ok,
        "reaped owner identity cannot control recreated guest");
  auto next=leaseSynthetic(1);
  check(publishSyntheticPair(next,ENTRY,42)==Status::ok,
        "fresh minted owner works after reap");

  nsmbw_loop_reset();
  check(spawn(1,0xCC007000u)==1,"synthetic MMIO source guest can be staged");
  check(nsmbw_loop_frame(2)==2,"advance W03 stack instruction two times");
  check(nsmbw_loop_pc(1)==ENTRY+8u,"guest about to perform checked MMIO read");
  deviceLease=leaseSynthetic(1);
  check(nsmbw_mem_set_page_budget(2)==1,"finite W04 RAM quota");
  NSMBDevice::install(NSMBDevice::Region::Mmio,onDevice);
  check(nsmbw_loop_frame(1)==1,"MMIO callback occurs INSIDE active scheduler tick");
  check(reentryStatus==Status::executing,
        "native callback cannot reenter trusted service during dispatch");
  check(callbackResetBlocked,"MMIO callback cannot RESET active W03 scheduler");
  check(callbackCancel==0,"MMIO callback cannot CANCEL running guest");
  check(callbackSpawn==0,"MMIO callback cannot SPAWN while dispatch busy");
  check(callbackNestedTick==-2,"MMIO callback cannot recursively TICK scheduler");
  check(nsmbw_loop_state(1)==4&&nsmbw_loop_guest_error(1)==5,
        "rejected MMIO remains fault, never fake success");
  check(nsmbw_loop_pc(1)==ENTRY+8u,"fault does not advance guest PC");
  check(nsmbw_loop_cpu_gpr(1,3)==0 &&
        nsmbw_loop_cpu_gpr(1,4)==0xCC007000u,
        "rejected callback never publishes forged synthetic time");
  check(publishSyntheticPair(deviceLease,ENTRY+8u,99)!=Status::ok,
        "token used during failed callback stays invalid");
  NSMBDevice::clear();

  // An unsupported MMIO and finite page quota do not allow escalation via
  // service. Failed/timed-out W03 guests cannot acquire tickets.
  auto faulted=leaseSynthetic(1);
  check(publishSyntheticPair(faulted,ENTRY+8u,99)!=Status::ok,
        "faulted guest cannot mint working service ticket");
  nsmbw_loop_reset();
  check(spawn(1)==1,"new guest ready for valid/malformed test");
  check(nsmbw_loop_suspend(1)==1,"pause before lease acquisition");
  auto paused=leaseSynthetic(1);
  check(publishSyntheticPair(paused,ENTRY,9)!=Status::ok,
        "paused guest cannot issue synthetic service lease");
  check(nsmbw_loop_resume(1)==1,"resume from pause");
  check(nsmbw_loop_state(1)==1,"restored guest ready");
  // Bounded deterministic authority stress: ID recycling through both
  // reset and reap must never make old tickets valid, even if their guest
  // ID and expected PC happen to match a newly created context.
  bool cyclesOk=true;
  for(unsigned round=0;round<128;++round){
    nsmbw_loop_reset();
    cyclesOk &= spawn(1)==1;
    auto stale=leaseSynthetic(1);
    cyclesOk &= publishSyntheticPair(stale,ENTRY,0x100000000ULL+round)==Status::ok;
    auto retired=stale;
    auto legitimate=leaseSynthetic(1);
    cyclesOk &= publishSyntheticPair(retired,ENTRY,0xBADULL)!=Status::ok;
    cyclesOk &= publishSyntheticPair(legitimate,ENTRY,0x300000000ULL+round)==Status::ok;
    cyclesOk &= nsmbw_loop_cpu_gpr(1,3)==3 &&
                nsmbw_loop_cpu_gpr(1,4)==round;
  }
  check(cyclesOk,"128 real W03 resets and recycled guest IDs never replay stale leases");
  std::cout<<"TOTAL_CHECKS "<<count<<'\n';
}
