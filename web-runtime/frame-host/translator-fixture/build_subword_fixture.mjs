// Public independent Phase6 exploration: only three newly authored PPC words.
// Never ingest owner game files. Emitted artifact stays under ignored out/.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)), dir=join(here,'out','subword_fixture');
await mkdir(dir,{recursive:true});
const source=Buffer.alloc(0x10C);
source.writeUInt32BE(0x100,0);
source.writeUInt32BE(0x80001000,0x48);
source.writeUInt32BE(12,0x90);
source.writeUInt32BE(0x80001000,0xE0);
const words=[0x98640000, // stb r3,0(r4): primary opcode 38
 0xB0660000,           // sth r3,0(r6): primary opcode 44
 0x4E800020];          // blr
words.forEach((w,i)=>source.writeUInt32BE(w,0x100+i*4));
const sha=createHash('sha256').update(source).digest('hex');
await writeFile(join(dir,'synthetic.dol'),source);
await writeFile(join(dir,'recomp.yml'),[
'schema_version: 1','workspace_root: .','project:',
'  id: public-synthetic-ppc-subword-stores',
'memory:','  sda_base: "0x80003000"','  sda2_base: "0x80002000"',
'inputs:','  dol:','    path: synthetic.dol','    sha256: '+sha,
'translation:','  entry_points: [0x80001000]',
'  allow_unsupported_instructions: false',
'output:','  root: output',''].join('\n'));
console.log(JSON.stringify({synthetic:true,sha256:sha,bytes:source.length,opcodes:words.map(v=>v.toString(16))}));
