// PHASE19 TOAD: source-native genuine W03/W04/W07 synthetic scheduler,
// NOT a production W03 dispatcher, original Wii HLE or browser service.
// This test explicitly invokes private W03 Ticket after pure computation.
#include "scheduler_clock.hpp"
#include "synthetic_service_dispatch.hpp"
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>
using namespace nsmbw::trusted_cpu;
using namespace nsmbw::p19::services;
extern "C" {
 void nsmbw_loop_reset();
 int nsmbw_loop_cpu_spawn(uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t);
 int nsmbw_loop_frame(uint32_t);
 int nsmbw_loop_suspend(uint32_t);
 int nsmbw_loop_suspend(uint32_t);
 uint32_t nsmbw_loop_pc(uint32_t);
 uint32_t nsmbw_loop_cpu_steps(uint32_t);
 uint32_t nsmbw_loop_cpu_gpr(uint32_t,uint32_t);
 uint32_t nsmbw_mem_pages();
}
int checks=0;
void ok(bool good,const char* name) {
 if(!good){std::cerr<<"FAIL "<<name<<'\n';std::exit(5);}
 std::cout<<"PASS "<<name<<'\n';++checks;
}
bool spawn(uint32_t slot) {
 return nsmbw_loop_cpu_spawn(slot,kSyntheticEntryPc,
  0x80005010u+slot*0x1000u,0x80004000u,
  0x8000C000u+slot*0x1000u,0)==1;
}
struct W03View {
 Request req{};
 GateView gate{};
};
// The serial=1 here is a visible FICTITIOUS reference for preflight
// only; the ACTUAL secret serial belongs to W03's private Ticket.
W03View view(uint32_t slot,ClockSnapshot c,uint64_t value,
             ServiceId id=ServiceId::rawClockFromNanoseconds) {
 W03View p{};
 p.req.version=kAbiVersion;p.req.id=id;p.req.slot=slot;
 p.req.expectedPc=kSyntheticEntryPc;p.req.epoch=c.epoch;
 p.req.revision=c.revision;p.req.serial=1;p.req.value=value;
 p.gate.slot=slot;p.gate.pc=kSyntheticEntryPc;
 p.gate.epoch=c.epoch;p.gate.revision=c.revision;p.gate.serial=1;
 p.gate.lastCommittedTicks=c.ticks;p.gate.clockCommitted=c.committed;
 p.gate.remainingBudget=1;p.gate.origin=Origin::nativeScheduler;
 p.gate.phase=Phase::ready;p.gate.enabled=true;p.gate.guestReady=true;
 return p;
}
CanonicalClockPlan plan(const Candidate& p){
 return {p.ticks,p.high32,p.low32,p.sourceEpoch,p.sourceRevision};
}
bool unchanged(uint32_t slot,ClockSnapshot before,uint32_t r3,uint32_t r4,
               uint32_t pc,uint32_t steps,uint32_t pages) {
 const auto current=inspectSyntheticClock(slot);
 return current.guestExists==before.guestExists &&
   current.committed==before.committed &&
   current.pending==before.pending &&
   current.ticks==before.ticks && current.revision==before.revision &&
   current.epoch==before.epoch &&
   nsmbw_loop_cpu_gpr(slot,3)==r3 && nsmbw_loop_cpu_gpr(slot,4)==r4 &&
   nsmbw_loop_pc(slot)==pc && nsmbw_loop_cpu_steps(slot)==steps &&
   nsmbw_mem_pages()==pages;
}
#ifdef NSMB_PHASE18_CLOCK_TEST
bool sameCpu(const ClockNativeTestSnapshot& a,
             const ClockNativeTestSnapshot& b) {
 if(!a.valid||!b.valid)return false;
 for(unsigned i=0;i<32;i++)
   if(a.cpu.gpr[i]!=b.cpu.gpr[i] || a.cpu.fpr[i].raw!=b.cpu.fpr[i].raw)
      return false;
 for(unsigned i=0;i<8;i++)if(a.cpu.gqr[i]!=b.cpu.gqr[i])return false;
 return a.cpu.pc==b.cpu.pc&&a.cpu.lr==b.cpu.lr&&
  a.cpu.ctr==b.cpu.ctr&&a.cpu.cr==b.cpu.cr&&
  a.cpu.xer==b.cpu.xer&&a.cpu.fpscr==b.cpu.fpscr&&
  a.cpu.msr==b.cpu.msr&&a.cpu.srr0==b.cpu.srr0&&
  a.cpu.srr1==b.cpu.srr1&&a.cpu.hid0==b.cpu.hid0&&
  a.cpu.hid1==b.cpu.hid1&&a.cpu.hid2==b.cpu.hid2;
}
bool sameFull(const ClockNativeTestSnapshot& a,
              const ClockNativeTestSnapshot& b) {
 if(!sameCpu(a,b))return false;
 if(a.trace!=b.trace||a.traceLength!=b.traceLength||
    a.traceDropped!=b.traceDropped||
    a.state!=b.state||a.error!=b.error)return false;
 return a.clock.ticks==b.clock.ticks &&
  a.clock.revision==b.clock.revision&&
  a.clock.pending==b.clock.pending&&
  a.clock.epoch==b.clock.epoch&&
  a.clock.committed==b.clock.committed;
}
#endif
int main(){
 nsmbw_loop_reset();
 ok(spawn(1)&&spawn(2),"real W03 native spawned two invented guests");
 auto clock0=inspectSyntheticClock(1);
 ok(clock0.guestExists&&clock0.epoch>0&&clock0.revision==0 &&
    !clock0.committed,"W03 owns epoch and canonical initial clock");
#ifdef NSMB_PHASE18_CLOCK_TEST
 const auto full0=clockNativeTestSnapshot(1);
 ok(full0.valid,"W03 exposes test-only COPY of full native CPU");
#endif
 auto inputs=view(1,clock0,1000000000ULL);
 const auto result=prepare(inputs.req,inputs.gate);
 ok(result.computed()&&consistent(result.candidate) &&
    result.candidate.ticks==60750000ULL,
    "pure invented service candidate from 1s raw nanoseconds");
 ok(unchanged(1,clock0,0,0x80004000u,kSyntheticEntryPc,0,0),
    "pure service leaves W03 CPU/ledger and W04 RAM unchanged");
#ifdef NSMB_PHASE18_CLOCK_TEST
 ok(sameFull(full0,clockNativeTestSnapshot(1)),
    "pure prepare leaves full GPR/FPR/GQR/LR/PC/trace/clock bytewise fields");
#endif
 auto no=Ticket{};
 ok(armCanonicalClock(no,kSyntheticEntryPc,plan(result.candidate))==
    ClockArm::invalidTicket,
    "matching FORGED GateView and candidate cannot authorize W03");
#ifdef NSMB_PHASE18_CLOCK_TEST
 ok(sameFull(full0,clockNativeTestSnapshot(1)),
    "invalid ticket cannot mutate full native W03 guest state");
#endif
 // Verify every obvious disallowed origin yields zero candidate.
 bool noWrites=true;
 for(auto origin:{Origin::jsHost,Origin::w07Callback,Origin::mmio,
                 Origin::irq,Origin::unknown}){
   auto hostile=inputs;hostile.gate.origin=origin;
   if(prepare(hostile.req,hostile.gate).status!=
      nsmbw::p19::services::Status::forbiddenOrigin)noWrites=false;
 }
 ok(noWrites&&unchanged(1,clock0,0,0x80004000u,
                       kSyntheticEntryPc,0,0),
    "JS/W07/MMIO/IRQ/unknown requests denied without CPU effect");
 auto lease=leaseSynthetic(1);auto copy=lease;
 ok(armCanonicalClock(lease,kSyntheticEntryPc,plan(result.candidate))==
    ClockArm::accepted,"actual W03 PRIVATE Ticket arms candidate");
 auto pending=inspectSyntheticClock(1);
 ok(pending.pending&&pending.revision==0&&
    nsmbw_loop_cpu_gpr(1,4)==0x80004000u,
    "PREPARE has not changed CPU pair or ledger");
 ok(armCanonicalClock(copy,kSyntheticEntryPc,plan(result.candidate))==
    ClockArm::stale,"copied private Ticket cannot stage twice");
 ok(nsmbw_loop_frame(1)==1,"real W03 native frame dispatch");
 auto done=inspectSyntheticClock(1);
 ok(done.revision==1&&done.ticks==60750000ULL&&done.committed&&
    !done.pending,"W03 SINGLE canonical ledger committed");
 ok(nsmbw_loop_cpu_gpr(1,3)==0&&
    nsmbw_loop_cpu_gpr(1,4)==60750000u&&
    nsmbw_loop_pc(1)==kSyntheticEntryPc&&
    nsmbw_loop_cpu_steps(1)==0&&nsmbw_mem_pages()==0,
    "native GPR3/GPR4 and ledger co-commit, no guest opcode or RAM");
 ok(inspectSyntheticClock(2).revision==0&&
    nsmbw_loop_cpu_gpr(2,4)==0x80004000u,
    "other guest GPR/clock isolated");
 ok(nsmbw_loop_suspend(2)==1,"hold second guest out of deterministic W03 dispatch");
 // Deliberately simulate host-forged nativeScheduler view.
 auto spoof=view(1,done,60750001,ServiceId::rawClockFromTicks);
 const auto spoofed=prepare(spoof.req,spoof.gate);
 ok(spoofed.computed(),"host can calculate valid fake service scalar");
 no=Ticket{};
 ok(armCanonicalClock(no,kSyntheticEntryPc,plan(spoofed.candidate))==
    ClockArm::invalidTicket,
    "forged caller with same origin and exact pair STILL denied W03");
 ok(unchanged(1,done,0,60750000u,kSyntheticEntryPc,0,0),
    "forgery leaves actual CPU/clock unchanged");
 auto badRevision=leaseSynthetic(1);
 ok(armCanonicalClock(badRevision,kSyntheticEntryPc,
                      plan(result.candidate))==ClockArm::staleRevision,
    "replayed old candidate revision rejected by native W03");
 auto badEpoch=plan(spoofed.candidate);++badEpoch.sourceEpoch;
 auto epochLease=leaseSynthetic(1);
 ok(armCanonicalClock(epochLease,kSyntheticEntryPc,badEpoch)==
    ClockArm::epochMismatch,"W03 independent epoch check");
 auto badPair=plan(spoofed.candidate);badPair.high32^=1;
 auto pairLease=leaseSynthetic(1);
 ok(armCanonicalClock(pairLease,kSyntheticEntryPc,badPair)==
    ClockArm::badPair,"W03 rejects altered high32");
 ok(unchanged(1,done,0,60750000u,kSyntheticEntryPc,0,0),
    "all wrong epoch/revision/pair rejects leave CPU/ledger unchanged");
 auto noQuota=view(1,done,60750001,ServiceId::rawClockFromTicks);
 noQuota.gate.remainingBudget=0;
 ok(prepare(noQuota.req,noQuota.gate).status==nsmbw::p19::services::Status::quotaExhausted,
    "pure simulated quota exhaustion blocks staging");
 auto wrongPc=view(1,done,60750001,ServiceId::rawClockFromTicks);
 wrongPc.req.expectedPc=kSyntheticEntryPc+4;
 ok(prepare(wrongPc.req,wrongPc.gate).status==nsmbw::p19::services::Status::wrongPc,
    "pure wrong PC denied before private ticket");
 ok(unchanged(1,done,0,60750000u,kSyntheticEntryPc,0,0),
    "all pure invalid inputs preserve native CPU snapshot");
 // 512 synchronous W03 real scheduler commits, each with fresh revision.
 bool repeated=true;
 for(uint64_t i=1;i<=512;i++){
  const auto previous=inspectSyntheticClock(1);
  auto step=view(1,previous,1000000000ULL+i*1234567ULL);
  const auto candidate=prepare(step.req,step.gate);
  if(!candidate.computed()||!consistent(candidate.candidate)) {
    repeated=false;break;
  }
  auto ticket=leaseSynthetic(1);
  if(armCanonicalClock(ticket,kSyntheticEntryPc,
                       plan(candidate.candidate))!=ClockArm::accepted ||
     nsmbw_loop_frame(1)!=1){repeated=false;break;}
  const auto next=inspectSyntheticClock(1);
  if(next.revision!=previous.revision+1 ||
     next.ticks!=candidate.candidate.ticks||
     nsmbw_loop_cpu_gpr(1,3)!=candidate.candidate.high32||
     nsmbw_loop_cpu_gpr(1,4)!=candidate.candidate.low32 ||
     nsmbw_loop_pc(1)!=kSyntheticEntryPc||
     nsmbw_mem_pages()!=0){repeated=false;break;}
 }
 ok(repeated,"512 REAL W03 scheduler commits with new typed service candidate");
 ok(inspectSyntheticClock(1).revision==513,
    "each of 512 successive commits increments native revision once");
 // Recycle pending old tokens 1024 times on W03 real guest.
 bool recycled=true;
 for(uint64_t i=0;i<1024;i++){
  nsmbw_loop_reset();
  if(!spawn(1)){recycled=false;break;}
  const auto original=inspectSyntheticClock(1);
  const auto work=view(1,original,i*17,
                       ServiceId::rawClockFromTicks);
  const auto candidate=prepare(work.req,work.gate);
  if(!candidate.computed()){recycled=false;break;}
  auto ticket=leaseSynthetic(1);auto oldTicket=ticket;
  if(armCanonicalClock(ticket,kSyntheticEntryPc,
                       plan(candidate.candidate))!=ClockArm::accepted){
    recycled=false;break;
  }
  nsmbw_loop_reset();
  if(!spawn(1)){recycled=false;break;}
  auto newTicket=leaseSynthetic(1);
  auto latest=inspectSyntheticClock(1);
  if(armCanonicalClock(oldTicket,kSyntheticEntryPc,
                       plan(candidate.candidate))==ClockArm::accepted||
     armCanonicalClock(newTicket,kSyntheticEntryPc,
                       plan(candidate.candidate))!=ClockArm::epochMismatch||
     latest.revision!=0||latest.ticks!=0||
     nsmbw_loop_cpu_gpr(1,4)!=0x80004000u){
    recycled=false;break;
  }
 }
 ok(recycled,"1024 actual W03 reset/recycle deny stale pending service");
 ok(inspectSyntheticClock(1).revision==0 &&
    nsmbw_loop_cpu_gpr(1,4)==0x80004000u,
    "recycled final live guest has clean canonical ledger and registers");
 std::cout<<"TOTAL_CHECKS "<<checks<<'\n';
}
