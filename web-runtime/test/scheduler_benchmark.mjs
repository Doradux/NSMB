import createScheduler from '../dist/scheduler.mjs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
const wasm = fileURLToPath(new URL('../dist/scheduler.wasm', import.meta.url));
const instance = await createScheduler({ locateFile: () => wasm });
const call = (name,...args) => instance['_nsmbw_sched_'+name](...args);
const cycles = 25000;
const started = performance.now();
for(let cycle=0;cycle<cycles;cycle++){
  call('reset');
  for(const id of [1,2,3]) if(call('spawn',id,4)!==1) throw Error('spawn failed');
  for(let n=0;n<12;n++) if(call('step')<=0) throw Error('unexpected early exhaustion');
  if(call('done')!==3) throw Error('incomplete cycle');
}
const elapsed = performance.now()-started;
const operations = cycles*12;
console.log(JSON.stringify({cycles,contextsPerCycle:3,dispatches:operations,
elapsedMs:Math.round(elapsed*1000)/1000,
dispatchesPerSecond:Math.round(operations*1000/elapsed),
environment:'Node JS-to-Wasm synthetic state-machine dispatch only; not real frame performance'}));
