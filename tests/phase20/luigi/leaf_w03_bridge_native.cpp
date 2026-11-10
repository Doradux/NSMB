// INTERMEDIATE Phase20: real native W03 Ticket authorizes atomic clock arm
// from a PURE invented PPC leaf value. This fixture does NOT test private
// ServiceId/quota yet, and does NOT run the leaf INSIDE W03's dispatcher.
#include "../../../scripts/phase20/luigi/toy_leaf_abi.hpp"
#include "../../../web-runtime/frame-host/scheduler_clock.hpp"
#include "../../../web-runtime/frame-host/trusted_cpu_service.hpp"
#include <cstdint>
#include <cstdlib>
#include <iostream>
extern "C" {
void nsmbw_loop_reset();
int nsmbw_loop_cpu_spawn(uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t);
int nsmbw_loop_tick();
int nsmbw_loop_cancel(uint32_t);
int nsmbw_loop_reap(uint32_t);
uint32_t nsmbw_loop_pc(uint32_t);
uint32_t nsmbw_loop_cpu_gpr(uint32_t,uint32_t);
uint32_t nsmbw_loop_clock_ticks_hi(uint32_t);
uint32_t nsmbw_loop_clock_ticks_lo(uint32_t);
uint32_t nsmbw_loop_clock_revision_lo(uint32_t);
uint32_t nsmbw_mem_pages();
}
namespace {
int count=0;
void check(bool b,const char* label){
  if(!b){std::cerr<<"FAIL "<<label<<"\n";std::exit(2);}
  std::cout<<"PASS "<<label<<"\n";++count;
}
constexpr uint32_t Entry=0x80010000u;
constexpr uint32_t input(uint32_t id){return 0x80003000u+id*0x1000u;}
constexpr uint32_t output(uint32_t id){return 0x80009000u+id*0x1000u;}
constexpr uint32_t stack(uint32_t id){return 0x8000E010u+id*0x1000u;}
bool spawn(uint32_t id){
  return nsmbw_loop_cpu_spawn(id,Entry,stack(id),input(id),
                             output(id),0x24u)==1;
}
uint64_t ticks(uint32_t id){
  return (uint64_t(nsmbw_loop_clock_ticks_hi(id))<<32)|
         nsmbw_loop_clock_ticks_lo(id);
}
}
int main(){
  using namespace nsmbw::trusted_cpu;
  using namespace nsmbw::p20::toy;
  nsmbw_loop_reset();
  check(spawn(1),"real native W03 owns separate guest id1");
  const auto before=clockNativeTestSnapshot(1);
  check(before.valid && before.cpu.pc==Entry &&
        before.clock.revision==0,"by-value W03 snapshot not live CpuContext ptr");
  const auto leaf=evaluate({0,Entry,before.cpu.gpr[3],
      before.cpu.lr,before.cpu.gpr[1],128});
  check(leaf.computed()&&leaf.gpr3==before.cpu.gpr[3]+18u&&
        leaf.returnPc==Entry+4u,
        "actual generated invented PPC leaf computes one candidate");
  check(nsmbw_loop_cpu_gpr(1,3)==before.cpu.gpr[3]&&ticks(1)==0u,
        "pure leaf does not mutate W03 CPU or clock");
  auto denied=leaseSynthetic(1);
  CanonicalClockPlan plan{uint64_t(leaf.gpr3),0u,leaf.gpr3,
      before.clock.epoch,before.clock.revision};
  check(armCanonicalClock(denied,Entry+4u,plan)==ClockArm::wrongPc,
        "native W03 private ticket rejects false expected PC");
  check(armCanonicalClock(denied,Entry,plan)==ClockArm::invalidTicket,
        "consumed incorrect PC cannot replay same private ticket");
  check(!inspectSyntheticClock(1).pending &&
        ticks(1)==0u&&nsmbw_loop_cpu_gpr(1,3)==before.cpu.gpr[3],
        "denial leaves real W03 clock and CPU unchanged");
  auto ticket=leaseSynthetic(1);
  check(armCanonicalClock(ticket,Entry,plan)==ClockArm::accepted,
        "only real W03 private ticket permits clock prepare");
  check(armCanonicalClock(ticket,Entry,plan)==ClockArm::invalidTicket,
        "repeated native Ticket cannot stage again");
  check(nsmbw_loop_pc(1)==Entry &&ticks(1)==0u &&
        nsmbw_loop_cpu_gpr(1,3)==before.cpu.gpr[3],
        "prepare did not partially commit GPR or clock");
  check(nsmbw_loop_tick()==1,
        "real W03 native round robin DISPATCHES clock transaction");
  const auto after=clockNativeTestSnapshot(1);
  check(after.valid &&ticks(1)==leaf.gpr3 &&
        nsmbw_loop_clock_revision_lo(1)==1u &&
        after.clock.committed &&!after.clock.pending,
        "single W03 canonical clock ledger update from leaf candidate");
  check(after.cpu.gpr[3]==0u &&after.cpu.gpr[4]==leaf.gpr3,
        "real W03 atomically publishes high/low tick GPR pair");
  check(after.cpu.pc==before.cpu.pc &&
        after.cpu.lr==before.cpu.lr &&
        after.cpu.gpr[1]==before.cpu.gpr[1],
        "clock commit cannot mutate PC/LR/SP");
  bool fprAndGqr=true;
  for(unsigned i=0;i<32;i++)fprAndGqr &= after.cpu.fpr[i].raw==before.cpu.fpr[i].raw;
  for(unsigned i=0;i<8;i++)fprAndGqr &= after.cpu.gqr[i]==before.cpu.gqr[i];
  check(fprAndGqr && nsmbw_mem_pages()==0,
        "FPR/GQR and checked RAM remain untouched");
  check(nsmbw_loop_cancel(1)==1 &&nsmbw_loop_reap(1)==1 &&spawn(1),
        "recycled guest id can be created only as NEW epoch/owner");
  const auto recycled=clockNativeTestSnapshot(1);
  check(recycled.clock.revision==0u &&ticks(1)==0u,
        "recycled guest starts new independent clock ledger");
  nsmbw_loop_reset();
  bool stress=true;
  for(unsigned i=0;i<128;i++){
    nsmbw_loop_reset();
    stress &= spawn(1);
    const auto state=clockNativeTestSnapshot(1);
    const auto candidate=evaluate({0,Entry,state.cpu.gpr[3]+i,state.cpu.lr,
                                   state.cpu.gpr[1],128});
    stress &= candidate.computed();
    const CanonicalClockPlan next{uint64_t(candidate.gpr3),0u,candidate.gpr3,
                                  state.clock.epoch,state.clock.revision};
    auto t=leaseSynthetic(1);
    stress &= armCanonicalClock(t,Entry,next)==ClockArm::accepted;
    stress &= nsmbw_loop_tick()==1;
    stress &= ticks(1)==candidate.gpr3;
    stress &= nsmbw_loop_clock_revision_lo(1)==1u;
  }
  check(stress,"128 real W03 resets/private ticket+leaf+clock cycles");
  std::cout<<"TOTAL_CHECKS "<<count<<"\n";
}
