// ONE shared Node + real Chromium functional oracle: calls actual W03 Wasm
// exports on a fresh synthetic guest, never a JavaScript shadow scheduler.
// NOT an authentic Nintendo/PPC HLE or trusted host wall-clock source.
export function runPrivateServiceFixture(m,{stressCount=1024}={}) {
 let checks=0;
 const expect=(condition,description)=>{
  if(!condition)throw Error('P20_SERVICE_FAIL '+description);
  checks++;
 };
 const get=name=>{
  const f=m['_nsmbw_loop_'+name];
  if(typeof f!=='function')throw Error('MISSING_NATIVE_W03 '+name);
  return f;
 };
 const reset=get('reset'),spawn=get('synthetic_service_fixture_spawn'),
  retry=get('synthetic_service_fixture_retry'),
  quota=get('synthetic_service_quota'),serviceId=get('synthetic_service_id'),
  tick=get('tick'),cpuGpr=get('cpu_gpr'),pc=get('pc'),cpuSteps=get('cpu_steps'),
  revision=get('clock_revision_lo'),clockHi=get('clock_ticks_hi'),
  clockLo=get('clock_ticks_lo'),pending=get('clock_pending'),
  outcome=get('clock_outcome'),state=get('state'),err=get('error'),
  cancel=get('cancel'),reap=get('reap'),suspend=get('suspend'),resume=get('resume');
 const uint=x=>x>>>0,full=(hi,lo)=>(BigInt(uint(hi))<<32n)|BigInt(uint(lo));
 const clock=id=>full(clockHi(id),clockLo(id));
 const value=(id,sid,nanos,version=1)=>spawn(
  id,0x8000f010+id*0x1000,0x80003000+id*0x1000,
  0x8000b000+id*0x1000,0xbeef,version,sid,
  Number(nanos>>32n),Number(nanos&0xffffffffn));
 const again=(id,sid,nanos,version=1)=>retry(
  id,version,sid,Number(nanos>>32n),Number(nanos&0xffffffffn));
 const nanos=0x53560001,raw=0x53560002,entry=0x80010000;
 const target=ns=>(ns/4000n)*243n+((ns%4000n)*243n)/4000n;
 expect(!Object.keys(m).some(k=>
  /leaseSynthetic|armCanonicalClock|forgeForNativeTest|CpuContext|quota_set|quota_grant|service_issuer|OSGetTime/.test(k)),
  'private native issuer, quota setter and pretend-Wii HLE remain unexported');
 reset();
 expect(again(1,nanos,1000000000n)===0,
  'host may NOT service arbitrary guest or forge Ticket');
 expect(quota(1)===0&&pending(1)===0,
  'forged public GateView cannot create real W03 fixture/quota');
 expect(value(1,nanos,1000000000n)===1,'fresh ONLY v1 typed P20 fixture');
 expect(quota(1)===1&&serviceId(1)===nanos&&uint(pc(1))===entry,
  'private hardcoded W03 quota1/typed ID/fixed entry');
 expect(clock(1)===0n&&revision(1)===0&&uint(cpuGpr(1,4))===0x80004000,
  'preparation does not publish the candidate clock or CPU pair');
 expect(pending(1)===1&&cpuSteps(1)===0,
  'native W03 stages without executing any guest instruction');
 expect(again(1,nanos,1n)===0&&quota(1)===1&&pending(1)===1,
  'pending duplicate cannot be charged or rearmed by JS');
 expect(tick()===1&&cpuSteps(1)===0&&uint(pc(1))===entry,
  'real W03 dispatcher executes authorized service event');
 expect(clock(1)===60750000n&&
  full(cpuGpr(1,3),cpuGpr(1,4))===60750000n&&revision(1)===1,
  'single native commit r3/r4 + canonical clock + revision');
 expect(quota(1)===0&&pending(1)===0&&outcome(1)===1,
  'quota1->0 consumed in SAME event not early and not reissued');
 const snapshot={
  gpr:Array.from({length:32},(_,i)=>uint(cpuGpr(1,i))),
  pc:uint(pc(1)),steps:cpuSteps(1),clock:clock(1),
  rev:revision(1),quota:quota(1),outcome:outcome(1),pending:pending(1)
 };
 expect(again(1,nanos,2000000000n)===0&&err()!==0,
  'second request denied even plausible new amount');
 expect(snapshot.gpr.every((v,i)=>uint(cpuGpr(1,i))===v)&&
  snapshot.pc===uint(pc(1))&&snapshot.steps===cpuSteps(1)&&
  snapshot.clock===clock(1)&&snapshot.rev===revision(1)&&
  snapshot.quota===quota(1)&&snapshot.outcome===outcome(1)&&
  snapshot.pending===pending(1),
  'no partial GPR/PC/clock/quota mutation on denied quota0');
 expect(value(1,raw,123n)===0,'duplicate ID cannot be recreated with new quota');
 expect(again(1,0xdeadbeef,0n)===0&&again(1,nanos,0n,99)===0,
  'host forged ServiceId/version cannot override private quota');
 reset();
 expect(value(1,0xdeadbeef,0n)===0&&value(1,nanos,0n,99)===0,
  'unknown ID or ABI version rejected before making new guest');
 expect(state(1)===0&&quota(1)===0,
  'unsupported typed requests leave CPU/clock/quota absent');
 expect(value(1,raw,(1n<<64n)-1n)===1&&tick()===1,
  'raw tick service handles full uint64 boundary');
 expect(clock(1)===(1n<<64n)-1n&&
  full(cpuGpr(1,3),cpuGpr(1,4))===(1n<<64n)-1n&&quota(1)===0,
  '64-bit raw tick hi+lo and private quota commit consistent');
 reset();
 expect(value(1,nanos,(1n<<64n)-1n)===1&&tick()===1,
  'uint64 max nanoseconds accepted as untrusted pure input');
 expect(clock(1)===target((1n<<64n)-1n)&&quota(1)===0,
  'exact integer Time64 at overflow bound, no extra budget');
 reset();
 expect(value(1,nanos,1000000000n)===1&&suspend(1)===1&&quota(1)===1,
  'suspending pending service does NOT spend private quota');
 expect(resume(1)===1&&again(1,nanos,1000000000n)===1,
  'resumed guest uses its one remaining authorized service');
 expect(tick()===1&&quota(1)===0&&clock(1)===60750000n,
  'resume cannot double spend or replay already committed quota');
 reset();
 expect(value(1,nanos,2000000000n)===1&&cancel(1)===1&&reap(1)===1,
  'cancel+reap retires old slot, ticket and private budget');
 expect(again(1,nanos,1n)===0&&quota(1)===0,
  'recycled ID cannot revive a deleted capability or quota');
 expect(value(1,nanos,1000000000n)===1&&tick()===1,
  'newly created reused ID receives independent quota1');
 expect(clock(1)===60750000n&&quota(1)===0&&revision(1)===1,
  'recycled slot cannot inherit stale clock revision or budget');
 reset();
 expect(value(1,nanos,0n)===1&&value(2,raw,4294967296n)===1,
  'two W03 guests each hold separate one-use native quota');
 expect(tick()===1&&tick()===2,'real W03 round robin dispatches two services');
 expect(quota(1)===0&&quota(2)===0&&
  clock(1)===0n&&clock(2)===4294967296n&&revision(2)===1,
  'independent guest quotas, raw 2^32 high carry and one canonical ledger');
 reset();
 expect(m._nsmbw_mem_set_page_budget(0)===1&&
  value(1,nanos,1000000000n)===1,
  'quota0 W04 RAM page budget does not forge or suppress SERVICE quota1');
 expect(tick()===1&&m._nsmbw_mem_pages()===0&&quota(1)===0,
  'clock service commits with no guest RAM allocations');
 expect(tick()===1&&state(1)===4&&clock(1)===60750000n&&quota(1)===0,
  'later checked W04 fault cannot tear earlier atomic clock+quota');
 reset();
 const start=performance.now();
 let stress=true;
 for(let i=0;i<stressCount;i++){
  reset();
  const ns=BigInt(i)*1000000n;
  if(value(1,nanos,ns)!==1||quota(1)!==1||tick()!==1||
     quota(1)!==0||clock(1)!==target(ns)||revision(1)!==1||
     full(cpuGpr(1,3),cpuGpr(1,4))!==target(ns)||
     again(1,nanos,ns)!==0){stress=false;break;}
 }
 const ms=performance.now()-start;
 expect(stress,'bounded real W03 private quota1->0 with second denied '+stressCount);
 return {checks,stressCount,stressMs:ms,exampleTicks:'60750000',
  exampleRevision:'1',exampleRemainingQuota:'0'};
}
