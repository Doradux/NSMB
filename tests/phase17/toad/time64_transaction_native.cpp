// Authored synthetic CPU context ONLY. No original Wii function or HLE.
#include "time64_transaction.hpp"
#include <cassert>
#include <cstring>
#include <cstdlib>
#include <iostream>
#include <new>
#include <type_traits>
#include <utility>
using namespace nsmbw::w17;
namespace nsmbw::w03 {
class Time64TransactionIssuer final {
public:
 static Authority mint(TransactionService& svc, unsigned slot, uint64_t gen,
                       uint32_t pc, Action action,
                       Phase phase=Phase::quiescent) noexcept {
   return Authority(svc,slot,gen,pc,action,phase);
 }
};
}
using nsmbw::w03::Time64TransactionIssuer;
int checks=0;
void must(bool condition,const char* label) {
 if(!condition) { std::cerr << "FAIL " << label << "\n";std::exit(5); }
 ++checks;std::cout<<"PASS "<<label<<"\n";
}
bool same(const CpuContext& a,const CpuContext& b) {
 return std::memcmp(&a,&b,sizeof(CpuContext))==0;
}
auto auth(TransactionService& svc,unsigned slot,uint64_t gen,uint32_t pc,
          Action a,Phase p=Phase::quiescent) {
 return Time64TransactionIssuer::mint(svc,slot,gen,pc,a,p);
}
static_assert(!std::is_default_constructible<Authority>::value);
static_assert(!std::is_copy_constructible<Authority>::value);
static_assert(!std::is_copy_constructible<Prepared>::value);
static_assert(!std::is_copy_constructible<TransactionService>::value);
static_assert(!std::is_move_constructible<TransactionService>::value);
int main() {
 TransactionService svc;
 CpuContext seed{};seed.pc=0x80004100u;seed.lr=0x80004300u;
 seed.gpr[1]=0x81000000u;seed.gpr[3]=0x12340000u;seed.gpr[4]=0x56780000u;
 seed.fpr[3].raw=0x1122334455667788ULL;seed.gqr[1]=0x98765;
 CpuContext before{},after{};uint64_t ticks=0,gen=0,rev=0;
 must(svc.open(auth(svc,0,1,seed.pc,Action::open),seed)==Error::ok,"open synthetic guest");
 must(svc.snapshot(0,before,ticks,gen,rev)&&same(seed,before)&&ticks==0&&rev==0,"baseline unchanged");
 auto planned=svc.prepareNanoseconds(0,1,seed.pc,1000000000ULL);
 must(planned.error==Error::ok && planned.candidate.has_value(),"prepare 1s");
 must(svc.snapshot(0,after,ticks,gen,rev)&&same(after,before)&&ticks==0,"prepare does NOT touch GPR or ledger");
 must(planned.candidate->ticks()==60750000ULL&&planned.candidate->high32()==0u&&planned.candidate->low32()==60750000u,"exact raw 60.75MHz r3/r4 candidate");
 must(svc.abort(std::move(*planned.candidate))==Error::ok,"abort consumes token");
 must(svc.snapshot(0,after,ticks,gen,rev)&&same(after,before)&&ticks==0,"abort never changes guest");
 auto txn=svc.prepareTicks(0,1,seed.pc,0xffffffffULL);
 must(txn.error==Error::ok,"prepare low32 max");
 must(svc.commit(std::move(*txn.candidate),auth(svc,0,1,seed.pc,Action::commit))==Error::ok,"commit low32 max");
 must(svc.snapshot(0,after,ticks,gen,rev)&&after.gpr[3]==0&&after.gpr[4]==0xffffffffu&&ticks==0xffffffffULL&&rev==1,"CPU r3/r4 and ledger co-commit");
 must(svc.commit(std::move(*txn.candidate),auth(svc,0,1,seed.pc,Action::commit))==Error::consumed,"duplicate token denied");
 auto wrap=svc.prepareAdvance(0,1,seed.pc,1);
 must(wrap.error==Error::ok,"prepare low32 rollover");
 must(svc.commit(std::move(*wrap.candidate),auth(svc,0,1,seed.pc,Action::commit))==Error::ok,"commit carry");
 must(svc.snapshot(0,after,ticks,gen,rev)&&after.gpr[3]==1&&after.gpr[4]==0&&ticks==0x100000000ULL,"full high32 carry");
 must(same(after,after)&&after.pc==seed.pc&&after.lr==seed.lr&&after.gpr[1]==seed.gpr[1]&&after.fpr[3].raw==seed.fpr[3].raw&&after.gqr[1]==seed.gqr[1],"non-return CPU invariants");
 auto old=svc.prepareTicks(0,1,seed.pc,0x100000005ULL);
 auto fresh=svc.prepareTicks(0,1,seed.pc,0x100000006ULL);
 must(old.error==Error::ok&&fresh.error==Error::ok,"two proposals share revision");
 must(svc.commit(std::move(*fresh.candidate),auth(svc,0,1,seed.pc,Action::commit))==Error::ok,"newer proposal commits");
 must(svc.commit(std::move(*old.candidate),auth(svc,0,1,seed.pc,Action::commit))==Error::stalePrepared,"older proposal blocked by revision");
 must(svc.snapshot(0,before,ticks,gen,rev)&&ticks==0x100000006ULL,"stale proposal cannot regress ledger");
 auto bad=svc.prepareTicks(0,1,seed.pc,ticks+1);
 must(bad.error==Error::ok,"candidate for injection");
 must(svc.commit(std::move(*bad.candidate),auth(svc,0,1,seed.pc,Action::commit,Phase::deviceFault))==Error::deviceDenied,"device fault before writes");
 must(svc.snapshot(0,after,ticks,gen,rev)&&same(after,before),"device abort leaves full CPU unchanged");
 must(svc.prepareTicks(0,1,seed.pc,ticks-1).error==Error::regression,"prepare regression denied");
 must(svc.prepareTicks(0,2,seed.pc,ticks+1).error==Error::badGeneration,"wrong generation denied");
 must(svc.prepareTicks(0,1,seed.pc+4,ticks+1).error==Error::wrongPc,"wrong expectedPC denied");
 must(svc.prepareTicks(9,1,seed.pc,ticks+1).error==Error::badSlot,"wrong slot denied");
 must(svc.prepareTicks(0,1,seed.pc,ticks+1,Operation::irq).error==Error::irqDenied,"IRQ candidate denied");
 must(svc.prepareTicks(0,1,seed.pc,ticks+1,Operation::mmio).error==Error::mmioDenied,"MMIO candidate denied");
 must(svc.prepareTicks(0,1,seed.pc,ticks+1,Operation::guestMemory).error==Error::memoryDenied,"guest RAM candidate denied");
 // Inject every distinct denied scheduler state BEFORE any write.
 auto preserved=[&](const char* label){
   must(svc.snapshot(0,after,ticks,gen,rev)&&same(after,before)&&
        ticks==0x100000006ULL&&gen==1&&rev==3,label);
 };
 const Phase invalidPhases[]={Phase::dispatching,Phase::reentrant,Phase::deviceFault,
   Phase::quotaFault,Phase::mmio,Phase::irq,Phase::resetting,
   static_cast<Phase>(255)};
 const Error invalidResults[]={Error::busy,Error::busy,Error::deviceDenied,
   Error::quotaDenied,Error::mmioDenied,Error::irqDenied,Error::busy,
   Error::notQuiescent};
 for(unsigned i=0;i<8;i++){
   auto p=svc.prepareAdvance(0,1,seed.pc,1);
   must(p.error==Error::ok,"fault proposal prepared");
   must(svc.commit(std::move(*p.candidate),
        auth(svc,0,1,seed.pc,Action::commit,invalidPhases[i]))==
        invalidResults[i],"injected fault rejected before commit");
 }
 preserved("all eight injected faults leave CPU + ledger intact");
 auto wrongAct=svc.prepareAdvance(0,1,seed.pc,1);
 must(svc.commit(std::move(*wrongAct.candidate),
      auth(svc,0,1,seed.pc,Action::reset))==Error::wrongAction,
      "wrong action denied");
 auto wrongPc=svc.prepareAdvance(0,1,seed.pc,1);
 must(svc.commit(std::move(*wrongPc.candidate),
      auth(svc,0,1,seed.pc+4,Action::commit))==Error::wrongPc,
      "commit wrong PC denied");
 auto wrongGen=svc.prepareAdvance(0,1,seed.pc,1);
 must(svc.commit(std::move(*wrongGen.candidate),
      auth(svc,0,55,seed.pc,Action::commit))==Error::badGeneration,
      "commit wrong guest generation denied");
 auto wrongSlot=svc.prepareAdvance(0,1,seed.pc,1);
 must(svc.commit(std::move(*wrongSlot.candidate),
      auth(svc,1,1,seed.pc,Action::commit))==Error::badSlot,
      "commit wrong slot denied");
 preserved("all incorrect authorities preserve full state");
 auto aborted=svc.prepareAdvance(0,1,seed.pc,1);
 must(svc.abort(std::move(*aborted.candidate))==Error::ok,
      "abort prepared once");
 must(svc.abort(std::move(*aborted.candidate))==Error::consumed,
      "abort duplicate denied");
 must(svc.commit(std::move(*aborted.candidate),
      auth(svc,0,1,seed.pc,Action::commit))==Error::consumed,
      "commit after abort denied");
 preserved("abort/duplicate cannot commit");
 TransactionService outsider;
 auto cross=svc.prepareAdvance(0,1,seed.pc,1);
 must(svc.commit(std::move(*cross.candidate),
      auth(outsider,0,1,seed.pc,Action::commit))==Error::untrusted,
      "cross-instance authority denied");
 preserved("cross-instance fault preserves guest");
 must(svc.open(auth(svc,1,91,seed.pc,Action::open),seed)==Error::ok,
      "second guest open");
 auto other=svc.prepareTicks(1,91,seed.pc,1024);
 must(other.error==Error::ok,"second guest proposal");
 must(svc.commit(std::move(*other.candidate),
      auth(svc,1,91,seed.pc,Action::commit))==Error::ok,
      "second guest commit");
 preserved("second guest cannot change first guest");
 must(svc.prepareTicks(0,1,seed.pc,ticks+1,static_cast<Operation>(123)).error==
      Error::memoryDenied,"unknown operation refused");
 must(svc.prepareAdvance(0,1,seed.pc,2,Operation::mmio).error==
      Error::mmioDenied,"MMIO refused in advance");
 must(svc.prepareAdvance(0,1,seed.pc,2,Operation::irq).error==
      Error::irqDenied,"IRQ refused in advance");
 // Epoch reset, stale prepared and max-timestamp boundaries.
 must(svc.reset(auth(svc,0,1,seed.pc,Action::reset,Phase::dispatching))==
       Error::busy,"reset during dispatch denied");
 must(svc.reset(auth(svc,0,9,seed.pc,Action::reset))==Error::badGeneration,
       "reset wrong generation denied");
 must(svc.reset(auth(svc,0,1,seed.pc+4,Action::reset))==Error::wrongPc,
       "reset wrong PC denied");
 preserved("failed reset preserves full CPU/ledger");
 auto beforeReset=svc.prepareAdvance(0,1,seed.pc,1);
 must(svc.reset(auth(svc,0,1,seed.pc,Action::reset))==Error::ok,
       "synthetic issuer quiescent reset");
 must(svc.open(auth(svc,0,1,seed.pc,Action::open),seed)==Error::staleGeneration,
       "retired generation cannot reopen");
 must(svc.open(auth(svc,0,2,seed.pc,Action::open),seed)==Error::ok,
       "new generation after reset");
 must(svc.commit(std::move(*beforeReset.candidate),
       auth(svc,0,2,seed.pc,Action::commit))==Error::badGeneration,
       "prepared ticket from old generation denied");
 must(svc.snapshot(0,after,ticks,gen,rev)&&same(after,seed)&&ticks==0&&rev==0&&gen==2,
       "new generation unchanged after stale commit");
 must(svc.prepareTicks(0,2,seed.pc,0).error==Error::ok,"zero timebase candidate");
 auto max=svc.prepareTicks(0,2,seed.pc,std::numeric_limits<uint64_t>::max());
 must(max.error==Error::ok,"UINT64_MAX prepare");
 must(svc.commit(std::move(*max.candidate),auth(svc,0,2,seed.pc,Action::commit))==
       Error::ok,"UINT64_MAX commit");
 must(svc.snapshot(0,after,ticks,gen,rev)&&ticks==std::numeric_limits<uint64_t>::max()&&
       after.gpr[3]==0xffffffffu&&after.gpr[4]==0xffffffffu,
       "UINT64_MAX exact register split and clock");
 must(svc.prepareAdvance(0,2,seed.pc,1).error==Error::overflow,
       "UINT64_MAX overflow denied");
 must(svc.prepareTicks(0,2,seed.pc,0).error==Error::regression,
       "UINT64_MAX regression denied");
 must(svc.prepareNanoseconds(0,2,seed.pc,std::numeric_limits<uint64_t>::max()).error==
       Error::regression,"uint64 max nanoseconds cannot move time backward");
 // Old service dies, new service takes EXACT SAME address and guest generation.
 alignas(TransactionService) unsigned char buffer[sizeof(TransactionService)]{};
 auto* first=new(buffer) TransactionService{};
 must(first->open(auth(*first,0,1,seed.pc,Action::open),seed)==Error::ok,
       "ABA first owner open");
 auto stalePrepared=first->prepareTicks(0,1,seed.pc,100);
 auto staleAuthority=auth(*first,0,1,seed.pc,Action::commit);
 first->~TransactionService();
 auto* replacement=new(buffer) TransactionService{};
 must(replacement==first,"ABA same native address reused");
 must(replacement->open(auth(*replacement,0,1,seed.pc,Action::open),seed)==Error::ok,
       "ABA same guest/PC/generation reopened");
 must(replacement->commit(std::move(*stalePrepared.candidate),
       auth(*replacement,0,1,seed.pc,Action::commit))==Error::untrusted,
       "old candidate incarnation denied");
 auto freshOnB=replacement->prepareTicks(0,1,seed.pc,100);
 must(replacement->commit(std::move(*freshOnB.candidate),
       std::move(staleAuthority))==Error::untrusted,
       "old authority incarnation denied");
 must(replacement->snapshot(0,after,ticks,gen,rev)&&same(after,seed)&&ticks==0&&rev==0,
       "both ABA failures leave new guest unchanged");
 auto realNew=replacement->prepareTicks(0,1,seed.pc,100);
 must(replacement->commit(std::move(*realNew.candidate),
       auth(*replacement,0,1,seed.pc,Action::commit))==Error::ok,
       "new instance legitimate candidate and authority commit");
 replacement->~TransactionService();
 // 512 deterministic increasing transactions, checking EACH commit.
 TransactionService fuzz;
 must(fuzz.open(auth(fuzz,0,500,seed.pc,Action::open),seed)==Error::ok,
       "fuzz guest open");
 uint64_t random=0x40e0017ULL, sum=0;bool monotonic=true;
 for(int i=0;i<512;i++){
   random=(random*1664525ULL+1013904223ULL)&0xffffffffULL;
   const uint64_t delta=random+1;
   auto p=fuzz.prepareAdvance(0,500,seed.pc,delta);
   sum+=delta;
   if(p.error!=Error::ok||
      fuzz.commit(std::move(*p.candidate),
        auth(fuzz,0,500,seed.pc,Action::commit))!=Error::ok ||
      !fuzz.snapshot(0,after,ticks,gen,rev)||ticks!=sum||
      rev!=static_cast<uint64_t>(i+1)||
      ((uint64_t(after.gpr[3])<<32)|after.gpr[4])!=sum||
      after.pc!=seed.pc||after.lr!=seed.lr||
      after.gpr[1]!=seed.gpr[1]||after.fpr[3].raw!=seed.fpr[3].raw||
      after.gqr[1]!=seed.gqr[1]) {monotonic=false;break;}
 }
 must(monotonic,"512 native fuzz exact 64-bit co-commits and CPU invariants");
 must(fuzz.prepareNanoseconds(0,500,seed.pc,
      std::numeric_limits<uint64_t>::max()).error==Error::ok,
      "max uint64 nanoseconds converted without overflow");
 std::cout<<"TOTAL_CHECKS "<<checks<<"\n";
}
