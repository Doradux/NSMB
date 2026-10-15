// Independent actual PUBLIC Translator.Cli -> generated C++ -> em++ denial oracle.
// STW-LWZ must NOT link until a checked journal-aware FlatRead32 is implemented.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(process.env.NSMB_PHASE7_READWRITE_ROOT||process.cwd());
const sdk=process.env.NSMB_EMSDK,dll=process.env.NSMB_TRANSLATOR_CLI;
const src=resolve(root,'web-runtime/frame-host');
const fixture=resolve(src,'translator-fixture');
const out=resolve(fixture,'out/readwrite_fixture');
const generated=resolve(out,'generated_functions/func_80001000.cpp');
function command(exe,args,env=process.env){
 const result=spawnSync(exe,args,{encoding:'utf8',env,timeout:15000,
  maxBuffer:1024*1024,windowsHide:true});
 if(result.error)throw result.error;
 return result;
}
test('fresh real C# source-generated STW then LWZ remains fail-closed in the narrow 32-bit write journal',{timeout:45000},()=>{
 assert.ok(sdk&&dll,'provide authorized NSMB_EMSDK and PUBLIC NSMB_TRANSLATOR_CLI');
 assert.ok(existsSync(dll),'upstream public Translator.Cli DLL required');
 assert.ok(existsSync(resolve(fixture,'build_readwrite_fixture.mjs')));
 const fixtureBuild=command(process.execPath,[resolve(fixture,'build_readwrite_fixture.mjs')]);
 assert.equal(fixtureBuild.status,0,fixtureBuild.stderr);
 const generatedDol=readFileSync(resolve(out,'synthetic.dol'));
 assert.equal(generatedDol.length,268);
 assert.deepEqual([0,1,2].map(i=>generatedDol.readUInt32BE(0x100+i*4)),
   [0x90640000,0x80A40000,0x4E800020],'copyright-free synthetic opcode words only');
 const dotnet=command('dotnet',[dll,'translate-recursive','0x80001000',
  '--project',resolve(out,'recomp.yml'),'--outdir',resolve(out,'generated_functions'),
  '--threads','1']);
 assert.equal(dotnet.status,0,dotnet.stderr);
 assert.ok(existsSync(generated),'actual translator must produce C++ source');
 const cpp=readFileSync(generated,'utf8');
 assert.match(cpp,/extern "C" void func_80001000\(CpuContext\* MKW_RESTRICT ctx\)/);
 const store=cpp.indexOf('MemoryInline::FlatWrite32(r4, r3);');
 const load=cpp.indexOf('r5 = MemoryInline::FlatRead32(r4);');
 const registerCommit=cpp.indexOf('ctx->gpr[5] = r5;');
 assert.ok(store>=0&&load>store&&registerCommit>load,
   'STW -> LWZ -> guest GPR order is proven from actual C# emitted C++');
 const compiler=resolve(sdk,'upstream/emscripten/em++.exe');
 assert.ok(existsSync(compiler));
 const env={...process.env,EMSDK:sdk,
  PATH:resolve(sdk,'upstream/emscripten')+';'+resolve(sdk,'upstream/bin')+';'+process.env.PATH};
 const check=command(compiler,['-std=c++17','-fsyntax-only',
  '-DNSMB_PHASE6_TRANSLATED_STORE_FIXTURE=1','-I',resolve(fixture,'include'),generated],env);
 assert.notEqual(check.status,0,'unsupported generated guest read unexpectedly linked!');
 assert.match(check.stderr,/no member named 'FlatRead32' in namespace 'MemoryInline'/,
  'compiler must reject SPECIFIC unsupported journal read, not an unrelated error');
 assert.doesNotMatch(check.stderr,/fatal error:.*(?:file not found|No such file)/i);
});
