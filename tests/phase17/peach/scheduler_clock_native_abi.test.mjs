// Phase17 negative ABI / source-only exposure proof (native compiled object).
// NOT a substitute for emcc export auditing or real browser Wasm.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const include=join(root,'web-runtime/frame-host');
const header=readFileSync(join(include,'scheduler_clock.hpp'),'utf8');
// Inspect actual declarations, not explicit documentation comments.
const declarations=header.split(/\r?\n/).filter(line=>!line.trimStart().startsWith('//')).join('\n');

test('native scheduler-clock interface exports neither raw CPU pointers nor JS/C HLE helpers',()=>{
  assert.doesNotMatch(declarations,/extern\s+"C"|EMSCRIPTEN_KEEPALIVE|CpuContext\s*\*/);
  assert.doesNotMatch(declarations,/OSGetTime|OS__GetTime_HLE/);
  assert.match(header,/armSyntheticClock\(Ticket&/);
  assert.match(header,/ClockSnapshot\s+inspectSyntheticClock\(uint32_t/);
});
test('untrusted native caller cannot invent W03 Ticket using a public 4-argument constructor',t=>{
  const dir=mkdtempSync(join(tmpdir(),'nsmb-p17-peach-negative-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const source=join(dir,'attack.cpp');
  writeFileSync(source,[
    '#include "scheduler_clock.hpp"',
    'int main() {',
    '  nsmbw::trusted_cpu::Ticket forged(1u,1ull,1ull,1ull);',
    '  auto x=nsmbw::trusted_cpu::armSyntheticClock(forged,0x80010000u,123u);',
    '  return static_cast<int>(x);',
    '}'
  ].join('\n'));
  const run=spawnSync('g++',['-std=c++17','-Wall','-Wextra','-Werror',
    '-pedantic','-I',include,'-fsyntax-only',source],{
    encoding:'utf8',timeout:15000
  });
  assert.notEqual(run.status,0,'private W03 ticket can be forged!');
  assert.match(run.stderr,/private within this context|is private/);
});
test('regular W03 object has only C++-mangled clock symbols; no C ABI/HLE/test-forge symbol',t=>{
  const dir=mkdtempSync(join(tmpdir(),'nsmb-p17-peach-nm-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const obj=join(dir,'frame_loop.o');
  const cc=spawnSync('g++',['-std=c++17','-O2','-Wall','-Wextra',
    '-Werror','-pedantic','-c',
    join(include,'frame_loop.cpp'),'-o',obj],
    {encoding:'utf8',timeout:20000});
  assert.equal(cc.status,0,cc.stderr||cc.error?.message);
  const symbols=spawnSync('nm',['--defined-only',obj],{
    encoding:'utf8',timeout:10000});
  assert.equal(symbols.status,0,symbols.stderr);
  assert.match(symbols.stdout,/_ZN5nsmbw11trusted_cpu17armSyntheticClock/);
  assert.match(symbols.stdout,/_ZN5nsmbw11trusted_cpu21inspectSyntheticClock/);
  assert.doesNotMatch(symbols.stdout,/\b[TW]\s+(armSyntheticClock|inspectSyntheticClock|OSGetTime|OS__GetTime_HLE|forgeForNativeTest)\b/);
  assert.doesNotMatch(symbols.stdout,/forgeForNativeTest|Time64PermitIssuer/);
});
