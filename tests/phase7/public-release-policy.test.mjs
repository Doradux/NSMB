// Public source-path and status assertions ONLY. Never read proprietary dumps.
// Complements real loopback HTTP + compiled normal Wasm tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(process.env.NSMB_PHASE7_PUBLIC_ROOT||process.cwd());
test('public tracked Git repository cannot include original Wii disc/executable containers',()=>{
 const tracked=execFileSync('git',['-C',root,'ls-files','-z'],{maxBuffer:8*1024*1024})
  .toString('utf8').split('\0').filter(Boolean);
 assert.ok(tracked.length>100,'expected a real Git repository, not a stub fixture');
 const disallowed=tracked.filter(p=>/\.(dol|iso|rvz|wbfs|wad|gcm|nkit|elf|tik|tmd|gcz|wia)$/i.test(p));
 assert.equal(disallowed.length,0,disallowed.length+' private disc/executable container file(s) tracked');
 const privatePaths=tracked.filter(p=>/(^|\/)(?:private|game-dumps|original-extracted)(\/|$)/i.test(p));
 assert.equal(privatePaths.length,0,'private game input folders must not be in public Git');
});
test('public preview clearly distinguishes conceptual art, source-generated diagnostics and NO game',()=>{
 const page=readFileSync(resolve(root,'index.html'),'utf8')
   .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
 assert.match(page,/no playable build is available yet/i);
 assert.match(page,/not gameplay from a functioning web port/i);
 assert.match(page,/conceptual view\s*—\s*not the game/i);
 assert.match(page,/Not yet available/i);
 assert.match(page,/not affiliated with.*Nintendo/i);
 assert.doesNotMatch(page,/(\bplay now\b|download\s+the\s+game|click\s+to\s+start\s+Mario)/i);
});
test('normal public Wasm artifact must contain compiled wasm bytes and no translated TEST fixture route',()=>{
 const bin=readFileSync(resolve(root,'web-runtime/frame-host/dist/frame_loop.wasm'));
 assert.equal(bin.subarray(0,4).toString('hex'),'0061736d');
 const server=readFileSync(resolve(root,'server.js'),'utf8');
 const allow=server.match(/const allowed = new Set\(\[([\s\S]*?)\]\)/);
 assert.ok(allow,'server MUST use static explicit allowlist');
 const paths=[...allow[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 assert.ok(paths.includes('web-runtime/frame-host/dist/frame_loop.wasm'));
 for(const p of paths){
   assert.doesNotMatch(p,/(?:fixture|generated_functions|private|synthetic\.dol|translator-fixture)/i,
    'test-only source or artifacts must never be allowlisted');
 }
});
