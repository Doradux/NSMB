// Copyright-free 4-op PPC: STW r3,0(r4); LWZ r5,0(r4); STW r3,0(r6); BLR.
// A read-after-staged-write would need journal forwarding: until supported,
// the real translator output MUST fail compiler linkage rather than read stale RAM.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const out=join(dirname(fileURLToPath(import.meta.url)),'out','readwrite_fixture');
await mkdir(out,{recursive:true});
const dol=Buffer.alloc(0x110);
dol.writeUInt32BE(0x100,0);
dol.writeUInt32BE(0x80001000,0x48);
dol.writeUInt32BE(16,0x90);
dol.writeUInt32BE(0x80001000,0xe0);
for(const [i,word] of [0x90640000,0x80a40000,0x90660000,0x4e800020].entries())
 dol.writeUInt32BE(word,0x100+i*4);
const sha=createHash('sha256').update(dol).digest('hex');
await writeFile(join(out,'synthetic.dol'),dol);
await writeFile(join(out,'recomp.yml'),[
 'schema_version: 1','workspace_root: .','project:','  id: public-read-after-write-then-late-store',
 'memory:','  sda_base: "0x80003000"','  sda2_base: "0x80002000"',
 'inputs:','  dol:','    path: synthetic.dol','    sha256: '+sha,
 'translation:','  entry_points: [0x80001000]',
 '  allow_unsupported_instructions: false','output:','  root: output',''].join('\n'));
console.log(JSON.stringify({publicFixture:true,sha256:sha,words:4}));
