// Independent REAL native W03 linked with Git-archived exact Peach Phase19.
// Do not infer browser/new-Wasm execution from this native test.
// Set NSMB_P19_PEACH_SNAPSHOT to exact archived peer web-runtime root.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const peer=process.env.NSMB_P19_PEACH_SNAPSHOT;
const skip=peer?false:'requires exact immutable published Peach Phase19 snapshot path';
const source=join(root,'tests/phase19/toad/dispatcher_w03_native.cpp');
const paths=['frame-host/frame_loop.cpp','frame-host/guest_cpu.cpp',
 'frame-host/translator_abi_fixture.cpp','src/guest_memory.cpp',
 'interop/synthetic_guest.cpp','interop/device_policy.cpp',
 'runtime-services/input_snapshot.cpp'];
function scratch(t,name){
 const dir=mkdtempSync(join(tmpdir(),'nsmb-toad19-peer-'+name+'-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;
}
function compile(dir,{mutant,asan=false}={}){
 const output=join(dir,'w03');
 const files=paths.map(p=>join(peer,p));
 if(mutant)files[0]=mutant;
 const cc=spawnSync('g++',['-std=c++17',asan?'-O1':'-O2',
 ...(asan?['-g','-fsanitize=address,undefined','-fno-omit-frame-pointer']:[]),
 '-Wall','-Wextra','-Werror','-pedantic',
 '-DNSMB_PHASE18_CLOCK_TEST','-I',join(peer,'frame-host'),
 '-I',join(root,'web-runtime/runtime-services'),source,...files,'-o',output],
 {encoding:'utf8',timeout:60000});
 return {cc,output};
}
function run(binary){
 return spawnSync(binary,[],{encoding:'utf8',timeout:18000,
 env:{...process.env,LD_LIBRARY_PATH:'',LD_PRELOAD:'',
 ASAN_OPTIONS:'detect_leaks=1:halt_on_error=1',
 UBSAN_OPTIONS:'halt_on_error=1'}});
}
test('31 native W03 joint checks + 512 commits, 1024 resets exact Peach SHA',{skip},t=>{
 const d=scratch(t,'normal'),{cc,output}=compile(d);
 assert.equal(cc.status,0,cc.stderr);
 const result=run(output);
 assert.equal(result.status,0,result.stderr||result.stdout);
 assert.match(result.stdout,/TOTAL_CHECKS 31\s*$/);
 assert.equal((result.stdout.match(/^PASS /gm)||[]).length,31);
});
test('ASan+UBSan 31 native W03 full-state tests exact Peach SHA',{skip},t=>{
 const d=scratch(t,'asan'),{cc,output}=compile(d,{asan:true});
 assert.equal(cc.status,0,cc.stderr);
 const result=run(output);
 assert.equal(result.status,0,result.stderr||result.stdout);
 assert.match(result.stdout,/TOTAL_CHECKS 31\s*$/);
});
function red(t,name,pattern,replacement,reason){
 const d=scratch(t,name);
 const original=readFileSync(join(peer,'frame-host/frame_loop.cpp'),'utf8');
 assert.equal(original.split(pattern).length-1,1,name+' source pin unique');
 const mutant=join(d,'frame_loop.cpp');
 writeFileSync(mutant,original.replace(pattern,replacement));
 const {cc,output}=compile(d,{mutant});
 assert.equal(cc.status,0,cc.stderr);
 const result=run(output);
 assert.notEqual(result.status,0,name+' escaped');
 assert.match(result.stderr,reason);
}
test('RED: exact Peach native Ticket must remain mandatory',{skip},t=>{
 red(t,'ticket','if(!ticket.guest_ || !offered)','if(false)',
   /FAIL matching FORGED GateView and candidate cannot authorize W03/);
});
test('RED: exact Peach epoch must be native-checked',{skip},t=>{
 red(t,'epoch','if(requireSourceRevision && plan.sourceEpoch!=serviceEpoch)',
   'if(false)',/FAIL W03 independent epoch check/);
});
test('RED: exact Peach revision must be native-checked',{skip},t=>{
 red(t,'revision',
   'if(requireSourceRevision && plan.sourceRevision!=t->clockRevision)',
   'if(false)',/FAIL replayed old candidate revision rejected by native W03/);
});
