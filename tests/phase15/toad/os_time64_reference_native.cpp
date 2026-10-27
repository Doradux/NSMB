// W15-C executable NATIVE synthetic reference fixture, not Nintendo/HLE.
#include "../../../web-runtime/runtime-services/os_time64_reference.hpp"
#include <cstring>
#include <iostream>
#include <limits>
#include <cstdlib>
using namespace nsmbw::w15;
static int checks = 0;
void check(bool value, const char* label) {
  if (!value) { std::cerr << "FAIL " << label << '\n'; std::exit(2); }
  std::cout << "PASS " << label << '\n';
  ++checks;
}
bool identical(const CpuContext& a, const CpuContext& b) {
  return std::memcmp(&a, &b, sizeof(CpuContext)) == 0;
}
int main() {
  ReferenceClock clock;
  CpuContext seed{};
  for (unsigned i=0; i<32; ++i) seed.gpr[i] = 0x12340000u+i;
  seed.pc=0x80010000;seed.lr=0x80012345;seed.fpscr=0x0BADF00D;
  seed.gqr[0]=0xDEADBEEF;seed.fpr[1].raw=0x0123456789ABCDEFULL;
  uint64_t time=0;
  CpuContext snapshot{}, previous{};
  check(!clock.snapshot(0,snapshot,time),"unspawned has no CPU");
  check(clock.publish(0,1).fault==Fault::noGuest,"unknown guest rejects before commit");
  check(clock.open(9,seed).fault==Fault::invalidSlot,"invalid slot rejected");
  check(clock.open(0,seed).committed(),"slot0 synthetic guest opened");
  check(clock.open(1,seed).committed(),"slot1 independent opened");
  check(clock.open(0,seed).fault==Fault::guestAlreadyOpen,"duplicate guest registration denied");
  check(clock.publish(0,0x0000000100000002ULL).committed(),"64 bit publish above 2pow32");
  clock.snapshot(0,snapshot,time);
  check(snapshot.gpr[3]==1 && snapshot.gpr[4]==2,"r3 hi r4 lo split exactly");
  check(time==0x0000000100000002ULL,"ledger retains full 64 bits");
  check(snapshot.gpr[5]==seed.gpr[5]&&snapshot.pc==seed.pc&&
        snapshot.lr==seed.lr&&snapshot.fpscr==seed.fpscr&&
        snapshot.fpr[1].raw==seed.fpr[1].raw&&snapshot.gqr[0]==seed.gqr[0],
        "all other guest CPU registers untouched");
  check(clock.publish(0,0x0000000100000001ULL).fault==Fault::clockRegression,
        "host time regression denied");
  clock.snapshot(0,previous,time);
  check(identical(previous,snapshot)&&time==0x0000000100000002ULL,
        "host regression has zero side effects");
  check(clock.publish(0,0x0000000100000002ULL).committed(),
        "same time idempotent for registers only");
  check(clock.publish(0,0x0000000200000001ULL,Operation::mmio).fault==
        Fault::unsupportedMmio,"MMIO unimplemented denied");
  check(clock.publish(0,0x0000000200000001ULL,Operation::irq).fault==
        Fault::unsupportedIrq,"IRQ unimplemented denied");
  check(clock.publish(0,0x0000000200000001ULL,Operation::guestMemory).fault==
        Fault::unsupportedMemory,"memory/quota operation denied instead of noop");
  check(clock.publish(0,0x0000000200000001ULL,static_cast<Operation>(255)).fault==
        Fault::unsupportedMemory,"unknown operations denied");
  clock.snapshot(0,previous,time);
  check(identical(previous,snapshot)&&time==0x0000000100000002ULL,
        "failed device/memory operations preserve whole CPU and ledger");
  check(clock.publish(1,12ULL).committed(),"second guest clock advances independently");
  clock.snapshot(1,snapshot,time);
  check(snapshot.gpr[3]==0&&snapshot.gpr[4]==12&&time==12,
        "second guest r3 r4 independent");
  clock.snapshot(0,snapshot,time);
  check(time==0x0000000100000002ULL,"first guest time not overwritten by slot1");
  check(clock.closeAfterVerifiedReset(0,false).fault==Fault::unverifiedEpoch,
        "reset without genuine quiescence evidence denied");
  clock.snapshot(0,previous,time);
  check(identical(previous,snapshot),"denied reset retains entire CPU");
  check(clock.advance(0,1).committed(),"increment across full 64 bit");
  clock.snapshot(0,snapshot,time);
  check(time==0x0000000100000003ULL,"full time incremented exactly");
  check(clock.publish(0,std::numeric_limits<uint64_t>::max()).committed(),
        "last unsigned64 tick is representable");
  clock.snapshot(0,snapshot,time);
  check(snapshot.gpr[3]==0xFFFFFFFF && snapshot.gpr[4]==0xFFFFFFFF,
        "unsigned64 wrap split at max");
  previous=snapshot;
  check(clock.advance(0,1).fault==Fault::tickOverflow,
        "full uint64 overflow rejects (never wraps to zero)");
  clock.snapshot(0,snapshot,time);
  check(identical(previous,snapshot)&&time==std::numeric_limits<uint64_t>::max(),
        "overflow has no GPR/LR/PC/ledger side effects");
  check(clock.closeAfterVerifiedReset(0,true).committed(),
        "test controller explicit synthetic epoch release");
  check(!clock.snapshot(0,snapshot,time),"released guest has no CPU");
  check(clock.open(0,seed).committed(),"new synthetic guest epoch can open");
  check(clock.publish(0,0).committed(),"new epoch permits tick zero");
  clock.snapshot(0,snapshot,time);
  check(snapshot.gpr[3]==0&&snapshot.gpr[4]==0&&time==0,
        "new epoch register split zero");
  clock.snapshot(1,snapshot,time);
  check(time==12,"other guest unaffected by epoch reset");
  check(nanoseconds_to_ticks(0)==0,"ns zero exact");
  check(nanoseconds_to_ticks(1)==0,"subtick ns truncates to zero");
  check(nanoseconds_to_ticks(3999)==242,"3999ns exact ratio");
  check(nanoseconds_to_ticks(4000)==243,"4000ns exact ratio");
  check(nanoseconds_to_ticks(1000000000ULL)==60750000ULL,"1s exactly 60.75MHz");
  check(nanoseconds_to_ticks(1000000000000ULL)==60750000000ULL,
        "one kilosecond exact beyond 32bits");
  check(nanoseconds_to_ticks(std::numeric_limits<uint64_t>::max())==
        (std::numeric_limits<uint64_t>::max()/4000ULL)*243ULL+
        ((std::numeric_limits<uint64_t>::max()%4000ULL)*243ULL)/4000ULL,
        "max unsigned nanoseconds conversion never intermediate overflows");
  std::cout<<"TOTAL_CHECKS "<<checks<<"\n";
}
