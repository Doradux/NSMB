import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const folder=join(root,'out','memory_fixture');
await mkdir(folder,{recursive:true});
const bytes=Buffer.alloc(0x108);
bytes.writeUInt32BE(0x100,0);
bytes.writeUInt32BE(0x80001000,0x48);
bytes.writeUInt32BE(8,0x90);
bytes.writeUInt32BE(0x80001000,0xE0);
bytes.writeUInt32BE(0x80640000,0x100); // lwz r3, 0(r4)
bytes.writeUInt32BE(0x4E800020,0x104); // blr
await writeFile(join(folder,'synthetic.dol'),bytes);
const sha=createHash('sha256').update(bytes).digest('hex');
await writeFile(join(folder,'recomp.yml'),[
 'schema_version: 1',
 'workspace_root: .',
 'project:',
 '  id: public-synthetic-ppc-checked-load',
 'memory:',
 '  sda_base: "0x80003000"',
 '  sda2_base: "0x80002000"',
 'inputs:',
 '  dol:',
 '    path: synthetic.dol',
 '    sha256: '+sha,
 'translation:',
 '  entry_points: [0x80001000]',
 '  allow_unsupported_instructions: false',
 'output:',
 '  root: output',
 ''].join('\n'));
console.log(JSON.stringify({fixture:'public lwz r3,0(r4);blr',guest:'0x80001000',fileBytes:bytes.length,sha256:sha}));
