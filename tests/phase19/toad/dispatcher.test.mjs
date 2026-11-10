// Source-only invented C++ dispatcher; W03 tests link real native scheduler.
// Node spawns compiler, not a Nintendo binary. Mutants are temporary only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const include=join(root,'web-runtime/runtime-services');
const frame=join(root,'web-runtime/frame-host');
const service=join(include,'synthetic_service_dispatch.hpp');
const native=join(root,'tests/phase19/toad/dispatcher_native.cpp');
const abi=join(root,'tests/phase19/toad/dispatcher_abi_native.cpp');
const nativeW03=join(root,'tests/phase19/toad/dispatcher_w03_native.cpp');
const sources=[
 'web-runtime/frame-host/frame_loop.cpp',
 'web-runtime/frame-host/guest_cpu.cpp',
 'web-runtime/frame-host/translator_abi_fixture.cpp',
 'web-runtime/src/guest_memory.cpp',
 'web-runtime/interop/synthetic_guest.cpp',
 'web-runtime/interop/device_policy.cpp',
 'web-runtime/runtime-services/input_snapshot.cpp'
].map(s=>join(root,s));
function scratch(t,tag){
 const d=mkdtempSync(join(tmpdir(),'nsmb-p19-toad-'+tag+'-'));
 t.after(()=>rmSync(d,{recursive:true,force:true}));return d;
}
function compile(dir,{cpp=native,peer=false,overlay=false,sanitize=false}={}){
 const output=join(dir,'check');
 const args=['-std=c++17',sanitize?'-O1':'-O2',
 ...(sanitize?['-g','-fsanitize=address,undefined','-fno-omit-frame-pointer']:[]),
 '-Wall','-Wextra','-Werror','-pedantic',
 ...(peer?['-DNSMB_PHASE18_CLOCK_TEST','-I',frame]:[]),
 ...(overlay?['-I',dir]:[]),'-I',include,
 cpp,...(peer?sources:[]),'-o',output];
 const cc=spawnSync('g++',args,{encoding:'utf8',timeout:60000});
 return {output,cc};
}
function run(output) {
 return spawnSync(output,[],{encoding:'utf8',timeout:18000,env:{
  ...process.env,LD_LIBRARY_PATH:'',LD_PRELOAD:'',
  ASAN_OPTIONS:'detect_leaks=1:halt_on_error=1',
  UBSAN_OPTIONS:'halt_on_error=1'}});
}
function positive(t,label,opts,expected) {
 const dir=scratch(t,label);
 const {cc,output}=compile(dir,opts);
 assert.equal(cc.status,0,cc.stderr);
 const r=run(output);
 assert.equal(r.status,0,r.stderr||r.stdout);
 assert.match(r.stdout,new RegExp('TOTAL_CHECKS '+expected+'\\s*$'));
 assert.equal((r.stdout.match(/^PASS /gm)||[]).length,expected);
}
test('P19 pure dispatcher real C++ 107 checks with 4096 three-guest operations',
 t=>positive(t,'pure',{},107));
test('P19 ABI public header without private W03 symbols',t=>{
 const dir=scratch(t,'abi'),{cc,output}=compile(dir,{cpp:abi});
 assert.equal(cc.status,0,cc.stderr);
 const r=run(output);assert.equal(r.status,0,r.stderr||r.stdout);
 assert.match(r.stdout,/ABI_CANDIDATE_ONLY_UNAUTHENTICATED/);
});
test('P19 real W03/W04/W07 linked synthetic service 31 checks + 512/1024 stress',
 t=>positive(t,'w03',{cpp:nativeW03,peer:true},31));
test('P19 real W03 linked service under ASan and UBSan',
 t=>positive(t,'asan',{cpp:nativeW03,peer:true,sanitize:true},31));
test('P19 pure dispatcher under ASan and UBSan',
 t=>positive(t,'pureasan',{sanitize:true},107));
