// Phase 4: ONE Wasm instance owns W03 scheduler, W04/W07 RAM and W08 input packet.
// Synthetic only. No Wii hardware/guest CPU decoding or original game code.
import { writeSyntheticGamepadSnapshot } from './host_input.mjs';
const defaultInput = 0x80004000, defaultOutput = 0x80009000;
const uint32 = n => Number.isSafeInteger(n) && n >= 0 && n <= 0xFFFFFFFF;
const exported = (m,name) => {
  const fn=m?.['_nsmbw_'+name];
  if(typeof fn!=='function') throw new TypeError('MISSING_JOINED_WASM_EXPORT:'+name);
  return fn;
};
export function nextInputSequence(current) {
  if (!Number.isInteger(current) || current<0 || current>255) throw new RangeError('INVALID_SEQUENCE');
  return (current+1)&255;
}
// Accept ONLY a small, bounded synthetic keyboard key set (not DOM input).
// Opposite directions cancel within W08's Gamepad normalizer.
export function keyboardAsStandardGamepad(keys=[]) {
  if ((!Array.isArray(keys) && !(keys instanceof Set)) || keys.size>16 || keys.length>16)
    throw new TypeError('INVALID_KEYBOARD_SNAPSHOT');
  const held=new Set(keys);
  if(held.size>16 || [...held].some(k=>typeof k!=='string' || k.length>24))
    throw new TypeError('INVALID_KEYBOARD_SNAPSHOT');
  const buttons=Array.from({length:17},()=>({pressed:false,value:0}));
  for(const [name,index] of [['ArrowUp',12],['ArrowDown',13],
    ['ArrowLeft',14],['ArrowRight',15],['Space',0],['KeyZ',1],['Escape',9]]){
    if(held.has(name))buttons[index]={pressed:true,value:1};
  }
  return {connected:true,mapping:'standard',index:0,axes:[0,0,0,0],buttons};
}
export function applyJoinedInputFrame(module, gamepads, {
  guestId=1, inputAddress=defaultInput, outputAddress=defaultOutput,
  sequence=0, addend=1, deadzone=0.2
}={}) {
  if(!Number.isInteger(guestId)||guestId<1||guestId>65535)throw new RangeError('INVALID_GUEST_ID');
  if(!uint32(inputAddress)||!uint32(outputAddress)||inputAddress%4||outputAddress%4)
    throw new RangeError('INVALID_GUEST_ADDRESS');
  if(!uint32(addend))throw new RangeError('INVALID_ADDEND');
  if(!Number.isInteger(sequence)||sequence<0||sequence>255)throw new RangeError('INVALID_SEQUENCE');
  const names=['loop_state','loop_spawn','loop_frame','loop_pc','loop_reg_a','loop_guest_error','loop_retry_safe','loop_ready'];
  const f=Object.fromEntries(names.map(n=>[n,exported(module,n)]));
  // This one-shot helper must not silently run a DIFFERENT ready context.
  // General interleaving remains the host scheduler's explicit responsibility.
  if(f.loop_state(guestId)!==0)throw new Error('GUEST_CONTEXT_MUST_BE_REAPED');
  if(f.loop_ready()!==0)throw new Error('OTHER_GUEST_ALREADY_RUNNABLE');
  const input=writeSyntheticGamepadSnapshot(module,gamepads,inputAddress,sequence,{deadzone});
  if(!input.written)
    return Object.freeze({input,executed:false,guestId,state:0,pc:0,regA:0,guestError:0,retrySafe:1});
  if(f.loop_spawn(guestId,inputAddress,outputAddress,addend,1)!==1)
    throw new Error('JOINED_GUEST_SPAWN_REJECTED');
  const frames=f.loop_frame(1);
  const state=f.loop_state(guestId),pc=f.loop_pc(guestId);
  return Object.freeze({
    input,executed:frames===1,guestId,state,pc,
    regA:f.loop_reg_a(guestId)>>>0,
    guestError:f.loop_guest_error(guestId),retrySafe:f.loop_retry_safe(guestId)
  });
}
export function reapJoinedInputFrame(module, guestId=1) {
  if(!Number.isInteger(guestId)||guestId<1||guestId>65535) throw new RangeError('INVALID_GUEST_ID');
  const state=exported(module,'loop_state')(guestId);
  if(![3,4,5].includes(state))return false;
  return exported(module,'loop_reap')(guestId)===1;
}
