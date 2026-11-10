// Shared, environment-neutral functional oracle. SAME source executes in Node
// and Chromium against ONE fresh compiled Emscripten Wasm. Never a JS shadow
// scheduler: EVERY mutation/read of CPU/clock calls the REAL native W03 ABI.
export function runClockFixture(mod,{stressCount=128}={}) {
  let checks=0;
  const verify=(pass,why)=>{if(!pass)throw Error('CLOCK_FIXTURE_FAIL '+why);++checks;};
  const get=(name)=>{
    const f=mod['_nsmbw_loop_'+name];
    if(typeof f!=='function')throw Error('MISSING_REAL_W03_EXPORT '+name);
    return f;
  };
  const reset=get('reset'),spawn=get('synthetic_clock_fixture_spawn'),
    tick=get('tick'),pc=get('pc'),state=get('state'),
    cpuGpr=get('cpu_gpr'),cpuSteps=get('cpu_steps'),err=get('error'),
    cancel=get('cancel'),reap=get('reap'),
    suspend=get('suspend'),resume=get('resume'),
    clockHi=get('clock_ticks_hi'),clockLo=get('clock_ticks_lo'),
    revHi=get('clock_revision_hi'),revLo=get('clock_revision_lo'),
    pending=get('clock_pending'),outcome=get('clock_outcome'),
    guestErr=get('guest_error');
  const pages=mod._nsmbw_mem_pages;
  const budget=mod._nsmbw_mem_set_page_budget;
  const entry=0x80010000;
  const uint=x=>x>>>0;
  const join=(a,b)=>(BigInt(uint(a))<<32n)|BigInt(uint(b));
  const getClock=id=>join(clockHi(id),clockLo(id));
  const getRev=id=>join(revHi(id),revLo(id));
  const input=id=>0x80003000+id*0x1000;
  const output=id=>0x8000b000+id*0x1000;
  const stack=id=>0x8000f010+id*0x1000;
  const create=(id,nanos,opts={})=>spawn(
    id,stack(id),opts.input??input(id),output(id),0xbe,
    Number((nanos>>32n)&0xffffffffn),Number(nanos&0xffffffffn));
  const target=(nanos)=>(nanos/4000n)*243n+
    ((nanos%4000n)*243n)/4000n;
  const compare=(id,nanos,msg)=>{
    const expected=target(nanos);
    verify(getClock(id)===expected,msg+' canonical W03 timebase equals integer Time64');
    verify(join(cpuGpr(id,3),cpuGpr(id,4))===expected,
      msg+' real W03 GPR3+GPR4 equals ledger, no JS shadow');
    verify(getRev(id)===1n,msg+' canonical revision committed exactly once');
    verify(outcome(id)===1&&pending(id)===0,msg+' actual W03 commit outcome');
  };
  const forbidden=Object.keys(mod).filter(k=>
    [/_?(leaseSynthetic|armCanonicalClock|armSyntheticClock|forgeForNativeTest)/,
      /clockNativeTest|OSGetTime|Time64PermitIssuer|_nsmbw_loop_clock_set|_nsmbw_loop_service_grant/]
      .some(re=>re.test(k)));
  verify(forbidden.length===0,'private W03 issuer and Wii HLE are NOT exported');
  reset();
  verify(create(1,1000000000n)===1,'fresh fictional guest admitted');
  verify(pending(1)===1&&getClock(1)===0n&&getRev(1)===0n,
    'preparation does NOT publish clock or revision');
  verify(uint(cpuGpr(1,3))===0&&uint(cpuGpr(1,4))===input(1),
    'preparation leaves real W03 GPR3/GPR4 unchanged');
  verify(uint(pc(1))===entry&&uint(cpuSteps(1))===0,
    'synthetic PC only, no opcode executed during prepare');
  verify(create(1,2000000000n)===0&&pending(1)===1,
    'JS cannot arm or override an existing real W03 guest');
  verify(tick()===1,'real W03 scheduler dispatched pending service');
  compare(1,1000000000n,'one second');
  verify(uint(pc(1))===entry&&cpuSteps(1)===0,
    'native clock event did not execute guest instruction');
  verify(pages()===0,'native register-only clock did not allocate guest RAM');
  verify(create(1,1n)===0&&getClock(1)===60750000n&&getRev(1)===1n,
    'replay/duplicate fixture denied, same immutable committed clock');
  verify(tick()===1&&uint(pc(1))===entry+4&&cpuSteps(1)===1,
    'next native tick performs actual W04 checked stack instruction');
  verify(getClock(1)===60750000n&&getRev(1)===1n,
    'regular guest opcode cannot replay clock event');
  reset();
  const carry=((1n<<32n)*4000n/243n)+4000n;
  const fixtures=[[1,0n],[2,1n],[3,carry]];
  for(const [id,ns] of fixtures)
    verify(create(id,ns)===1,'multi guest '+id+' synthetic fixture preparation');
  for(const [id] of fixtures)verify(tick()===id,'native round-robin W03 guest '+id);
  for(const [id,ns] of fixtures)compare(id,ns,'guest '+id);
  verify(uint(cpuGpr(3,3))>=1,'2^32 carry via real W03 high32 register');
  verify(uint(cpuGpr(2,3))===0&&getClock(2)===0n,
    'W03 multi-guest clock isolation');
  verify(getClock(555)===0n&&getRev(555)===0n&&pending(555)===0,
    'unknown guest read-only clock cannot forge mutable state');
  verify(create(0,100n)===0&&err()!==0,'guest id0 denial');
  reset();
  const maxNs=(1n<<64n)-1n;
  verify(create(1,maxNs)===1&&tick()===1,'UINT64_MAX source nanos succeeds');
  compare(1,maxNs,'uint64 max');
  verify(cancel(1)===1&&reap(1)===1&&create(1,10n)===1,
    'recycled guest requires brand-new native fixture creation');
  verify(getClock(1)===0n&&getRev(1)===0n&&pending(1)===1,
    'reset/recycled guest cannot inherit committed old state');
  verify(tick()===1,'recycled W03 guest native event');
  compare(1,10n,'recycled guest');
  verify(suspend(1)===1&&resume(1)===1&&getRev(1)===1n,
    'resume never repeats committed event');
  reset();
  verify(budget(0)===1&&create(1,1000000000n)===1,
    'quota0 permits purely register-based W03 fixture');
  verify(tick()===1&&pages()===0,'quota0 clock commit without W04 allocation');
  compare(1,1000000000n,'quota0 guest');
  verify(tick()===1&&state(1)===4&&guestErr(1)===3,
    'next real checked RAM instruction faults at zero quota');
  verify(getClock(1)===60750000n&&getRev(1)===1n,
    'W04 quota fault cannot tear already committed clock');
  reset();
  verify(budget(8)===1,'restore W04 page budget before MMIO fault exercise');
  // Clock returns its low32 in r4, replacing the original input pointer.
  // Deliberately pick a synthetic time whose low32 IS the MMIO address,
  // otherwise the subsequent guest lwz would read r4=0 and not test MMIO.
  const mmioTicks=0xcc007000n;
  const mmioNanos=(mmioTicks*4000n+242n)/243n;
  verify(target(mmioNanos)===mmioTicks,'synthetic MMIO fixture exact integer low32');
  verify(create(1,mmioNanos,{input:0xcc007000})===1,
    'synthetic MMIO input guest exists only as fixture data');
  verify(tick()===1&&getRev(1)===1n&&getClock(1)===mmioTicks,
    'MMIO fixture registers-only clock commit preceded any MMIO access');
  // Step to MMIO lwz after two checked W04 stack instructions.
  verify(tick()===1&&tick()===1&&tick()===1,
    'actual W03 executes checked stack + later W07 MMIO instruction');
  verify(state(1)===4&&getRev(1)===1n&&getClock(1)===mmioTicks,
    'W07 MMIO fault does not inject another clock or mutate ledger');
  reset();
  const stressStart=performance.now();
  let stress=true;
  for(let i=0;i<stressCount;i++){
    reset();
    const ns=BigInt(i)*40000000n;
    if(create(1,ns)!==1||tick()!==1||getRev(1)!==1n||
       getClock(1)!==target(ns)||
       join(cpuGpr(1,3),cpuGpr(1,4))!==target(ns)){
      stress=false;break;
    }
  }
  const stressElapsedMs=performance.now()-stressStart;
  verify(stress,'bounded native W03 reset/clock stress '+stressCount+' operations');
  return {checks,stressCount,stressElapsedMs,exampleTicks:'60750000',
    exampleRevision:'1',carryNanos:carry.toString()};
}
