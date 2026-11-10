// Exact immutable Peach P20 SHA source-native test against genuine W03 quota.
// No original Nintendo; original Wii HLE remains untested.
// Set BOTH NSMB_P20_PEACH_SNAPSHOT=/tmp/GIT-ARCHIVE/web-runtime
// and NSMB_P20_PEACH_SHA to the SAME exact Git object.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const peer=process.env.NSMB_P20_PEACH_SNAPSHOT;
const sha=process.env.NSMB_P20_PEACH_SHA;
const gitRoot='/home/marcos/NSMB';
const disabled=!(peer&&/^[0-9a-f]{40}$/.test(sha||''));
const skip=disabled?'requires exact immutable Peach snapshot and Git SHA':false;
const own=join(root,'tests/phase20/toad/service_v2_private_quota_native.cpp');
const sourcePaths=[
 'frame-host/frame_loop.cpp',
 'frame-host/phase20_service_fixture.inc',
 'frame-host/guest_cpu.cpp','frame-host/translator_abi_fixture.cpp',
 'src/guest_memory.cpp','interop/synthetic_guest.cpp',
 'interop/device_policy.cpp','runtime-services/input_snapshot.cpp'];
function assertExactSource(){
 for(const rel of sourcePaths){
  const git=spawnSync('git',['-C',gitRoot,'show',
   sha+':web-runtime/'+rel],{timeout:15000});
  assert.equal(git.status,0,String(git.stderr));
  assert.ok(git.stdout.equals(readFileSync(join(peer,rel))),
   'source snapshot mismatch against exact immutable Peach Git '+sha+' '+rel);
 }
}
function scratch(t,tag){
 const dir=mkdtempSync(join(tmpdir(),'nsmb-toad20-private-'+tag+'-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;
}
function compile(dir,{sanitizer=false,mutant=false}={}){
 const sources=sourcePaths.filter(x=>!x.endsWith('.inc'));
 if(mutant)sources[0]=mutant;
 const out=join(dir,'native');
 const files=sources.map(x=>x.startsWith('/')?x:join(peer,x));
 const args=['-std=c++17',sanitizer?'-O1':'-O2',
 ...(sanitizer?['-g','-fsanitize=address,undefined','-fno-omit-frame-pointer']:[]),
 '-Wall','-Wextra','-Werror','-pedantic',
 '-DNSMB_PHASE18_CLOCK_TEST','-I',join(peer,'frame-host'),
 '-I',join(root,'web-runtime/runtime-services'),
 own,...files,'-o',out];
 const cc=spawnSync('g++',args,{encoding:'utf8',timeout:60000});
 return {cc,out};
}
function run(out){
 return spawnSync(out,[],{encoding:'utf8',timeout:20000,
 env:{...process.env,LD_LIBRARY_PATH:'',LD_PRELOAD:'',
 ASAN_OPTIONS:'detect_leaks=1:halt_on_error=1',
 UBSAN_OPTIONS:'halt_on_error=1'}});
}
test('all 8 native code/fixture files byte-for-byte exact Peach Git SHA',{skip},()=>{
 assertExactSource();
});
test('24 linked W03 REAL private-quota check labels, 512 commits, 1024 reset cycles',{skip},t=>{
 assertExactSource();
 const d=scratch(t,'native');
 const {cc,out}=compile(d);assert.equal(cc.status,0,cc.stderr);
 const got=run(out);assert.equal(got.status,0,got.stderr||got.stdout);
 assert.match(got.stdout,/TOTAL_CHECKS 24\s*$/);
 assert.equal((got.stdout.match(/^PASS /gm)||[]).length,24);
});
test('ASan+UBSan W03 real quota/ledger full native exact Peach SHA',{skip},t=>{
 assertExactSource();
 const d=scratch(t,'san'),{cc,out}=compile(d,{sanitizer:true});
 assert.equal(cc.status,0,cc.stderr);
 const got=run(out);assert.equal(got.status,0,got.stderr||got.stdout);
 assert.match(got.stdout,/TOTAL_CHECKS 24\s*$/);
});
function red(t,name,needle,replacement,expected){
 assertExactSource();
 const original=readFileSync(join(peer,'frame-host/frame_loop.cpp'),'utf8');
 assert.equal(original.split(needle).length-1,1,
   'source site missing or duplicated: '+name);
 const d=scratch(t,name);
 const mutant=join(d,'frame_loop.cpp');
 writeFileSync(mutant,original.replace(needle,replacement));
 const {cc,out}=compile(d,{mutant});
 assert.equal(cc.status,0,cc.stderr);
 const got=run(out);
 assert.notEqual(got.status,0,'mutant escaped: '+name);
 assert.match(got.stderr,expected);
}
test('RED: W03 service-fixture cannot bypass quota via generic native Ticket',{skip},t=>{
 red(t,'bypass','if(t->serviceFixture!=phase20Service)return ClockArm::unsupportedPc;',
  'if(false)return ClockArm::unsupportedPc;',
  /FAIL even actual OTHER native Ticket cannot bypass private service mode|FAIL generic clock route cannot bypass service-fixture quota0 even with LIVE epoch/);
});
test('RED: W03 private quota MUST decrement in same GPR+clock commit',{skip},t=>{
 red(t,'no-debit','if(serviceClock)--t.serviceQuota;',
  'if(false)--t.serviceQuota;',
  /FAIL PRIVATE per-guest quota debited ONCE in same clock commit/);
});
