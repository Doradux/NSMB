// PHASE20: PRIVATE W03-owned synthetic service fixture, included from
// frame_loop.cpp inside extern "C". This .inc is part of the same TU so it
// sees the anonymous W03 slot state; there is NO public native Ticket issuer.
// All Request/GateView fields are untrusted PURE CANDIDATE data, not grants.
static bool phase20Stage(uint32_t guest,uint32_t version,uint32_t rawId,
                         uint64_t value) noexcept {
  auto* t=find(guest);
  if(!t || !t->serviceFixture || t->state!=READY || t->kind!=1 ||
     t->serviceQuota==0 || t->clockPending ||
     t->cpu.pc!=SyntheticCpu::Entry ||dispatching || serviceExecuting ||
     serviceExhausted ||!t->serviceOwner) {
    lastError=9;return false;
  }
  const auto id=static_cast<nsmbw::p19::services::ServiceId>(rawId);
  #if defined(NSMB_P20_ENABLE_SERVICE_V2)
  constexpr uint32_t selectedAbi=nsmbw::p20::services::kAbiVersion;
  #else
  constexpr uint32_t selectedAbi=nsmbw::p19::services::kAbiVersion;
  #endif
  if(version!=selectedAbi ||
     !nsmbw::p19::services::isAllowlisted(id)) {
    lastError=8;return false;
  }
  // Real per-guest W03 private lease serial, NEVER caller-supplied.
  auto ticket=nsmbw::trusted_cpu::leaseSynthetic(guest);
  if(!t->outstandingService){lastError=9;return false;}
  nsmbw::trusted_cpu::CanonicalClockPlan plan{};
#if defined(NSMB_P20_ENABLE_SERVICE_V2)
  // Same SOURCE-ONLY Toad V2 contract when peer source is linked by Mario.
  // Claim fields are forgeable even if filled from W03; only native Ticket
  // and PRIVATE quota below can authorize or consume a real service.
  nsmbw::p20::services::RequestV2 request{};
  request.version=version;request.service=id;request.slot=guest;
  request.expectedPc=SyntheticCpu::Entry;
  request.epoch=serviceEpoch;request.revision=t->clockRevision;
  request.value=value;
  nsmbw::p20::services::ViewV2 view{};
  view.slot=guest;view.currentPc=t->cpu.pc;view.epoch=serviceEpoch;
  view.revision=t->clockRevision;view.previousTicks=t->clockTicks;
  view.claimedBudget=t->serviceQuota;view.enabled=true;
  view.origin=nsmbw::p20::services::OriginClaim::nativeScheduler;
  view.phase=nsmbw::p20::services::PhaseClaim::ready;
  view.guestReady=true;view.busy=dispatching||serviceExecuting;
  view.hasPrevious=t->clockCommitted;
  const auto result=nsmbw::p20::services::compute(request,view);
  if(!result.computed() || !nsmbw::p20::services::consistent(result.candidate)){
    t->outstandingService=0;lastError=8;return false;
  }
  const auto& proposed=result.candidate;
  plan={proposed.rawTicks,proposed.high32,proposed.low32,
        proposed.sourceEpoch,proposed.sourceRevision};
#else
  // Base P20 default remains P19 typed v1 until Toad's exact SHA merges.
  nsmbw::p19::services::Request request{};
  request.version=version;request.id=id;request.slot=guest;
  request.expectedPc=SyntheticCpu::Entry;
  request.epoch=serviceEpoch;request.revision=t->clockRevision;
  request.serial=t->outstandingService;request.value=value;
  nsmbw::p19::services::GateView view{};
  view.slot=guest;view.pc=t->cpu.pc;view.epoch=serviceEpoch;
  view.revision=t->clockRevision;view.serial=t->outstandingService;
  view.lastCommittedTicks=t->clockTicks;
  view.remainingBudget=t->serviceQuota; // PURE preflight ECHO, NOT authority
  view.origin=nsmbw::p19::services::Origin::nativeScheduler;
  view.phase=nsmbw::p19::services::Phase::ready;
  view.enabled=true;view.guestReady=true;
  view.dispatchBusy=dispatching||serviceExecuting;
  view.clockCommitted=t->clockCommitted;
  const auto result=nsmbw::p19::services::prepare(request,view);
  if(!result.computed() || !nsmbw::p19::services::consistent(result.candidate)) {
    t->outstandingService=0;lastError=8;return false;
  }
  const auto& proposed=result.candidate;
  plan={proposed.ticks,proposed.high32,proposed.low32,
        proposed.sourceEpoch,proposed.sourceRevision};
#endif
  // The native lease + private quota must be checked BOTH on arm and in
  // the actual scheduler tick, not inferred from a forged GateView.
  const auto authorized=nsmbw::trusted_cpu::armClockInternal(
    ticket,SyntheticCpu::Entry,plan,true,true);
  if(authorized!=nsmbw::trusted_cpu::ClockArm::accepted) {
    lastError=8;return false;
  }
  t->clockServiceId=rawId; // quota remains 1 UNTIL dispatch, no early debit
  lastError=0;return true;
}
// PUBLIC fixture creates a NEW fictitious guest with W03-HARDCODED quota=1.
// No arbitrary PC, no quota argument, no CpuContext*, no Ticket/issuer export.
int EXPORT nsmbw_loop_synthetic_service_fixture_spawn(uint32_t id,
    uint32_t stackTop,uint32_t inputGuest,uint32_t outputGuest,uint32_t salt,
    uint32_t version,uint32_t serviceId,uint32_t high,uint32_t low) {
  if(dispatching||serviceExecuting){lastError=8;return 0;}
#if defined(NSMB_P20_ENABLE_SERVICE_V2)
  constexpr uint32_t selectedAbi=nsmbw::p20::services::kAbiVersion;
#else
  constexpr uint32_t selectedAbi=nsmbw::p19::services::kAbiVersion;
#endif
  if(version!=selectedAbi ||
     !nsmbw::p19::services::isAllowlisted(
       static_cast<nsmbw::p19::services::ServiceId>(serviceId))) {
    lastError=8;return 0;
  }
  if(!nsmbw_loop_cpu_spawn(id,SyntheticCpu::Entry,stackTop,
                           inputGuest,outputGuest,salt))return 0;
  auto* t=find(id);
  t->serviceFixture=true;t->serviceQuota=1;
  if(!phase20Stage(id,version,serviceId,(uint64_t(high)<<32)|low)) {
    *t=Context{}; // no CPU/register/ledger publication happened
    return 0;
  }
  return 1;
}
// Existing P20 TEST fixture only. User may REQUEST but never receives a
// Ticket, cannot supply quota and cannot spend after W03's private quota=0.
int EXPORT nsmbw_loop_synthetic_service_fixture_retry(uint32_t guest,
    uint32_t version,uint32_t serviceId,uint32_t high,uint32_t low) {
  return phase20Stage(guest,version,serviceId,(uint64_t(high)<<32)|low)?1:0;
}
uint32_t EXPORT nsmbw_loop_synthetic_service_quota(uint32_t guest) {
  const auto* t=find(guest);
  return t&&t->kind==1&&t->serviceFixture?t->serviceQuota:0;
}
uint32_t EXPORT nsmbw_loop_synthetic_service_id(uint32_t guest) {
  const auto* t=find(guest);
  return t&&t->kind==1&&t->serviceFixture?t->clockServiceId:0;
}
#if defined(NSMB_P20_ENABLE_TOY_LEAF) && defined(NSMB_P20_ENABLE_SERVICE_V2)
// Link the EXACT peer's invented generated C++ source, not any Nintendo
// instructions. Pure leaf evaluation is re-executed INSIDE actual W03 tick
// before committing GPR+clock+revision+quota and toy PC/LR/steps together.
// The public tuple creates only a NEW dedicated fixture; it NEVER issues
// an authorized service on an arbitrary pre-existing guest.
int EXPORT nsmbw_loop_synthetic_toy_leaf_fixture_spawn(uint32_t guest,
 uint32_t stackTop,uint32_t inputGuest,uint32_t outputGuest,uint32_t salt,
 uint32_t initialR3,uint32_t entryOffset,uint32_t maxSteps) {
  if(dispatching||serviceExecuting){lastError=8;return 0;}
  if(!nsmbw_loop_cpu_spawn(guest,SyntheticCpu::Entry,stackTop,
                           inputGuest,outputGuest,salt))return 0;
  auto* t=find(guest);
  t->serviceFixture=true;t->serviceQuota=1;
  t->cpu.gpr[3]=initialR3;
  const nsmbw::p20::toy::Input input{
    entryOffset,SyntheticCpu::Entry,initialR3,
    t->cpu.lr,t->cpu.gpr[1],maxSteps};
  const auto result=nsmbw::p20::toy::evaluate(input);
  if(!result.computed() ||result.steps==0||
     result.returnPc!=SyntheticCpu::Entry+4u) {
    *t=Context{};lastError=8;return 0;
  }
  constexpr uint32_t rawTicks=static_cast<uint32_t>(
    nsmbw::p19::services::ServiceId::rawClockFromTicks);
  if(!phase20Stage(guest,nsmbw::p20::services::kAbiVersion,
                    rawTicks,uint64_t(result.gpr3))) {
    *t=Context{};lastError=8;return 0;
  }
  t->toyLeafPending=true;t->toyLeafEntry=entryOffset;
  t->toyLeafMaxSteps=maxSteps;
  return 1;
}
#endif