function red(t,label,original,pattern,replacement,expected){
 const dir=scratch(t,label);
 const content=readFileSync(original,'utf8');
 assert.equal(content.split(pattern).length-1,1,label+' mutation source site unique');
 const patched=content.replace(pattern,replacement);
 const target=join(dir,original.endsWith('frame_loop.cpp')?
 'frame_loop.cpp':'synthetic_service_dispatch.hpp');
 writeFileSync(target,patched);
 const args={overlay:true};
 if(original.endsWith('frame_loop.cpp')){
   args.peer=true;args.cpp=nativeW03;
   // We do not patch the W03 production source; temp source shadow is
   // passed as the ONLY replacement for frame_loop.cpp below.
   const out=join(dir,'w03-mutant');
   const sourceList=sources.slice();sourceList[0]=target;
   const cc=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
   '-Werror','-pedantic','-DNSMB_PHASE18_CLOCK_TEST','-I',frame,
   '-I',include,nativeW03,...sourceList,'-o',out],{
     encoding:'utf8',timeout:60000});
   assert.equal(cc.status,0,cc.stderr);
   const runMutant=run(out);
   assert.notEqual(runMutant.status,0,label+' W03 mutation escaped');
   assert.match(runMutant.stderr,expected);
 } else {
   const {cc,output}=compile(dir,args);
   if(cc.status!==0){assert.match(cc.stderr,/error:/);return;}
   const runMutant=run(output);
   assert.notEqual(runMutant.status,0,label+' mutation escaped');
   assert.match(runMutant.stderr,expected);
 }
}
test('RED pure unsupported service must never become a candidate',t=>{
 red(t,'unknown',service,
   'if(!isAllowlisted(request.id))return deny(Status::unsupported);',
   'if(false)return deny(Status::unsupported);',
   /FAIL unknown service/);
});
test('RED pure ABI version must fail before computing',t=>{
 red(t,'version',service,
   'if(request.version!=kAbiVersion)return deny(Status::badVersion);',
   'if(false)return deny(Status::badVersion);',
   /FAIL wrong ABI/);
});
test('RED pure JS-origin denial must be mandatory',t=>{
 red(t,'origin',service,
   'if(view.origin!=Origin::nativeScheduler)\n    return deny(Status::forbiddenOrigin);',
   'if(false)return deny(Status::forbiddenOrigin);',
   /FAIL JS origin/);
});
test('RED pure quota=0 must deny, not stage',t=>{
 red(t,'quota',service,
   'if(view.remainingBudget==0u)return deny(Status::quotaExhausted);',
   'if(false)return deny(Status::quotaExhausted);',
   /FAIL no quota/);
});
test('RED pure stale epoch must deny',t=>{
 red(t,'epoch',service,
   'if(request.epoch==0u || request.epoch!=view.epoch)',
   'if(false)',
   /FAIL old epoch/);
});
test('RED pure serial mismatch must deny',t=>{
 red(t,'serial',service,
   'if(request.serial==0u || request.serial!=view.serial)',
   'if(false)',
   /FAIL stale serial/);
});
test('RED pure wrong PC must deny',t=>{
 red(t,'pc',service,
   'if(request.expectedPc!=kSyntheticEntryPc ||\n     request.expectedPc!=view.pc)',
   'if(false)',
   /FAIL wrong expected PC/);
});
test('RED pure stale revision must deny',t=>{
 red(t,'revision',service,
   'if(request.revision!=view.revision)',
   'if(false)',
   /FAIL stale revision/);
});
test('RED W03 native ticket is mandatory despite forged candidate',t=>{
 red(t,'w03-ticket',sources[0],
   'if(!ticket.guest_ || !offered)',
   'if(false)',
   /FAIL matching FORGED GateView and candidate cannot authorize W03/);
});
test('RED W03 native epoch must be independently checked',t=>{
 red(t,'w03-epoch',sources[0],
   'if(requireSourceRevision && plan.sourceEpoch!=serviceEpoch)',
   'if(false)',
   /FAIL W03 independent epoch check/);
});
test('RED W03 native revision must be independently checked',t=>{
 red(t,'w03-revision',sources[0],
   'if(requireSourceRevision && plan.sourceRevision!=t->clockRevision)',
   'if(false)',
   /FAIL replayed old candidate revision rejected by native W03/);
});
test('pure header cannot issue a native ticket, publish CPU or second ledger',()=>{
 const sourceText=readFileSync(service,'utf8');
 const lines=sourceText.split('\n')
  .filter(s=>!s.trim().startsWith('//')).join('\n');
 assert.doesNotMatch(lines,
  /CpuContext|leaseSynthetic|armCanonicalClock|TransactionService|std::mutex|std::atomic|extern\s+"C"|EMSCRIPTEN_KEEPALIVE/);
 assert.match(lines,/namespace nsmbw::p19::services/);
 assert.match(lines,/constexpr Result prepare/);
 assert.doesNotMatch(lines,/static\s+uint64_t\s+\w+\s*=/);
});
