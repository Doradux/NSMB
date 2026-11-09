// Phase18 W03 REAL scheduler E2E with Toad's pinned public pure math header.
// Compiler must be supplied EXACT Toad SHA via isolated source archive -I.
// There is NO productive Phase17 Time64 TransactionService or 2nd ledger here.
#include "../../../web-runtime/frame-host/time64_clock_bridge.hpp"
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <type_traits>
#ifndef NSMB_PHASE18_PURE_TIME64_PRESENT
#error "Toad pure candidate not present: fail closed rather than fake service"
#endif
static_assert(std::is_trivially_copyable_v<nsmbw::w18::Candidate>);
static_assert(sizeof(nsmbw::w18::Candidate)==sizeof(uint64_t));
static_assert(nsmbw::w18::kRawTicksPerSecond==60750000ULL);
using namespace nsmbw::trusted_cpu;
namespace pure=nsmbw::w18;
extern "C" {
void nsmbw_loop_reset();
int nsmbw_loop_cpu_spawn(uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t);
int nsmbw_loop_frame(uint32_t);
uint32_t nsmbw_loop_pc(uint32_t);
uint32_t nsmbw_loop_cpu_gpr(uint32_t,uint32_t);
uint32_t nsmbw_loop_cpu_steps(uint32_t);
uint32_t nsmbw_mem_pages();
}
namespace {
int count=0;
void check(bool ok,const char* why) {
  if(!ok) {std::cerr<<"FAIL "<<why<<'\n';std::exit(2);}
  ++count;std::cout<<"PASS "<<why<<'\n';
}
constexpr uint32_t entry=0x80010000u;
int spawn(unsigned id) {
  return nsmbw_loop_cpu_spawn(id,entry,0x80005010u+id*0x1000u,
                             0x80004000u,0x8000C000u+id*0x1000u,0);
}
}
int main(){
  nsmbw_loop_reset();
  check(spawn(1)==1,"single native W03 synthetic CPU guest spawned");
  check(pure::fromNanoseconds(1'000'000'000ULL).ok() &&
        pure::fromNanoseconds(1'000'000'000ULL).candidate.ticks==60'750'000ULL,
        "Toad pure 60.75MHz exact integer conversion is input only");
  check(pure::fromNanoseconds(4000ULL).candidate.ticks==243 &&
        pure::fromNanoseconds(3999ULL).candidate.ticks==242,
        "Toad pure conversion floor with exact 4us boundary");
  check(pure::signedNanos(-1).error==pure::Error::invalid,
        "negative input pure helper rejects before W03 lease");
  check(pure::addTicks(UINT64_MAX,1).error==pure::Error::overflow,
        "pure helper detects uint64 addition overflow before W03 lease");

  const auto start=inspectSyntheticClock(1);
  const auto beforeGPR3=nsmbw_loop_cpu_gpr(1,3);
  const auto beforeGPR4=nsmbw_loop_cpu_gpr(1,4);
  const auto pureValue=pure::fromNanoseconds(1'000'000'000ULL);
  auto ticket=leaseSynthetic(1);
  check(armPureTime64Clock(ticket,entry,pureValue.candidate,
                           start.epoch,start.revision)==ClockArm::accepted,
        "Toad pure Candidate admitted ONLY by private W03 CPU ticket");
  check(inspectSyntheticClock(1).revision==0 &&
        inspectSyntheticClock(1).ticks==0 &&
        nsmbw_loop_cpu_gpr(1,3)==beforeGPR3 &&
        nsmbw_loop_cpu_gpr(1,4)==beforeGPR4,
        "pure prepare and arm leave W03 canonical CPU/ledger unchanged");
  check(nsmbw_loop_frame(1)==1,"real W03 scheduler selected prepared clock event");
  auto first=inspectSyntheticClock(1);
  check(first.revision==1 && first.ticks==60750000ULL && first.committed,
        "W03 alone owns canonical ledger revision1 and raw ticks");
  check(((static_cast<uint64_t>(nsmbw_loop_cpu_gpr(1,3))<<32) |
         nsmbw_loop_cpu_gpr(1,4))==60750000ULL,
        "real W03 CPU r3/r4 pair matches sole W03 ledger");
  check(nsmbw_loop_pc(1)==entry && nsmbw_loop_cpu_steps(1)==0 &&
        nsmbw_mem_pages()==0,
        "native service neither executes guest opcode nor allocates W04 RAM");

  const auto future=pure::addTicks(first.ticks,0x100000000ULL);
  check(future.ok() && future.candidate.high32()==1 &&
        future.candidate.low32()==60750000u,
        "pure generator crosses 32-bit high/low boundary without float");
  auto nextTicket=leaseSynthetic(1);
  check(armPureTime64Clock(nextTicket,entry,future.candidate,
                           first.epoch,first.revision)==ClockArm::accepted,
        "second pure candidate admitted with matching W03 revision1");
  check(nsmbw_loop_frame(1)==1 && inspectSyntheticClock(1).revision==2,
        "second real W03 scheduled commit increments same canonical revision");
  check(inspectSyntheticClock(1).ticks==future.candidate.ticks &&
        nsmbw_loop_cpu_gpr(1,3)==future.candidate.high32() &&
        nsmbw_loop_cpu_gpr(1,4)==future.candidate.low32(),
        "TOAD pure high/low values match W03 actual registers and ONE ledger");

  const auto stable=inspectSyntheticClock(1);
  auto stale=leaseSynthetic(1);
  check(armPureTime64Clock(stale,entry,pure::makeTicks(stable.ticks+1).candidate,
                           first.epoch,first.revision)==ClockArm::staleRevision,
        "replayed source revision1 denied now that W03 is revision2");
  check(inspectSyntheticClock(1).ticks==stable.ticks &&
        inspectSyntheticClock(1).revision==stable.revision &&
        nsmbw_loop_cpu_gpr(1,3)==future.candidate.high32() &&
        nsmbw_loop_cpu_gpr(1,4)==future.candidate.low32(),
        "stale pure input cannot tear or regress W03 registers/ledger");
  auto regression=leaseSynthetic(1);
  check(pure::requireMonotonic(pure::makeTicks(5).candidate,stable.ticks)==
        pure::Error::regression,
        "pure helper independently detects host clock regression");
  check(armPureTime64Clock(regression,entry,pure::makeTicks(5).candidate,
                           stable.epoch,stable.revision)==ClockArm::regression,
        "W03 rechecks numeric regression even if caller skipped pure test");
  check(inspectSyntheticClock(1).revision==stable.revision &&
        inspectSyntheticClock(1).ticks==stable.ticks,
        "no second Time64 ledger nor partial commit on regressive candidate");
  auto forgedEpoch=leaseSynthetic(1);
  check(armPureTime64Clock(forgedEpoch,entry,pure::makeTicks(stable.ticks+1).candidate,
                           stable.epoch+1,stable.revision)==ClockArm::epochMismatch,
        "plain pure Candidate cannot forge W03 source epoch");
  check(inspectSyntheticClock(1).revision==2 &&
        nsmbw_loop_cpu_gpr(1,3)==future.candidate.high32() &&
        nsmbw_loop_cpu_gpr(1,4)==future.candidate.low32(),
        "forged source metadata cannot mutate actual scheduler CPU");
#ifdef NSMB_PHASE18_PURE_REFERENCE_PRESENT
  // Toad's higher-level pure Reference is arithmetic/meta-data ONLY.
  // W03 alone owns the actual revision and CPU pair and revalidates them.
  const auto beforeRich=inspectSyntheticClock(1);
  const nsmbw::time64_pure::Reference reference{
    1'000'000'000ULL,beforeRich.ticks,beforeRich.epoch,
    beforeRich.revision,true};
  const auto rich=nsmbw::time64_pure::prepareFromNanos(
    100'000'000'000ULL,reference,reference.sourceEpoch,
    reference.sourceRevision);
  check(rich.ok() && rich.candidate.rawTicks==6'075'000'000ULL &&
        nsmbw::time64_pure::validateForCommit(rich.candidate,reference)==
          nsmbw::time64_pure::Error::ok,
        "Toad immutable Reference pure nanosecond prepare passes exactly");
  const auto deniedHost=nsmbw::time64_pure::prepareFromNanos(
    reference.lastHostNanos-1,reference,reference.sourceEpoch,
    reference.sourceRevision);
  check(deniedHost.error==nsmbw::time64_pure::Error::regressiveHost,
        "Toad pure generator denies regressive host nanoseconds without W03 lease");
  auto richTicket=leaseSynthetic(1);
  check(armCheckedTime64Clock(richTicket,entry,rich.candidate)==ClockArm::accepted,
        "rich pure candidate with epoch/version accepted by W03 PRIVATE ticket");
  check(inspectSyntheticClock(1).revision==beforeRich.revision &&
        inspectSyntheticClock(1).ticks==beforeRich.ticks,
        "rich prepare does not mutate W03 CPU or ledger");
  check(nsmbw_loop_frame(1)==1 &&
        inspectSyntheticClock(1).revision==beforeRich.revision+1 &&
        inspectSyntheticClock(1).ticks==rich.candidate.rawTicks,
        "rich pure Time64 success commits in single W03 dispatch only");
  check(nsmbw_loop_cpu_gpr(1,3)==rich.candidate.high32 &&
        nsmbw_loop_cpu_gpr(1,4)==rich.candidate.low32 &&
        nsmbw_loop_pc(1)==entry,
        "rich Time64 GPR3/GPR4 and canonical W03 ticks share exact value");
  auto staleRich=leaseSynthetic(1);
  check(armCheckedTime64Clock(staleRich,entry,rich.candidate)==
          ClockArm::staleRevision,
        "replay of pure reference candidate rejected by CURRENT W03 revision");
  auto malicious=rich.candidate;
  malicious.low32^=1u;
  auto maliciousTicket=leaseSynthetic(1);
  check(armCheckedTime64Clock(maliciousTicket,entry,malicious)==
          ClockArm::staleRevision,
        "stale revision is rejected before malicious candidate could reach CPU");
  malicious.sourceRevision=inspectSyntheticClock(1).revision;
  auto malformedTicket=leaseSynthetic(1);
  check(armCheckedTime64Clock(malformedTicket,entry,malicious)==ClockArm::badPair,
        "even corrected metadata cannot disguise forged pure high/low halves");
  check(inspectSyntheticClock(1).ticks==rich.candidate.rawTicks &&
        inspectSyntheticClock(1).revision==beforeRich.revision+1,
        "every denied rich candidate preserves the ONE W03 canonical ledger");
#endif
  std::cout<<"TOTAL_CHECKS "<<count<<'\n';
}
