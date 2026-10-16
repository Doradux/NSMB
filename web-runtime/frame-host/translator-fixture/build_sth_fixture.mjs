// Entirely public synthetic DOL. Exactly STH r3,0(r4); STW r3,0(r6); BLR.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const folder=join(dirname(fileURLToPath(import.meta.url)),'out','sth_fixture');
await mkdir(folder,{recursive:true});
const dol=Buffer.alloc(0x10c);
dol.writeUInt32BE(0x100,0);dol.writeUInt32BE(0x80001000,0x48);
dol.writeUInt32BE(12,0x90);dol.writeUInt32BE(0x80001000,0xe0);
for(const [i,opcode] of [0xb0640000,0x90660000,0x4e800020].entries())
 dol.writeUInt32BE(opcode,0x100+i*4);
const sha=createHash('sha256').update(dol).digest('hex');
await writeFile(join(folder,'synthetic.dol'),dol);
await writeFile(join(folder,'recomp.yml'),[
 'schema_version: 1','workspace_root: .','project:','  id: public-p9-sth-checked',
 'memory:','  sda_base: "0x80003000"','  sda2_base: "0x80002000"',
 'inputs:','  dol:','    path: synthetic.dol','    sha256: '+sha,
 'translation:','  entry_points: [0x80001000]',
 '  allow_unsupported_instructions: false','output:','  root: output',''
].join('\n'));
console.log(JSON.stringify({publicSynthetic:true,operations:['sth','stw','blr'],sha256:sha}));
