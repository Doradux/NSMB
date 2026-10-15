// Independent REA v6.5 static ABI gate for the real C#-generated STB Wasm.
// STATIC supplement ONLY; actual compiled guest results tested separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const normalRoot=resolve(process.env.NSMB_PHASE8_BASE_ROOT||process.cwd());
const stbRoot=process.env.NSMB_PHASE8_STB_ROOT;
const rea=process.env.NSMB_REA_CMD||'C:/NSMBtools/rea.cmd';
function inspect(file){
 assert.ok(existsSync(file),'compiled exact Wasm required '+file);
 const bytes=readFileSync(file),sha=createHash('sha256').update(bytes).digest('hex');
 const mod=new WebAssembly.Module(bytes);
 const importNames=WebAssembly.Module.imports(mod).map(x=>x.module+'.'+x.name).sort();
 const exportNames=WebAssembly.Module.exports(mod).map(x=>x.name).sort();
 const command="& '"+rea.replace(/'/g,"''")+"' inspect-wasm-artifact '"+
   file.replace(/'/g,"''")+"' --format json";
 const p=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],
   {encoding:'utf8',timeout:30000,maxBuffer:12*1024*1024,windowsHide:true});
 assert.equal(p.status,0,p.stderr);
 const report=JSON.parse(p.stdout.trim().replace(/^\uFEFF/,''));
 assert.equal(report.provider.id,'wabt-artifact');
 assert.equal(report.normalized_result.validation,'valid');
 assert.equal(report.subject.digest.sha256.toLowerCase(),sha);
 assert.equal(report.normalized_result.artifact.sha256.toLowerCase(),sha);
 const types=new Map();
 for(const e of report.normalized_result.interface.entries){
   if(e.direction==='import')types.set('import:'+e.module+'.'+e.name,{kind:e.kind,signature:e.signature});
   if(e.direction==='export')types.set('export:'+e.name,{kind:e.kind,signature:e.signature});
 }
 assert.deepEqual(report.normalized_result.interface.entries.filter(x=>x.direction==='import')
   .map(x=>x.module+'.'+x.name).sort(),importNames);
 assert.deepEqual(report.normalized_result.interface.entries.filter(x=>x.direction==='export')
   .map(x=>x.name).sort(),exportNames);
 return {sha,types,importNames,exportNames,evidence:report.evidence_id};
}
test('REA typed ABI: actual source-generated STB Wasm adds ONLY isolated 2-store fixture exports',{timeout:60000},()=>{
 assert.ok(stbRoot,'set NSMB_PHASE8_STB_ROOT to NEW clean exact Luigi checkout');
 const normal=inspect(resolve(normalRoot,'web-runtime/frame-host/dist/frame_loop.wasm'));
 const fixture=inspect(resolve(stbRoot,'web-runtime/frame-host/dist/frame_loop_translated_stb_fixture.wasm'));
 assert.deepEqual(fixture.importNames,normal.importNames);
 assert.deepEqual(normal.importNames,['env.emscripten_resize_heap']);
 assert.deepEqual(fixture.exportNames.filter(s=>!normal.exportNames.includes(s)),
   ['nsmbw_loop_translated_store_spawn','nsmbw_mem_atomic_pair_write32'].sort(),
   'only already-reviewed STB fixture helper and staging entry permitted');
 assert.deepEqual(normal.exportNames.filter(s=>!fixture.exportNames.includes(s)),[],
   'source-generated test module must preserve normal CURRENT W03 ABI');
 for(const name of normal.exportNames){
   assert.deepEqual(fixture.types.get('export:'+name),normal.types.get('export:'+name),
    'STB fixture changed signature '+name);
 }
 assert.deepEqual(fixture.types.get('import:env.emscripten_resize_heap'),
   normal.types.get('import:env.emscripten_resize_heap'));
 for(const forbidden of ['nsmbw_test_policy_install','nsmbw_test_policy_rejection'])
   assert.ok(!fixture.exportNames.includes(forbidden));
 console.log('REA STB ABI evidence',normal.sha,normal.evidence,fixture.sha,fixture.evidence);
});
