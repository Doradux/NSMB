// Invented native scheduler fixture, not Wii code or authentic W03 authority.
#include "time64_pure_clock.hpp"
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <type_traits>
#include <utility>
using namespace nsmbw::time64_pure;
int count=0;
void require(bool b,const char* message) {
 if(!b){std::cerr<<"FAIL "<<message<<'\n';std::exit(7);}
 ++count;std::cout<<"PASS "<<message<<'\n';
}
static_assert(std::is_trivially_copyable<ClockCandidate>::value);
static_assert(std::is_trivially_copyable<Reference>::value);
static_assert(std::is_trivially_copyable<Result>::value);
static_assert(noexcept(prepareFromNanos(0,Reference{},0,0)));
static_assert(noexcept(prepareFromTicks(0,Reference{},0,0)));
static_assert(noexcept(checkedAddTicks(0,0,Reference{},0,0)));
struct SyntheticW03 {
 uint32_t gpr[32]{};
 uint32_t pc=0x80010000,lr=0x8001fff0,gqr=0x1234,ram=0x4567;
 uint64_t canonicalTicks=0, revision=0, epoch=1;
 bool pending=false;
 bool commit(const ClockCandidate& candidate) noexcept {
  Reference before{0,canonicalTicks,epoch,revision,true};
  if(validateForCommit(candidate,before)!=Error::ok || pending)return false;
  gpr[3]=candidate.high32;
  gpr[4]=candidate.low32;
  canonicalTicks=candidate.rawTicks;
  ++revision;
  return true;
 }
};
int main(){
 constexpr uint64_t M=std::numeric_limits<uint64_t>::max();
 const Reference initial{0,0,11,1,false};
 auto good=prepareFromNanos(1000000000ULL,initial,11,1);
 require(good.error==Error::ok,"pure candidate 1 second");
 require(good.candidate.rawTicks==60750000ULL&&good.candidate.high32==0&&
         good.candidate.low32==60750000,"raw timebase 60750000 exactly");
 require(prepareFromNanos(0,initial,11,1).candidate.rawTicks==0,"0ns is 0 ticks");
 require(prepareFromNanos(1,initial,11,1).candidate.rawTicks==0,"1ns truncates to zero");
 require(prepareFromNanos(3999,initial,11,1).candidate.rawTicks==242,"3999ns=242");
 require(prepareFromNanos(4000,initial,11,1).candidate.rawTicks==243,"4000ns=243");
 require(prepareFromNanos(M,initial,11,1).candidate.rawTicks==
         (M/4000ULL)*243ULL+((M%4000ULL)*243ULL)/4000ULL,
         "UINT64_MAX ns no overflow or floating precision loss");
 require(prepareFromNanos(1,initial,12,1).error==Error::staleEpoch,
         "wrong source epoch denied");
 require(prepareFromNanos(1,initial,11,2).error==Error::staleRevision,
         "wrong source revision denied");
 Reference synced{5000,1000,11,1,true};
 require(prepareFromNanos(4999,synced,11,1).error==Error::regressiveHost,
         "host monotonic regression denied");
 require(prepareFromNanos(5000,synced,11,1).error==Error::regressiveTicks,
         "timebase monotonic regression denied");
 require(prepareFromTicks(999,synced,11,1).error==Error::regressiveTicks,
         "raw ticks decreasing denied");
 require(prepareFromTicks(1000,synced,11,1).error==Error::ok,
         "equality at ledger permitted");
 require(prepareFromTicks(0,initial,11,1).error==Error::ok,
         "initial zero raw ticks permitted");
 auto boundary=prepareFromTicks(0x100000000ULL,initial,11,1);
 require(boundary.error==Error::ok && boundary.candidate.high32==1 &&
         boundary.candidate.low32==0,"low32 overflow carry exact");
 auto max=prepareFromTicks(M,initial,11,1);
 require(max.error==Error::ok&&max.candidate.high32==0xffffffffu &&
         max.candidate.low32==0xffffffffu,"UINT64_MAX split exact");
 require(checkedAddTicks(M,1,initial,11,1).error==Error::overflow,
         "tick addition overflow DENIED");
 require(checkedAddTicks(M-1,1,initial,11,1).error==Error::ok,
         "tick add exact UINT64_MAX allowed");
 require(checkedAddTicks(M-1,2,initial,11,1).error==Error::overflow,
         "tick overflow 2 denied");
 require(checkedSignedDelta(4,-1,initial,11,1).error==Error::regressiveTicks,
         "negative signed tick delta denied");
 require(checkedSignedDelta(4,std::numeric_limits<int64_t>::min(),
         initial,11,1).error==Error::regressiveTicks,
         "INT64_MIN signed delta denied without negation UB");
 require(checkedSignedDelta(4,std::numeric_limits<int64_t>::max(),
         initial,11,1).candidate.rawTicks==
         4ULL+static_cast<uint64_t>(std::numeric_limits<int64_t>::max()),
         "INT64_MAX positive signed delta handled");
 require(prepareFromSignedNanos(-1,initial,11,1).error==Error::negativeHost,
         "negative host nanoseconds denied");
 require(prepareFromSignedNanos(std::numeric_limits<int64_t>::min(),
         initial,11,1).error==Error::negativeHost,
         "INT64_MIN host rejected without UB");
 Reference invalidEpoch{0,0,0,0,false};
 require(prepareFromTicks(1,invalidEpoch,0,0).error==Error::staleEpoch,
         "uninitialized zero epoch never source of trust");
 Reference revisionMax{0,0,11,M,true};
 require(prepareFromTicks(1,revisionMax,11,M).error==Error::overflow,
         "canonical revision overflow fail closed");
 require(validateForCommit(boundary.candidate,initial)==Error::ok,
         "well-formed candidate validation");
 auto corrupt=boundary.candidate;corrupt.high32=0;
 require(validateForCommit(corrupt,initial)==Error::malformed,
         "swapped/malformed high32 denied at commit validation");
 corrupt=boundary.candidate;corrupt.low32=1;
 require(validateForCommit(corrupt,initial)==Error::malformed,
         "malformed low32 denied at commit validation");
 corrupt=boundary.candidate;corrupt.sourceEpoch++;
 require(validateForCommit(corrupt,initial)==Error::staleEpoch,
         "fake epoch fails commit preflight");
 corrupt=boundary.candidate;corrupt.sourceRevision++;
 require(validateForCommit(corrupt,initial)==Error::staleRevision,
         "fake revision fails commit preflight");
 // A synthetic THREE-GUEST *single-ledger* scheduler is a model only.
 // Actual scheduler-owned commit is separately tested against W03 below.
 SyntheticW03 guests[3]{};
 guests[0].epoch=101;guests[1].epoch=102;guests[2].epoch=103;
 auto unchanged=[](const SyntheticW03& x,const SyntheticW03& y) {
   if(x.pc!=y.pc||x.lr!=y.lr||x.gqr!=y.gqr||x.ram!=y.ram||
      x.canonicalTicks!=y.canonicalTicks||x.revision!=y.revision||
      x.epoch!=y.epoch||x.pending!=y.pending)return false;
   for(unsigned i=0;i<32;i++) if(x.gpr[i]!=y.gpr[i]) return false;
   return true;
 };
 SyntheticW03 old=guests[0];
 Reference refA{0,0,guests[0].epoch,guests[0].revision,true};
 auto tx=prepareFromTicks(0x100000001ULL,refA,101,0);
 require(tx.ok() && unchanged(guests[0],old),"pure prepare cannot mutate any CPU bit");
 require(guests[0].commit(tx.candidate),"one synthetic owner atomic commit");
 require(guests[0].gpr[3]==1&&guests[0].gpr[4]==1&&
         guests[0].canonicalTicks==0x100000001ULL&&guests[0].revision==1,
         "single mock owner publishes two GPRs and one ledger");
 old=guests[0];
 require(!guests[0].commit(tx.candidate),"same candidate cannot pass revised reference");
 require(unchanged(guests[0],old),"stale revision failure untouched");
 auto cross=prepareFromTicks(20,Reference{0,0,102,0,false},102,0);
 require(cross.ok() && !guests[0].commit(cross.candidate),
         "cross-guest reference rejected");
 require(unchanged(guests[0],old) && guests[1].canonicalTicks==0,
         "cross guest failure changes no context");
 auto wrongEpoch=tx.candidate;wrongEpoch.sourceEpoch=100;
 require(!guests[0].commit(wrongEpoch),"wrong epoch rejected");
 require(unchanged(guests[0],old),"wrong epoch no torn state");
 auto regression=prepareFromTicks(guests[0].canonicalTicks-1,
         Reference{0,guests[0].canonicalTicks,101,1,true},101,1);
 require(regression.error==Error::regressiveTicks,"single owner preflight denies regression");
 auto pending=prepareFromTicks(guests[0].canonicalTicks+1,
         Reference{0,guests[0].canonicalTicks,101,1,true},101,1);
 guests[0].pending=true;old=guests[0];
 require(pending.ok()&&!guests[0].commit(pending.candidate),
         "injected scheduler pending denies commit");
 require(unchanged(guests[0],old),"busy failure zero CPU/ledger effects");
 guests[0].pending=false;
 require(guests[0].commit(pending.candidate),"fresh permit after busy accepted");
 // Simulated reset to new epoch without reusing the old ticket.
 auto retired=pending.candidate;
 guests[0]=SyntheticW03{};guests[0].epoch=104;
 old=guests[0];
 require(!guests[0].commit(retired),"retired epoch candidate denied after reset");
 require(unchanged(guests[0],old),"reset epoch ABA cannot mutate new CPU");
 // Failure injection and success for 3 isolated invented guests, 2048 steps.
 uint64_t random=0x123456789abcdefULL;
 bool fuzz=true;
 for(unsigned i=0;i<2048;i++){
   random=(random*6364136223846793005ULL)+1442695040888963407ULL;
   SyntheticW03& host=guests[i%3];
   Reference current{0,host.canonicalTicks,host.epoch,host.revision,true};
   const uint64_t delta=(random>>48u)+1u;
   auto proposed=checkedAddTicks(host.canonicalTicks,delta,
                                  current,host.epoch,host.revision);
   if(!proposed.ok()){fuzz=false;break;}
   auto candidate=proposed.candidate;
   const auto before=host;
   if(!unchanged(host,before)){fuzz=false;break;}
   if(i%7==0){
     ++candidate.sourceRevision;
     if(host.commit(candidate)||!unchanged(host,before)){fuzz=false;break;}
   } else if(i%11==0){
     host.pending=true;
     const auto pendingBefore=host;
     if(host.commit(candidate)||!unchanged(host,pendingBefore)){fuzz=false;break;}
     host.pending=false;
   } else {
     if(!host.commit(candidate)||
        host.canonicalTicks!=candidate.rawTicks||
        host.gpr[3]!=candidate.high32||host.gpr[4]!=candidate.low32||
        host.revision!=before.revision+1||
        host.pc!=before.pc||host.lr!=before.lr||host.gqr!=before.gqr||
        host.ram!=before.ram){fuzz=false;break;}
   }
   if(i%181==0){
     auto oldCand=candidate;const auto beforeRecycle=host;
     host=SyntheticW03{};host.epoch=beforeRecycle.epoch+3;
     const auto afterRecycle=host;
     if(host.commit(oldCand)||!unchanged(host,afterRecycle)){fuzz=false;break;}
   }
 }
 require(fuzz,"2048 deterministic mixed 3-guest fuzz operations preserve atomic invariants");
 std::cout<<"TOTAL_CHECKS "<<count<<'\n';
}
