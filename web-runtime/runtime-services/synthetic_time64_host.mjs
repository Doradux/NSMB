// Public synthetic 64-bit timebase oracle. NOT a native HLE dispatch.
export const TICKS_PER_SECOND=60750000n;
export const MAX_U64=(1n<<64n)-1n;
function valid(v,label){
  if(typeof v!=='bigint'||v<0n||v>MAX_U64)
    throw new RangeError('INVALID_'+label);
  return v;
}
export function nanosecondsToTicks(nanoseconds){
  const n=valid(nanoseconds,'NANOSECONDS');
  return (n/4000n)*243n+((n%4000n)*243n)/4000n;
}
export function splitTimebase(ticks){
  const t=valid(ticks,'TICKS');
  return Object.freeze({high:Number(t>>32n),low:Number(t&0xFFFFFFFFn)});
}
export function createTime64Oracle(initial=0n){
  let last=valid(initial,'TICKS');
  function publish(next){
    const t=valid(next,'TICKS');
    if(t<last)throw new RangeError('TIMEBASE_REGRESSION');
    last=t;
    return splitTimebase(t);
  }
  return Object.freeze({
    get ticks(){return last;},publish,
    advance(delta){
      const d=valid(delta,'DELTA');
      if(d>MAX_U64-last)throw new RangeError('TIMEBASE_OVERFLOW');
      return publish(last+d);
    },
    // No reset; integration needs trusted W03 lifecycle evidence.
  });
}
