// Deterministic, HOST-SUPPLIED synthetic virtual ticks. No Date/performance,
// no polling or real OS timebase. Only low 32 bits stored in checked Wii RAM.
// Not the Nintendo OSGetTick/OSGetTime 64-bit ABI.
const MAX64=(1n<<64n)-1n;
const MAX_STEP=60750000n; // diagnostic guard: at most 1 virtual second per advance
const uint64=(v,name)=>{
  if(typeof v!=='bigint'||v<0n||v>MAX64)throw new RangeError('INVALID_'+name);
  return v;
};
export function createSyntheticTickClock(module,{address=0x80008000,initial=0n}={}) {
  if(!Number.isSafeInteger(address)||address<0||address>0xFFFFFFFF||(address&3)!==0)
    throw new RangeError('INVALID_TICK_ADDRESS');
  uint64(initial,'TICK');
  const store=module?._nsmbw_services_tick_store32;
  const status=module?._nsmbw_services_tick_status;
  if(typeof store!=='function'||typeof status!=='function')
    throw new TypeError('MISSING_CHECKED_TICK_SERVICE');
  let last=initial;
  let busy=false;
  function publish(candidate) {
    uint64(candidate,'TICK');
    if(candidate<last)throw new RangeError('TICK_REGRESSION');
    if(busy)throw new Error('REENTRANT_TICK_SERVICE');
    busy=true;
    try {
      const previous=last;
      const word=Number(candidate&0xFFFFFFFFn);
      const written=store(address,word)===1;
      const code=status();
      // Clock does NOT advance on quota/MMIO error; safe retry of exact tick
      // never duplicates an external device side effect.
      if(written&&code===0)last=candidate;
      return Object.freeze({written:written&&code===0,status:code,low32:word,
        elapsedTicks:last,rolledOver:written&&code===0 &&
          (candidate>>32n)!==(previous>>32n)});
    } finally {busy=false;}
  }
  return Object.freeze({
    get ticks(){return last;},
    publish,
    advance(delta=1n) {
      uint64(delta,'TICK_STEP');
      if(delta>MAX_STEP)throw new RangeError('TICK_STEP_TOO_LARGE');
      if(delta>MAX64-last)throw new RangeError('TICK_OVERFLOW');
      return publish(last+delta);
    },
    // Only resets this host adapter's bookkeeping, NOT module-wide guest RAM.
    reset(value=0n){uint64(value,'TICK');if(busy)throw Error('REENTRANT_TICK_SERVICE');last=value;}
  });
}
