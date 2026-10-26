// Independent Node tests for public C++ reference and JS BigInt oracle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTime64Oracle,nanosecondsToTicks,splitTimebase,TICKS_PER_SECOND,MAX_U64}
  from '../../../web-runtime/runtime-services/synthetic_time64_host.mjs';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
test('native C++ fixture compiles -Werror and verifies 42 independent checks', t=>{
  const dir=mkdtempSync(join(tmpdir(),'nsmb-w15-time64-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const bin=join(dir,'reference');
  const build=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
    '-Werror','-pedantic',join(root,'tests/phase15/toad/os_time64_reference_native.cpp'),
    '-o',bin],{encoding:'utf8',timeout:30000,env:process.env});
  assert.equal(build.status,0,build.stderr||build.stdout);
  const run=spawnSync(bin,[],{encoding:'utf8',timeout:10000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  assert.match(run.stdout,/TOTAL_CHECKS 42\s*$/);
  assert.equal((run.stdout.match(/^PASS /gm)||[]).length,42);
});
test('one second exactly 60.75 MHz without floating precision loss',()=>{
  assert.equal(nanosecondsToTicks(1000000000n),TICKS_PER_SECOND);
  assert.equal(nanosecondsToTicks(4000n),243n);
  assert.equal(nanosecondsToTicks(3999n),242n);
});
test('uint64 max nanoseconds convert without intermediate overflow',()=>{
  assert.equal(nanosecondsToTicks(MAX_U64),
    (MAX_U64/4000n)*243n+((MAX_U64%4000n)*243n)/4000n);
});
test('nanoseconds require uint64 BigInt',()=>{
  for(const bad of [-1n,1.5,Infinity,1,MAX_U64+1n,null,'100']){
    assert.throws(()=>nanosecondsToTicks(bad),RangeError);
  }
});
test('r3 high/r4 low split at 32-bit wrap and uint64 end',()=>{
  assert.deepEqual(splitTimebase(0x100000002n),{high:1,low:2});
  assert.deepEqual(splitTimebase(MAX_U64),{high:0xFFFFFFFF,low:0xFFFFFFFF});
  assert.deepEqual(splitTimebase(0n),{high:0,low:0});
});
test('split refuses non uint64 input',()=>{
  for(const bad of [-1n,1,NaN,MAX_U64+1n]){
    assert.throws(()=>splitTimebase(bad),RangeError);
  }
});
test('host clock regression rejected without altering ledger',()=>{
  const clock=createTime64Oracle();
  clock.publish(0x100000002n);
  assert.throws(()=>clock.publish(0x100000001n),/TIMEBASE_REGRESSION/);
  assert.equal(clock.ticks,0x100000002n);
});
test('no fake guest reset exposure; epoch rewind denied',()=>{
  const clock=createTime64Oracle(100n);
  assert.equal(typeof clock.reset,'undefined');
  assert.throws(()=>clock.publish(0n),/TIMEBASE_REGRESSION/);
  assert.equal(clock.ticks,100n);
});
test('independent synthetic host owners isolate state',()=>{
  const a=createTime64Oracle(100n),b=createTime64Oracle(1n);
  a.advance(12n);b.advance(2n);
  assert.equal(a.ticks,112n);assert.equal(b.ticks,3n);
});
test('full unsigned overflow rejects without changing state',()=>{
  const clock=createTime64Oracle(MAX_U64);
  assert.throws(()=>clock.advance(1n),/TIMEBASE_OVERFLOW/);
  assert.equal(clock.ticks,MAX_U64);
});
test('publish/advance require exact BigInt',()=>{
  const clock=createTime64Oracle();
  for(const bad of [0,-1n,MAX_U64+1n,'1']){
    assert.throws(()=>clock.publish(bad),RangeError);
    assert.throws(()=>clock.advance(bad),RangeError);
  }
  assert.equal(clock.ticks,0n);
});
test('128 seeded samples reconstruct full timebase from r3/r4',()=>{
  const clock=createTime64Oracle();
  let ticks=0n,seed=14025n;
  for(let i=0;i<128;i++){
    seed=(seed*1664525n+1013904223n)&0xFFFFFFFFn;
    ticks+=seed;
    const {high,low}=clock.publish(ticks);
    assert.equal((BigInt(high)<<32n)|BigInt(low),ticks);
  }
  assert.equal(clock.ticks,ticks);
});
test('no memory, MMIO, IRQ or native HLE side effects exported',()=>{
  const oracle=createTime64Oracle();
  for(const name of ['_OS__GetTime_HLE','readGuestMemory','writeGuestMemory',
    'mmio','irq','dispatchCpu','reset','registerOverride']){
    assert.equal(Object.hasOwn(oracle,name),false,name);
  }
});
