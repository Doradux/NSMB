// Phase20 Toad REAL native compiler-driven source-only suite.
// No original Nintendo data; no ticket/CPU or private quota exported.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const include=join(root,'web-runtime/runtime-services');
const header=join(include,'synthetic_service_v2.hpp');
const local=join(root,'tests/phase20/toad');
function temp(t,tag) {
 const dir=mkdtempSync(join(tmpdir(),'nsmb-toad20-'+tag+'-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 return dir;
}
function build(dir,{source='service_v2_native.cpp',extra=[],
 sanitizer=false,mutant=false,pthread=false}={}){
 const binary=join(dir,'native');
 const flags=['-std=c++17',sanitizer?'-O1':'-O2',
 ...(sanitizer?['-g','-fsanitize=address,undefined','-fno-omit-frame-pointer']:[]),
 '-Wall','-Wextra','-Werror','-pedantic',
 '-Wconversion','-Wsign-conversion',
 ...(pthread?['-pthread']:[]),
 ...(mutant?['-I',dir]:[]),
 '-I',include,join(local,source),...extra.map(name=>join(local,name)),
 '-o',binary];
 const cc=spawnSync('g++',flags,{encoding:'utf8',timeout:60000});
 return {cc,binary};
}
function run(binary) {
 return spawnSync(binary,[],{encoding:'utf8',timeout:20000,
  env:{...process.env,LD_LIBRARY_PATH:'',LD_PRELOAD:'',
    ASAN_OPTIONS:'detect_leaks=1:halt_on_error=1',
    UBSAN_OPTIONS:'halt_on_error=1'}});
}
function success(t,tag,opts,expected){
 const dir=temp(t,tag),{cc,binary}=build(dir,opts);
 assert.equal(cc.status,0,cc.stderr);
 const out=run(binary);
 assert.equal(out.status,0,out.stderr||out.stdout);
 assert.match(out.stdout,new RegExp('TOTAL_CHECKS '+expected+'\\s*$'));
 assert.equal((out.stdout.match(/^PASS /gm)||[]).length,expected);
}
test('C++ V2 source-native adversarial typed service, 4096 guest operations',t=>
 success(t,'pure',{},108));
test('C++ V2 source-native ASan+UBSan numeric and lifecycle claims',t=>
 success(t,'asan',{sanitizer:true},108));
test('C++ V2 own native ABI basic smoke -Werror',t=>{
 const dir=temp(t,'abi'),{cc,binary}=build(dir,{source:'abi_native.cpp'});
 assert.equal(cc.status,0,cc.stderr);
 const out=run(binary);assert.equal(out.status,0,out.stderr);
 assert.match(out.stdout,/P20_V2_UNTRUSTED_CANDIDATE_ONLY/);
});
test('C++ V2 ABI across two translation units and explicit BE packing',t=>{
 const dir=temp(t,'twotu'),{cc,binary}=build(dir,{
  source:'layout_first.cpp',extra:['layout_second.cpp']});
 assert.equal(cc.status,0,cc.stderr);
 const out=run(binary);assert.equal(out.status,0,out.stderr);
 assert.match(out.stdout,/P20_LAYOUT_TWO_TU_BE_VALUES_ONLY/);
});
test('8 real pthreads times 4096 V2 pure calls vs serial math oracle',t=>{
 const dir=temp(t,'threads'),{cc,binary}=build(dir,{
  source:'concurrency_native.cpp',pthread:true});
 assert.equal(cc.status,0,cc.stderr);
 const out=run(binary);assert.equal(out.status,0,out.stderr);
 assert.match(out.stdout,/V2_32768_PURE_CALLS_8_THREADS_SERIAL_ORACLE/);
});
function red(t,label,pattern,replacement,expected){
 const dir=temp(t,label);
 const old=readFileSync(header,'utf8');
 assert.equal(old.split(pattern).length-1,1,
   label+' must mutate one exact source location');
 writeFileSync(join(dir,'synthetic_service_v2.hpp'),old.replace(pattern,replacement));
 const {cc,binary}=build(dir,{mutant:true});
 assert.equal(cc.status,0,cc.stderr);
 const broken=run(binary);
 assert.notEqual(broken.status,0,
  label+' mutant must be RED, not allowed to escape');
 assert.match(broken.stderr,expected);
}
test('RED: unsupported service ID must be denied',t=>red(t,
 'unsupported','if(!allowlisted(req.service))','if(false)',
 /FAIL unknown ID/));
test('RED: wrong ABI V1 must be denied',t=>red(t,
 'version','if(req.version!=kAbiVersion)','if(false)',
 /FAIL wrong version/));
test('RED: wrong guest slot must be denied',t=>red(t,
 'slot','req.slot!=view.slot','false',
 /FAIL cross guest/));
test('RED: forged wrong epoch must fail preliminary check',t=>red(t,
 'epoch','if(req.epoch==0||req.epoch!=view.epoch)','if(false)',
 /FAIL requested stale epoch/));
test('RED: stale revision must fail preliminary check',t=>red(t,
 'revision','if(req.revision!=view.revision)','if(false)',
 /FAIL requested stale revision/));
test('RED: claimed quota zero must fail preflight',t=>red(t,
 'claimedquota','if(view.claimedBudget==0)','if(false)',
 /FAIL empty claimed budget/));
test('RED: obvious JS host-origin must fail preliminary check',t=>red(t,
 'origin','if(view.origin!=OriginClaim::nativeScheduler)','if(false)',
 /FAIL JS host origin claimed/));
test('RED: reentrant state must fail preliminary check',t=>red(t,
 'busy','if(view.busy)','if(false)',
 /FAIL reentrant\/busy claim/));
test('RED: invalid expected PC must fail preliminary check',t=>red(t,
 'pc','if(req.expectedPc!=kSyntheticPc||view.currentPc!=kSyntheticPc)',
 'if(false)',/FAIL requested wrong PC/));
test('RED: monotonic clock regression must fail preliminary check',t=>red(t,
 'regression','if(view.hasPrevious&&','if(false&&',
 /FAIL regressive ticks/));
test('RED: forged high32 pair must fail after transport',t=>red(t,
 'high32','c.high32==static_cast<uint32_t>(c.rawTicks>>32u)&&',
 'true&&',/FAIL forged high half denied structurally/));
test('RED: forged proposed quota cost cannot be accepted structurally',t=>red(t,
 'cost','c.proposedCost==1&&','true&&',
 /FAIL forged proposed cost denied structurally/));
test('V2 header may not mint native authority, mutate quota or ledger',()=>{
 const body=readFileSync(header,'utf8');
 const code=body.split('\n').filter(x=>!x.trim().startsWith('//')).join('\n');
 assert.doesNotMatch(code,/CpuContext|Ticket\b|leaseSynthetic|armCanonicalClock|TransactionService|extern\s+"C"|EMSCRIPTEN_KEEPALIVE|std::mutex|std::atomic|new\s+/);
 assert.match(code,/namespace nsmbw::p20::services/);
 assert.match(code,/constexpr ResultV2 compute/);
 assert.doesNotMatch(code,/static\s+(?:uint32_t|uint64_t)\s+\w+\s*=/);
});
