// Optional source-pinned W03 native E2E from Peach's exact git archive.
// Run with NSMB_PHASE18_PEACH_SNAPSHOT=/tmp/audit/web-runtime.
// No Nintendo originals, no JS CPU shadow, no live Wii HLE or Wasm claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const peer=process.env.NSMB_PHASE18_PEACH_SNAPSHOT;
const reason=peer?false:'Set NSMB_PHASE18_PEACH_SNAPSHOT to archived exact Peach Phase18 web-runtime';
const peerFiles=[
 'frame-host/frame_loop.cpp','frame-host/guest_cpu.cpp',
 'frame-host/translator_abi_fixture.cpp','src/guest_memory.cpp',
 'interop/synthetic_guest.cpp','interop/device_policy.cpp',
 'runtime-services/input_snapshot.cpp'
];
const harness=join(root,'tests/phase18/toad/w03_pure_integration_native.cpp');
function fixture(t,label) {
 const path=mkdtempSync(join(tmpdir(),'toad18-w03-'+label+'-'));
 t.after(()=>rmSync(path,{recursive:true,force:true}));
 return path;
}
function compile(outDir,mutatedFrame=null,sanitize=false) {
 const out=join(outDir,'w03');
 const src=peerFiles.map(x=>join(peer,x));
 if(mutatedFrame)src[0]=mutatedFrame;
 const args=['-std=c++17',sanitize?'-O1':'-O2',
  ...(sanitize?['-g','-fsanitize=address,undefined','-fno-omit-frame-pointer']:[]),
  '-Wall','-Wextra','-Werror','-pedantic',
  '-I',join(peer,'frame-host'),
  '-I',join(root,'web-runtime/runtime-services'),
  harness,...src,'-o',out];
 const result=spawnSync('g++',args,{encoding:'utf8',timeout:60000});
 return {out,result};
}
function run(path) {
 return spawnSync(path,[],{encoding:'utf8',timeout:15000});
}
test('27 native W03/W04/W07 real scheduler checks using pure Time64, 512 commits + 256 resets',{skip:reason},t=>{
 const temp=fixture(t,'positive');
 const build=compile(temp);
 assert.equal(build.result.status,0,build.result.stderr);
 const r=run(build.out);
 assert.equal(r.status,0,r.stderr||r.stdout);
 assert.match(r.stdout,/TOTAL_CHECKS 27\s*$/);
 assert.equal((r.stdout.match(/^PASS /gm)||[]).length,27);
});
test('native W03 sanitizers on unchanged single-ledger integration',{skip:reason},t=>{
 const temp=fixture(t,'san');
 const build=compile(temp,null,true);
 assert.equal(build.result.status,0,build.result.stderr);
 const r=spawnSync(build.out,[],{encoding:'utf8',timeout:20000,env:{
  ...process.env, LD_LIBRARY_PATH:'',LD_PRELOAD:'',
  ASAN_OPTIONS:'detect_leaks=1',UBSAN_OPTIONS:'halt_on_error=1'}});
 assert.equal(r.status,0,r.stderr||r.stdout);
 assert.match(r.stdout,/TOTAL_CHECKS 27\s*$/);
});
function red(t,label,pattern,replacement,expected){
 const temp=fixture(t,label);
 const original=readFileSync(join(peer,'frame-host/frame_loop.cpp'),'utf8');
 assert.equal(original.split(pattern).length-1,1,label+' must match exactly one source location');
 const mutant=join(temp,'frame_loop.cpp');
 writeFileSync(mutant,original.replace(pattern,replacement));
 const build=compile(temp,mutant);
 assert.equal(build.result.status,0,build.result.stderr);
 const r=run(build.out);
 assert.notEqual(r.status,0,label+' mutation escaped');
 assert.match(r.stderr,expected);
}
test('RED: W03 must check current epoch against candidate source',{skip:reason},t=>{
 red(t,'epoch',
   'if(requireSourceRevision && plan.sourceEpoch!=serviceEpoch)',
   'if(false)',/FAIL W03 independent epoch validation rejects forge/);
});
test('RED: W03 must check current revision against candidate source',{skip:reason},t=>{
 red(t,'revision',
   'if(requireSourceRevision && plan.sourceRevision!=t->clockRevision)',
   'if(false)',/FAIL stale prepared revision cannot replay after first commit/);
});
test('RED: W03 must reject malformed split halves before staging',{skip:reason},t=>{
 red(t,'pair',
   'if(requireSourceRevision &&\n     (plan.high32!=static_cast<uint32_t>(proposedTicks>>32u) ||\n      plan.low32!=static_cast<uint32_t>(proposedTicks)))',
   'if(false)',/FAIL W03 native pair validation rejects forged high32/);
});
test('RED: W03 must write canonical ledger in same native commit',{skip:reason},t=>{
 red(t,'ledger',
   't.clockTicks=ticks;',
   't.clockTicks=t.clockTicks;',
   /FAIL ONE W03 canonical ledger commits exact raw ticks and revision/);
});
test('RED: W03 must increment canonical revision once per commit',{skip:reason},t=>{
 red(t,'clock-revision',
   '++t.clockRevision; // SAME in-dispatch, no-fail W03 canonical commit',
   't.clockRevision+=0; // MUTANT omit commit revision',
   /FAIL ONE W03 canonical ledger commits exact raw ticks and revision/);
});
