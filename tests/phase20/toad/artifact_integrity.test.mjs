// P20 test-only, exact physical Wasm tamper controls.
// A failed child is a RED invariant proof; NEVER count as successful
// authorized W03 guest execution or as a Nintendo original test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const path=process.env.NSMB_TOAD_P20_WASM;
const sha=process.env.NSMB_TOAD_P20_WASM_SHA256;
const childEnv={...process.env};
// Test runner sets this variable for its OWN child context; nesting a new
// real --test Node suite must NOT inherit it or tests can silently skip.
delete childEnv.NODE_TEST_CONTEXT;
const skip=!(path&&/^[a-f0-9]{64}$/.test(sha||''))?
 'requires independent exact SHA-pinned new P20 Wasm':false;
function corrupted(t){
 const bytes=Buffer.from(readFileSync(path));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);
 bytes[bytes.length-1]^=1;
 const d=mkdtempSync(join(tmpdir(),'toad20-tamper-'));
 t.after(()=>rmSync(d,{recursive:true,force:true}));
 const filename=join(d,'tampered.wasm');
 writeFileSync(filename,bytes);
 assert.notEqual(createHash('sha256').update(bytes).digest('hex'),sha);
 return filename;
}
function child(filename,script){
 return spawnSync('/usr/bin/node',[script],{encoding:'utf8',
 timeout:20000,env:{...childEnv,
 NSMB_TOAD_P20_WASM:filename,NSMB_TOAD_P20_WASM_SHA256:sha,
 LD_LIBRARY_PATH:'',LD_PRELOAD:''}});
}
test('RED: independently changed physical Wasm cannot pass 4 Node SHA gates',
 {skip},t=>{
 const file=corrupted(t);
 const got=spawnSync('/usr/bin/node',['--test',
   join(root,'tests/phase20/toad/service_v2_wasm.test.mjs')],
 {encoding:'utf8',timeout:20000,env:{...childEnv,
 NSMB_TOAD_P20_WASM:file,NSMB_TOAD_P20_WASM_SHA256:sha,
 LD_LIBRARY_PATH:'',LD_PRELOAD:''}});
 assert.notEqual(got.status,0,'tampered physical bytes cannot pass Node');
 assert.match(got.stdout,/digest|not ok/);
 assert.match(got.stdout,/# fail 4/);
});
test('RED: Chromium helper must block bad Wasm SHA before spawning browser',
 {skip},t=>{
 const file=corrupted(t);
 const browser=process.env.NSMB_BROWSER||
 '/home/marcos/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome';
 const script=join(root,'tests/phase20/toad/browser_v2_probe.mjs');
 const got=spawnSync('/usr/bin/node',[script],{encoding:'utf8',
 timeout:20000,env:{...childEnv,NSMB_BROWSER:browser,
 NSMB_TOAD_P20_WASM:file,NSMB_TOAD_P20_WASM_SHA256:sha,
 LD_LIBRARY_PATH:'',LD_PRELOAD:''}});
 assert.notEqual(got.status,0,'bad hash must fail before Chromium launch');
 assert.match(got.stderr,/AssertionError|Expected values to be strictly equal/);
 assert.doesNotMatch(got.stdout,/CHROMIUM_FUNCTIONAL_PASS/);
});
