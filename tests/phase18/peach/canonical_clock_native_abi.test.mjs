// Phase18 production-ABI denial proof: no public C/JS clock ticket grant,
// no test-only snapshot/serial corruption helpers in a normal C++ object.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const dir=join(root,'web-runtime/frame-host');
const header=readFileSync(join(dir,'scheduler_clock.hpp'),'utf8');
const declarations=header.split(/\r?\n/).filter(line=>!line.trimStart().startsWith('//')).join('\n');
test('canonical W03 plan and observable clock are plain data, no raw JS CpuContext* API',()=>{
  assert.match(declarations,/struct CanonicalClockPlan final/);
  assert.match(declarations,/ClockArm armCanonicalClock\(Ticket&/);
  assert.match(declarations,/uint64_t revision=0/);
  assert.doesNotMatch(declarations,/extern\s+"C"|EMSCRIPTEN_KEEPALIVE|CpuContext\s*\*/);
});
test('untrusted native caller cannot mint private W03 Ticket to authorize an arbitrary candidate',t=>{
  const scratch=mkdtempSync(join(tmpdir(),'nsmb18-abi-'));
  t.after(()=>rmSync(scratch,{recursive:true,force:true}));
  const src=join(scratch,'forge.cpp');
  writeFileSync(src,[
    '#include "scheduler_clock.hpp"',
    'int main(){',
    '  nsmbw::trusted_cpu::Ticket forged(1u,2ull,3ull,4ull);',
    '  const nsmbw::trusted_cpu::CanonicalClockPlan plan{};',
    '  return static_cast<int>(nsmbw::trusted_cpu::armCanonicalClock(forged,0x80010000u,plan));',
    '}'
  ].join('\n'));
  const cc=spawnSync('g++',['-std=c++17','-Wall','-Wextra','-Werror',
    '-pedantic','-I'+dir,'-fsyntax-only',src],{
    encoding:'utf8',timeout:20000});
  assert.notEqual(cc.status,0,'native token forgery unexpectedly compiled');
  assert.match(cc.stderr,/private within this context|is private/);
});
test('production W03 C++ object contains canonical function but no C export or test hook',t=>{
  const scratch=mkdtempSync(join(tmpdir(),'nsmb18-abi-'));
  t.after(()=>rmSync(scratch,{recursive:true,force:true}));
  const obj=join(scratch,'w03.o');
  const cc=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
    '-Werror','-pedantic','-c',join(dir,'frame_loop.cpp'),'-o',obj],{
    encoding:'utf8',timeout:25000});
  assert.equal(cc.status,0,cc.stderr||cc.error?.message);
  const nm=spawnSync('nm',['--defined-only',obj],{
    encoding:'utf8',timeout:10000});
  assert.equal(nm.status,0,nm.stderr);
  assert.match(nm.stdout,/armCanonicalClock/);
  assert.doesNotMatch(nm.stdout,/\b[TW]\s+(armCanonicalClock|armPureTime64Clock|armCheckedTime64Clock|OSGetTime|forgeForNativeTest)\b/);
  assert.doesNotMatch(nm.stdout,/clockNativeTestSnapshot|clockNativeTestSetRevision|clockNativeTestExhaustSerial|forgeForNativeTest|Time64PermitIssuer/);
});
test('Toad pure adapter fails closed at compile-time when reviewed header is absent',t=>{
  const scratch=mkdtempSync(join(tmpdir(),'nsmb18-abi-'));
  t.after(()=>rmSync(scratch,{recursive:true,force:true}));
  const src=join(scratch,'requires-toad.cpp');
  writeFileSync(src,[
    '#include "time64_clock_bridge.hpp"',
    'int main(){',
    '  nsmbw::trusted_cpu::Ticket token{};',
    '  return static_cast<int>(nsmbw::trusted_cpu::armPureTime64Clock(token,0,',
    '    nsmbw::w18::Candidate{},0,0));',
    '}'
  ].join('\n'));
  // Before Mario merges Toad's reviewed source there must be NO implicit
  // fallback. After a reviewed merge, the actual pure type MUST compile.
  const cc=spawnSync('g++',['-std=c++17','-Wall','-Wextra','-Werror','-pedantic',
    '-I'+dir,'-fsyntax-only',src],{encoding:'utf8',timeout:20000});
  const integrated=existsSync(join(root,'web-runtime/runtime-services/time64_pure_candidate.hpp'));
  if(integrated) assert.equal(cc.status,0,cc.stderr);
  else {
    assert.notEqual(cc.status,0,'unreviewed missing Toad pure source got implicit fallback');
    assert.match(cc.stderr,/armPureTime64Clock|nsmbw::w18/);
  }
});
