// SAME executable oracle in Node and REAL Chromium against a freshly
// source-compiled THREE-SHA public invented PPC-Lite -> native W03 + Toad V2.
// Pure public candidate != Ticket. All CPU/ledger/quota data are read from
// real Emscripten W03 exports, NEVER a fake JS scheduler or Nintendo HLE.
export function runPeerToyService(m,{stressCount=1024}={}) {
 let checks=0;
 const ok=(yes,why)=>{if(!yes)throw Error('P20_PEER_TOY_FAIL '+why);++checks;};
 const get=name=>{
  const f=m['_nsmbw_loop_'+name];
  if(typeof f!=='function')throw Error('MISSING_REAL_W03_PEER '+name);
  return f;
 };
 const reset=get('reset'),tick=get('tick'),
  toy=get('synthetic_toy_leaf_fixture_spawn'),
  direct=get('synthetic_service_fixture_spawn'),
  retry=get('synthetic_service_fixture_retry'),
  quota=get('synthetic_service_quota'),service=get('synthetic_service_id'),
  clockHi=get('clock_ticks_hi'),clockLo=get('clock_ticks_lo'),
  revision=get('clock_revision_lo'),cpuGpr=get('cpu_gpr'),
  cpuSteps=get('cpu_steps'),cpuLr=get('cpu_lr'),pc=get('pc'),
  state=get('state'),pending=get('clock_pending'),err=get('error'),
  suspend=get('suspend'),resume=get('resume'),cancel=get('cancel'),reap=get('reap');
 const u=v=>v>>>0,full=(hi,lo)=>(BigInt(u(hi))<<32n)|BigInt(u(lo));
 const clock=id=>full(clockHi(id),clockLo(id));
 const stack=id=>0x8000f010+id*0x1000;
 const input=id=>0x80003000+id*0x1000;
 const output=id=>0x8000b000+id*0x1000;
 const toyNew=(id,r3,entry=0,limit=128)=>toy(
  id,stack(id),input(id),output(id),0xbeef,r3,entry,limit);
 const nano=0x53560001,raw=0x53560002,entryPc=0x80010000;
 const typed=(id,sid,value,version=2)=>direct(id,stack(id),input(id),output(id),
  0xbeef,version,sid,Number((value>>32n)&0xffffffffn),
  Number(value&0xffffffffn));
 const repeat=(id,sid,value,version=2)=>retry(id,version,sid,
  Number((value>>32n)&0xffffffffn),Number(value&0xffffffffn));
 ok(!Object.keys(m).some(s=>
   /leaseSynthetic|armCanonicalClock|forgeForNativeTest|CpuContext|quota_set|quota_grant|OSGetTime/.test(s)),
   'private native W03 issuer/guest pointer/quota setter not exported');
 reset();
 ok(repeat(1,raw,118n)===0&&quota(1)===0,
   'invented JS cannot use forged ViewV2 to mint existing guest Ticket');
 ok(typed(1,nano,1000000000n,1)===0&&state(1)===0,
   'V1 ABI rejected by actual V2 linked dispatcher');
 ok(typed(1,0xFFFFFFFF,1n)===0&&state(1)===0,
   'unknown service ID cannot create guest or grant quota');
 ok(toyNew(1,100)===1,'new fixed-PC toy leaf W03 fixture creates quota1');
 ok(quota(1)===1&&service(1)===raw&&pending(1)===1,
   'native private W03 quota1 + rawTicks V2 candidate pending');
 ok(u(cpuGpr(1,3))===100&&u(pc(1))===entryPc&&
    cpuSteps(1)===0&&revision(1)===0&&clock(1)===0n,
   'pure translated leaf PREPARE does not publish candidate in CPU/clock');
 ok(repeat(1,raw,999n)===0&&quota(1)===1,
   'host cannot replace staged typed rawTicks candidate or spend early');
 const originalLr=u(cpuLr(1));
 ok(tick()===1,'REAL W03 scheduler calls generated C++ PPC-Lite evaluator');
 ok(clock(1)===118n&&full(cpuGpr(1,3),cpuGpr(1,4))===118n&&
    revision(1)===1,'invented PPC 100+18 -> r3/r4 and ONE canonical clock');
 ok(cpuSteps(1)===8&&u(pc(1))===entryPc+4&&
    u(cpuLr(1))===originalLr,
   'actual translated instruction step count / returnPC / LR co-committed');
 ok(quota(1)===0&&pending(1)===0,
   'same native W03 commit decrements service quota exactly 1->0');
 const before={gpr:Array.from({length:32},(_,i)=>u(cpuGpr(1,i))),
  clock:clock(1),revision:revision(1),steps:cpuSteps(1),pc:u(pc(1)),
  lr:u(cpuLr(1)),quota:quota(1),pending:pending(1)};
 ok(repeat(1,raw,118n)===0&&err()!==0,'second typed request denied by REAL private quota0');
 ok(before.gpr.every((x,i)=>u(cpuGpr(1,i))===x)&&
    before.clock===clock(1)&&before.revision===revision(1)&&
    before.steps===cpuSteps(1)&&before.pc===u(pc(1))&&
    before.lr===u(cpuLr(1))&&before.quota===quota(1)&&
    before.pending===pending(1),
   'quota0 deny changes NO CPU/GPR/PC/LR/ledger/quota');
 ok(toyNew(1,200)===0&&quota(1)===0,'same guest ID cannot be granted new fixture');
 reset();
 ok(toyNew(1,100,0x40)===1&&tick()===1&&clock(1)===104n&&
    quota(1)===0,'nested generated invented PPC 100-3+7=104 under W03');
 reset();
 ok(toyNew(1,100,0xFEED)===0&&state(1)===0&&quota(1)===0,
   'forbidden unknown toy entry does not mint Ticket or guest');
 ok(toyNew(1,100,0,1)===0&&state(1)===0,
   'insufficient generated toy step budget denies without CPU writes');
 ok(typed(1,nano,1000000000n)===1&&tick()===1&&
    clock(1)===60750000n&&quota(1)===0,
   'actual Toad V2 nanos conversion in W03 private quota scheduler');
 reset();
 ok(toyNew(1,100)===1&&typed(2,raw,4294967296n)===1,
   'independent toy and V2 raw service guest native quota1');
 ok(tick()===1&&tick()===2,'real W03 round robin executes both guests');
 ok(clock(1)===118n&&clock(2)===4294967296n&&
    u(cpuGpr(2,3))===1&&quota(1)===0&&quota(2)===0,
   'one canonical clock per guest and 2^32 carry high GPR word');
 reset();
 ok(toyNew(1,100)===1&&suspend(1)===1&&quota(1)===1,
   'suspend cancels staged toy event without charging quota');
 ok(resume(1)===1&&repeat(1,raw,118n)===1&&tick()===1&&quota(1)===0,
   'resume uses at most one remaining private service unit');
 reset();
 ok(toyNew(1,100)===1&&cancel(1)===1&&reap(1)===1,
   'cancel/reap destroys old ticket/epoch/slot/quota');
 ok(repeat(1,raw,118n)===0&&toyNew(1,100)===1&&tick()===1&&
    quota(1)===0&&clock(1)===118n,
   'recycled guest cannot revive old quota and gets new owner');
 reset();
 const start=performance.now();let stress=true;
 for(let i=0;i<stressCount;i++){
  reset();
  const r3=100+i;
  if(toyNew(1,r3)!==1||quota(1)!==1||tick()!==1||
     clock(1)!==BigInt(r3+18)||cpuSteps(1)!==8||
     quota(1)!==0||repeat(1,raw,BigInt(r3+18))!==0){
    stress=false;break;
  }
 }
 const ms=performance.now()-start;
 ok(stress,'actual 3-SHA compiled toy C++ + Toad V2 + W03 1024 resets');
 return {checks,stressCount,stressMs:ms,exampleTicks:'118',
   examplePrivateQuota:'0',toySteps:8};
}
