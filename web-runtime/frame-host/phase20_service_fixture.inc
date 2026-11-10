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
  if(version!=nsmbw::p19::services::kAbiVersion ||
     !nsmbw::p19::services::isAllowlisted(id)) {
    lastError=8;return false;
  }
  // Real per-guest W03 private lease serial, NEVER caller-supplied.
  auto ticket=nsmbw::trusted_cpu::leaseSynthetic(guest);
  if(!t->outstandingService){lastError=9;return false;}
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
  const nsmbw::trusted_cpu::CanonicalClockPlan plan{
    proposed.ticks,proposed.high32,proposed.low32,
    proposed.sourceEpoch,proposed.sourceRevision};
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
  if(version!=nsmbw::p19::services::kAbiVersion ||
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
