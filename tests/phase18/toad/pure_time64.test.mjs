// Phase18 Toad: exact pure Time64 C++ math and synthetic guest stress.
// Real Nintendo code, ROM, DOL, C# producer and Wii HLE are not used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {nanosecondsToTicks,splitTimebase,MAX_U64} from '../../../web-runtime/runtime-services/synthetic_time64_host.mjs';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const include=join(root,'web-runtime/runtime-services');
const pureHeader=join(include,'time64_pure_candidate.hpp');
const refHeader=join(include,'time64_pure_clock.hpp');
const source=join(root,'tests/phase18/toad/pure_time64_native.cpp');
const abi=join(root,'tests/phase18/toad/candidate_abi_native.cpp');
function temp(t, tag) {
  const folder=mkdtempSync(join(tmpdir(),'nsmb-p18-toad-'+tag+'-'));
  t.after(()=>rmSync(folder,{recursive:true,force:true}));
  return folder;
}
function compile(folder, {candidate=source,overlay=false,sanitizers=false}={}) {
 const dest=join(folder,'native');
 const args=['-std=c++17',sanitizers?'-O1':'-O2',
   ...(sanitizers?['-g','-fsanitize=address,undefined','-fno-omit-frame-pointer']:[]),
   '-Wall','-Wextra','-Werror','-pedantic',
   ...(overlay?['-I',folder]:[]),'-I',include,candidate,'-o',dest];
 const result=spawnSync('g++',args,{encoding:'utf8',timeout:40000});
 return {dest,result};
}
function run(dest) {
 return spawnSync(dest,[],{encoding:'utf8',timeout:20000});
}
function mutate(t,label,header,pattern,replacement,expected) {
 const folder=temp(t,label);
 const candidate=readFileSync(pureHeader,'utf8');
 const reference=readFileSync(refHeader,'utf8');
 const original=header==='candidate'?candidate:reference;
 assert.equal(original.split(pattern).length-1,1,label+': mutation must be unique');
 writeFileSync(join(folder,'time64_pure_candidate.hpp'),
   header==='candidate'?original.replace(pattern,replacement):candidate);
 writeFileSync(join(folder,'time64_pure_clock.hpp'),
   header==='reference'?original.replace(pattern,replacement):reference);
 const mutant=compile(folder,{overlay:true});
 if(mutant.result.status!==0) {
   assert.match(mutant.result.stderr,/static assertion|error:/);
   return 'COMPILE_RED';
 }
 const execution=run(mutant.dest);
 assert.notEqual(execution.status,0,label+': wrong mutant escaped');
 assert.match(execution.stderr,expected);
 return 'RUNTIME_RED';
}
test('pure candidate fixed ABI builds without test macros or CPU pointers',t=>{
 const folder=temp(t,'abi');
 const cc=compile(folder,{candidate:abi});
 assert.equal(cc.result.status,0,cc.result.stderr);
 const rr=run(cc.dest);
 assert.equal(rr.status,0,rr.stderr);
 assert.match(rr.stdout,/PURE_ABI_PASS 5 checks/);
});
test('47 native C++ labeled boundary, 3-guest mock and 2048 transaction checks',t=>{
 const folder=temp(t,'full');
 const cc=compile(folder);
 assert.equal(cc.result.status,0,cc.result.stderr);
 const rr=run(cc.dest);
 assert.equal(rr.status,0,rr.stderr);
 assert.match(rr.stdout,/TOTAL_CHECKS 47\s*$/);
 assert.equal((rr.stdout.match(/^PASS /gm)||[]).length,47);
});
test('exact integral math matches independent 2048 BigInt oracles, no double',()=>{
 let n=0x123456789abcdef0n;
 for(let i=0;i<2048;i++){
  n=(n*6364136223846793005n+1442695040888963407n)&MAX_U64;
  const input=MAX_U64-n;
  const expected=(input/1000000000n)*60750000n+
    ((input%1000000000n)*60750000n)/1000000000n;
  assert.equal(nanosecondsToTicks(input),expected);
  const {high,low}=splitTimebase(n);
  assert.equal((BigInt(high)<<32n)|BigInt(low),n);
 }
 assert.equal(nanosecondsToTicks(1n),0n);
 assert.equal(nanosecondsToTicks(4000n),243n);
 assert.equal(nanosecondsToTicks(MAX_U64),
  (MAX_U64/4000n)*243n+((MAX_U64%4000n)*243n)/4000n);
});
test('RED control: checked delta must reject UINT64 wrap',t=>{
 const kind=mutate(t,'overflow','candidate',
   'if(delta>std::numeric_limits<uint64_t>::max()-base)',
   'if(false)',/FAIL tick addition overflow DENIED/);
 assert.match(kind,/RED$/);
});
test('RED control: double instead of exact integral nanos conversion',t=>{
 const kind=mutate(t,'float','candidate',
   'return makeTicks(whole+fraction);',
   'return makeTicks(static_cast<uint64_t>(static_cast<double>(ns)*(60750000.0/1000000000.0)));',
   /FAIL UINT64_MAX ns no overflow or floating precision loss/);
 assert.match(kind,/RED$/);
});
test('RED control: swapped 32bit halves rejected',t=>{
 const kind=mutate(t,'high32','candidate',
   'return static_cast<uint32_t>(ticks>>32u);',
   'return static_cast<uint32_t>(ticks);',
   /FAIL low32 overflow carry exact/);
 assert.match(kind,/RED$/);
});
test('RED control: regressive tick accepted by poisoned helper',t=>{
 const kind=mutate(t,'regress','reference',
   'if(reference.initialized && ticks<reference.lastCommittedTicks)',
   'if(false)',
   /FAIL timebase monotonic regression denied/);
 assert.match(kind,/RED$/);
});
test('RED control: stale revision must fail before commit',t=>{
 const kind=mutate(t,'revision','reference',
   'if (offeredRevision!=reference.sourceRevision)',
   'if (false)',
   /FAIL wrong source revision denied/);
 assert.match(kind,/RED$/);
});
test('RED control: stale owner epoch cannot become valid',t=>{
 const kind=mutate(t,'epoch','reference',
   'if (reference.sourceEpoch==0 ||\n      offeredEpoch!=reference.sourceEpoch)',
   'if (false)',
   /FAIL wrong source epoch denied/);
 assert.match(kind,/RED$/);
});
test('headers are pure, cannot acquire a scheduler issuer or second ledger',()=>{
 const sourceText=readFileSync(pureHeader,'utf8');
 const refText=readFileSync(refHeader,'utf8');
 const codeOnly=(sourceText+'\n'+refText).split('\n').filter(line=>!line.trim().startsWith('//')).join('\n');
 assert.doesNotMatch(codeOnly,
   /CpuContext|TransactionService|armSyntheticClock|namespace\s+W03|EMSCRIPTEN_KEEPALIVE|extern\s+"C"|std::atomic|std::mutex|static\s+uint64_t\s+\w+\s*=/);
 assert.match(sourceText,/namespace nsmbw::w18/);
 assert.match(sourceText,/constexpr Result fromNanoseconds/);
 assert.match(refText,/nsmbw::w18::fromNanoseconds/);
 assert.match(refText,/nsmbw::w18::addTicks/);
});
