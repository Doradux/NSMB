// PHASE19 RED/GREEN: real W03/W04/W07 scheduler synthetic-only bridge.
#include "../../../web-runtime/frame-host/scheduler_clock.hpp"
#include "../../../web-runtime/runtime-services/time64_pure_clock.hpp"
#include <cstdint>
#include <cstdlib>
#include <iostream>
extern "C" {
void nsmbw_loop_reset();
int nsmbw_loop_synthetic_clock_fixture_spawn(uint32_t,uint32_t,uint32_t,
  uint32_t,uint32_t,uint32_t,uint32_t);
int nsmbw_loop_cpu_spawn(uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t);
int nsmbw_loop_tick();
int nsmbw_loop_cancel(uint32_t);
int nsmbw_loop_reap(uint32_t);
int nsmbw_loop_suspend(uint32_t);
int nsmbw_loop_resume(uint32_t);
uint32_t nsmbw_loop_pc(uint32_t);
uint32_t nsmbw_loop_state(uint32_t);
uint32_t nsmbw_loop_error();
uint32_t nsmbw_loop_cpu_gpr(uint32_t,uint32_t);
uint32_t nsmbw_loop_cpu_steps(uint32_t);
uint32_t nsmbw_loop_clock_ticks_hi(uint32_t);
uint32_t nsmbw_loop_clock_ticks_lo(uint32_t);
uint32_t nsmbw_loop_clock_revision_hi(uint32_t);
uint32_t nsmbw_loop_clock_revision_lo(uint32_t);
uint32_t nsmbw_loop_clock_outcome(uint32_t);
uint32_t nsmbw_loop_clock_pending(uint32_t);
uint32_t nsmbw_mem_pages();
int nsmbw_mem_set_page_budget(uint32_t);
}
namespace {
int checked=0;
void verify(bool b,const char* name){
 if(!b){std::cerr<<"FAIL "<<name<<"\n";std::exit(2);}
 ++checked;std::cout<<"PASS "<<name<<"\n";
}
constexpr uint32_t Entry=0x80010000u;
constexpr uint32_t input(uint32_t id){return 0x80003000u+id*0x1000u;}
constexpr uint32_t output(uint32_t id){return 0x8000B000u+id*0x1000u;}
constexpr uint32_t stack(uint32_t id){return 0x8000F010u+id*0x1000u;}
uint64_t clock(uint32_t id){
 return (uint64_t(nsmbw_loop_clock_ticks_hi(id))<<32) |
   nsmbw_loop_clock_ticks_lo(id);
}
uint64_t revision(uint32_t id){
 return (uint64_t(nsmbw_loop_clock_revision_hi(id))<<32) |
   nsmbw_loop_clock_revision_lo(id);
}
bool spawn(uint32_t id,uint64_t nanos) {
 return nsmbw_loop_synthetic_clock_fixture_spawn(
    id,stack(id),input(id),output(id),0xBEu,
    uint32_t(nanos>>32),uint32_t(nanos))==1;
}
}
int main(){
 nsmbw_loop_reset();
 verify(spawn(1,1000000000ULL),"native trusted NEW synthetic fixture scheduled");
 verify(nsmbw_loop_pc(1)==Entry&&revision(1)==0&&clock(1)==0,
   "prepare phase leaves GPR/clock/PC untouched");
 verify(nsmbw_loop_clock_pending(1)==1 &&
   nsmbw_loop_cpu_gpr(1,3)==0 &&
   nsmbw_loop_cpu_gpr(1,4)==input(1),
   "preflight does not publish CPU registers");
 verify(!spawn(1,1000000000ULL)&&nsmbw_loop_clock_pending(1)==1,
   "duplicate ID cannot arm or overwrite existing guest");
 verify(nsmbw_loop_tick()==1&&nsmbw_loop_pc(1)==Entry,
   "actual W03 scheduler dispatches exactly one pure synthetic event");
 verify(clock(1)==60750000ULL&&revision(1)==1,
   "W03 canonical ticks and revision committed once");
 verify(nsmbw_loop_cpu_gpr(1,3)==0&&nsmbw_loop_cpu_gpr(1,4)==60750000u,
   "GPR3/4 join same pure tick value");
 verify(nsmbw_loop_clock_pending(1)==0&&nsmbw_loop_clock_outcome(1)==1,
   "pending consumed and outcome reports actual W03 commit");
 verify(nsmbw_loop_cpu_steps(1)==0&&nsmbw_mem_pages()==0,
   "synthetic clock does not execute guest opcode or allocate RAM");
 verify(!spawn(1,7)&&clock(1)==60750000ULL&&revision(1)==1,
   "host cannot modify existing guest clock");
 verify(nsmbw_loop_tick()==1&&nsmbw_loop_pc(1)==Entry+4 &&
   nsmbw_loop_cpu_steps(1)==1,"next W03 tick executes ordinary W04 checked opcode");
 verify(clock(1)==60750000ULL&&revision(1)==1,
   "ordinary guest code cannot silently replay clock event");
 verify(spawn(2,0)&&spawn(3,1),"zero nanos and one nano new guests accepted");
 verify(nsmbw_loop_tick()==2&&nsmbw_loop_tick()==3,
   "two-guestround robin scheduler commits their own pending clocks");
 verify(clock(2)==0&&clock(3)==0&&revision(2)==1&&revision(3)==1,
   "floor nanos conversion exact for 0 and 1, independent revisions");
 verify(nsmbw_loop_clock_outcome(2)==1&&nsmbw_loop_clock_outcome(3)==1,
   "both genuine W03 events recorded");
 verify(nsmbw_loop_clock_pending(555)==0&&nsmbw_loop_clock_outcome(555)==0 &&
   clock(555)==0&&revision(555)==0,"unknown guest only yields zero read-only view");
 verify(!spawn(0,100)&&nsmbw_loop_error()!=0,
   "invalid guest identity denied without minted authority");
 nsmbw_loop_reset();
 verify(spawn(1,(uint64_t(1)<<32)*4000ULL/243ULL+4000ULL),
   "clock input crosses 32bit boundary exactly with integer timebase");
 verify(nsmbw_loop_tick()==1&&nsmbw_loop_cpu_gpr(1,3)>=1,
   "actual W03 tick handles 32-bit high-word carry");
 verify(clock(1)==(uint64_t(nsmbw_loop_cpu_gpr(1,3))<<32|
                   nsmbw_loop_cpu_gpr(1,4)),
   "entire 64-bit canonical clock equals GPR3/4 pair after carry");
 verify(revision(1)==1,"canonical revision not torn on carry");
 verify(nsmbw_loop_suspend(1)==1&&nsmbw_loop_resume(1)==1,
   "resume lifecycle preserves committed clock");
 verify(revision(1)==1&&nsmbw_loop_clock_pending(1)==0,
   "pause and resume do not replay previously committed clock");
 nsmbw_loop_reset();
 verify(spawn(1,UINT64_MAX),"UINT64_MAX ns computes without unsigned overflow");
 verify(nsmbw_loop_tick()==1,"UINT64_MAX ns yields deterministic clock event");
 const auto exact=nsmbw::w18::fromNanoseconds(UINT64_MAX);
 verify(exact.ok()&&clock(1)==exact.candidate.ticks,
   "W03 actual clock matches pure Time64 maximum integer arithmetic");
 verify(nsmbw_loop_cancel(1)==1&&nsmbw_loop_reap(1)==1&&spawn(1,10),
   "recycled ID can ONLY spawn a NEW fixture, no old pending state");
 verify(revision(1)==0&&clock(1)==0&&nsmbw_loop_clock_pending(1)==1,
   "recycled guest has fresh independent canonical ledger");
 nsmbw_loop_reset();
 verify(nsmbw_mem_set_page_budget(0)==1&&spawn(1,1000000000ULL),
   "quota zero still permits register-only prepared service");
 verify(nsmbw_loop_tick()==1&&nsmbw_mem_pages()==0&&revision(1)==1,
   "clock commits without RAM at quota0");
 verify(nsmbw_loop_tick()==1&&nsmbw_loop_state(1)==4 &&
   revision(1)==1&&clock(1)==60750000ULL,
   "subsequent checked guest RAM fault cannot tear committed clock");
 nsmbw_loop_reset();
 bool stress=true;
 for(unsigned i=0;i<128;i++){
   const uint64_t nanos=uint64_t(i)*1000000ULL;
   nsmbw_loop_reset();
   stress &= spawn(1,nanos);
   stress &= nsmbw_loop_tick()==1;
   const auto t=nsmbw::w18::fromNanoseconds(nanos);
   stress &= t.ok()&&clock(1)==t.candidate.ticks&&revision(1)==1;
   stress &= nsmbw_loop_cpu_gpr(1,3)==uint32_t(t.candidate.ticks>>32);
   stress &= nsmbw_loop_cpu_gpr(1,4)==uint32_t(t.candidate.ticks);
 }
 verify(stress,"128 real native W03 reset/spawn/clock cycles agree Time64");
 std::cout<<"TOTAL_CHECKS "<<checked<<"\n";
}
