// Generated using only published PPC instruction encodings, never Wii game bytes.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),dir=join(here,'out','store_fixture');
await mkdir(dir,{recursive:true});
const b=Buffer.alloc(0x118);
b.writeUInt32BE(0x100,0);b.writeUInt32BE(0x80001000,0x48);
b.writeUInt32BE(24,0x90);b.writeUInt32BE(0x80001000,0xE0);
const opcodes=[0x90640000, // 80001000 stw r3,0(r4) first guest RAM write
 0x90660000,             // 80001004 stw r3,0(r6) second guest RAM write
 0x48000009,             // 80001008 bl +8 -> 80001010
 0x4E800020,             // 8000100c blr
 0x38630001,             // 80001010 addi r3,r3,1 helper
 0x4E800020];            // 80001014 blr helper
opcodes.forEach((w,i)=>b.writeUInt32BE(w,0x100+i*4));
const hash=createHash('sha256').update(b).digest('hex');
await writeFile(join(dir,'synthetic.dol'),b);
await writeFile(join(dir,'recomp.yml'),[
 'schema_version: 1','workspace_root: .','project:','  id: public-synthetic-ppc-store-and-call',
 'memory:','  sda_base: "0x80003000"','  sda2_base: "0x80002000"',
 'inputs:','  dol:','    path: synthetic.dol','    sha256: '+hash,
 'translation:','  entry_points: [0x80001000, 0x80001010]',
 '  allow_unsupported_instructions: false','output:','  root: output',''].join('\n'));
console.log(JSON.stringify({copyrightFree:true,sha256:hash,bytes:b.length,opcodes:opcodes.map(n=>n.toString(16))}));
