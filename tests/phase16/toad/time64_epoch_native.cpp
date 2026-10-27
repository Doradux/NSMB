// Explicit SYNTHETIC ONLY issuer. No real scheduler trust or Nintendo code.
#include "time64_epoch_service.hpp"
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <limits>
#include <type_traits>
#include <utility>
using namespace nsmbw::w16;
using nsmbw::w15::Operation;
using nsmbw::w15::nanoseconds_to_ticks;
namespace nsmbw::w03 {
class Time64PermitIssuer final {
public:
  static Time64Permit make(Time64EpochService& service, unsigned slot,
                           uint64_t generation, uint32_t pc,
                           Act action, bool quiet = false) {
    return Time64Permit(service, slot, generation, pc, action, quiet);
  }
};
}
using nsmbw::w03::Time64PermitIssuer;
static int checks=0;
void check(bool p, const char* why) {
  if (!p) { std::cerr << "FAIL " << why << "\n"; std::exit(3); }
  ++checks;
  std::cout << "PASS " << why << "\n";
}
static_assert(!std::is_default_constructible<Time64Permit>::value);
static_assert(!std::is_copy_constructible<Time64Permit>::value);
static_assert(std::is_move_constructible<Time64Permit>::value);
static_assert(!std::is_copy_assignable<Time64Permit>::value);
static_assert(!std::is_move_assignable<Time64Permit>::value);
bool same(const CpuContext& a, const CpuContext& b) {
  return std::memcmp(&a, &b, sizeof(CpuContext))==0;
}
int main() {
  Time64EpochService clock, outsider;
  CpuContext cpu{}, before{}, after{};
  cpu.gpr[3]=0xaabbccdd; cpu.gpr[4]=0xface1234;
  cpu.gpr[1]=0x80005010; cpu.lr=0x8001fff0; cpu.pc=0x80012340;
  cpu.gqr[1]=0x11111111; cpu.fpr[5].raw=0x8877665544332211ULL;
  uint64_t ticks=0, gen=0;
  auto permit=[&](unsigned slot,uint64_t generation,uint32_t pc,Act action,bool quiet=false){
    return Time64PermitIssuer::make(clock,slot,generation,pc,action,quiet);
  };
  check(!clock.snapshot(0,before,ticks,gen),"initial closed");
  check(clock.publish(permit(0,1,cpu.pc,Act::sample),5).error==Error::noGuest,"denied no guest");
  check(clock.open(permit(4,1,cpu.pc,Act::open),cpu).error==Error::badSlot,"denied invalid slot");
  check(clock.open(permit(0,0,cpu.pc,Act::open),cpu).error==Error::staleGeneration,"zero generation rejected");
  check(clock.open(permit(0,1,cpu.pc+4,Act::open),cpu).error==Error::wrongPc,"open expected PC mismatch");
  check(clock.open(permit(0,1,cpu.pc,Act::open),cpu).committed(),"open generation 1");
  check(clock.open(permit(0,2,cpu.pc,Act::open),cpu).error==Error::occupied,"no duplicate open");
  check(clock.snapshot(0,before,ticks,gen) && gen==1 && ticks==0 && same(cpu,before),"initial snapshot");
  auto replay=permit(0,1,cpu.pc,Act::sample);
  check(clock.publish(std::move(replay),0xffffffffULL).committed(),"low32 max");
  check(clock.publish(std::move(replay),0x100000000ULL).error==Error::untrusted,"replay permit rejected");
  check(clock.snapshot(0,before,ticks,gen)&&before.gpr[3]==0&&before.gpr[4]==0xffffffff,"replay immutable state");
  auto wrongOwner=Time64PermitIssuer::make(outsider,0,1,cpu.pc,Act::sample);
  check(clock.publish(std::move(wrongOwner),3).error==Error::untrusted,"wrong service capability");
  check(clock.publish(permit(0,1,cpu.pc,Act::open),55).error==Error::wrongAction,"wrong action for sample");
  check(clock.publish(permit(0,9,cpu.pc,Act::sample),55).error==Error::badGeneration,"stale/future generation mismatch");
  check(clock.publish(permit(0,1,cpu.pc+4,Act::sample),55).error==Error::wrongPc,"expected PC enforced");
  check(clock.snapshot(0,after,ticks,gen)&&same(after,before),"wrong permits never mutate context");
  check(clock.advance(permit(0,1,cpu.pc,Act::sample),1).committed(),"low32 rollover accepted");
  check(clock.snapshot(0,before,ticks,gen)&&before.gpr[3]==1&&before.gpr[4]==0&&ticks==0x100000000ULL,"r3 and r4 split carry");
  check(clock.publish(permit(0,1,cpu.pc,Act::sample),0xfffffffULL).error==Error::regression,"out-of-order time denied");
  check(clock.publish(permit(0,1,cpu.pc,Act::sample),0x100000002ULL,Operation::mmio).error==Error::mmioDenied,"MMIO denied");
  check(clock.publish(permit(0,1,cpu.pc,Act::sample),0x100000002ULL,Operation::irq).error==Error::irqDenied,"IRQ denied");
  check(clock.publish(permit(0,1,cpu.pc,Act::sample),0x100000002ULL,Operation::guestMemory).error==Error::memoryDenied,"guest RAM denied");
  check(clock.publish(permit(0,1,cpu.pc,Act::sample),0x100000002ULL,static_cast<Operation>(200)).error==Error::memoryDenied,"unknown action denied");
  check(clock.snapshot(0,after,ticks,gen)&&same(before,after)&&ticks==0x100000000ULL,"rejected operations atomic rollback");
  check(clock.reset(permit(0,1,cpu.pc,Act::reset,false)).error==Error::notQuiet,"reset no verified quiescence denied");
  check(clock.reset(permit(0,2,cpu.pc,Act::reset,true)).error==Error::badGeneration,"reset wrong generation denied");
  check(clock.reset(permit(0,1,cpu.pc+4,Act::reset,true)).error==Error::wrongPc,"reset wrong PC denied");
  check(clock.snapshot(0,after,ticks,gen)&&same(after,before)&&gen==1,"reset faults preserve guest");
  check(clock.open(permit(1,55,cpu.pc,Act::open),cpu).committed(),"separate guest open");
  check(clock.publish(permit(1,55,cpu.pc,Act::sample),987).committed(),"separate guest advance");
  check(clock.publish(permit(0,1,cpu.pc,Act::sample),std::numeric_limits<uint64_t>::max()).committed(),"max 64 time sample");
  check(clock.snapshot(0,before,ticks,gen)&&before.gpr[3]==0xffffffff&&before.gpr[4]==0xffffffff,"uint64 max split");
  check(clock.advance(permit(0,1,cpu.pc,Act::sample),1).error==Error::overflow,"uint64 overflow forbidden");
  check(clock.snapshot(0,after,ticks,gen)&&same(before,after)&&ticks==std::numeric_limits<uint64_t>::max(),"overflow no writes");
  check(clock.reset(permit(0,1,cpu.pc,Act::reset,true)).committed(),"synthetic fixture-supplied quiet reset");
  check(!clock.snapshot(0,after,ticks,gen),"closed guest snapshot denied");
  check(clock.open(permit(0,1,cpu.pc,Act::open),cpu).error==Error::staleGeneration,"generation ABA rejected");
  check(clock.open(permit(0,2,cpu.pc,Act::open),cpu).committed(),"new generation after reset");
  check(clock.snapshot(0,after,ticks,gen)&&same(after,cpu)&&gen==2&&ticks==0,"new epoch seeds CPU");
  check(clock.publish(permit(0,1,cpu.pc,Act::sample),55).error==Error::badGeneration,"old generation replay denied");
  check(clock.publish(permit(0,2,cpu.pc,Act::sample),0).committed(),"new epoch zero time");
  check(clock.publishNanoseconds(permit(0,2,cpu.pc,Act::sample),1000000000ULL).committed(),
        "host nanoseconds exact sample accepted");
  check(clock.snapshot(0,after,ticks,gen)&&ticks==60750000ULL&&after.gpr[3]==0&&after.gpr[4]==60750000,
        "1s exact r3/r4 from 60.75MHz");
  check(clock.publishNanoseconds(permit(0,2,cpu.pc,Act::sample),999999999ULL).error==Error::regression,
        "out of order nanoseconds rejected");
  check(clock.snapshot(0,after,ticks,gen)&&ticks==60750000ULL,
        "nanoseconds regression preserves tick ledger");
  check(clock.snapshot(1,after,ticks,gen)&&gen==55&&ticks==987,"other guest unaffected by reset");
  check(clock.reset(permit(1,55,cpu.pc,Act::reset,true)).committed(),"second guest reset");
  check(clock.open(permit(1,55,cpu.pc,Act::open),cpu).error==Error::staleGeneration,"separate guest retired generation");
  check(clock.open(permit(1,56,cpu.pc,Act::open),cpu).committed(),"separate guest next generation");
  check(clock.open(permit(2,std::numeric_limits<uint64_t>::max(),cpu.pc,Act::open),cpu).committed(),"max generation");
  check(clock.reset(permit(2,std::numeric_limits<uint64_t>::max(),cpu.pc,Act::reset,true)).committed(),"max generation retire");
  check(clock.open(permit(2,1,cpu.pc,Act::open),cpu).error==Error::staleGeneration,"max generation never wraps");
  check(clock.snapshot(0,after,ticks,gen)&&gen==2&&ticks==60750000ULL,"no guest crossover");
  check(nanoseconds_to_ticks(1000000000ULL)==60750000ULL,"timebase exact frequency");
  check(nanoseconds_to_ticks(std::numeric_limits<uint64_t>::max())==
        (std::numeric_limits<uint64_t>::max()/4000)*243+
        ((std::numeric_limits<uint64_t>::max()%4000)*243)/4000,"max ns exact conversion");
  std::cout << "TOTAL_CHECKS " << checks << "\n";
}
