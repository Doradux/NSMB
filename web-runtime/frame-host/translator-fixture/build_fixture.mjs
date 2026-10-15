// Public copyright-free PowerPC translator fixture (no Nintendo bytes).
// Canonical minimal DOL header from upstream Translator.Tests GenericProjectTests.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const dir=join(here,'out');
await mkdir(dir,{recursive:true});
const b=Buffer.alloc(0x108);
const address=0x80001000;
b.writeUInt32BE(0x100,0); // first executable segment offset
b.writeUInt32BE(address,0x48); // section's guest address
b.writeUInt32BE(8,0x90); // 8 source-only code bytes
b.writeUInt32BE(address,0xE0); // DOL entrypoint
b.writeUInt32BE(0x38630001,0x100); // addi r3,r3,1
b.writeUInt32BE(0x4E800020,0x104); // blr
const sha=createHash('sha256').update(b).digest('hex');
await writeFile(join(dir,'synthetic.dol'),b);
const manifest=[
'schema_version: 1',
'workspace_root: .',
'project:',
'  id: public-synthetic-ppc-two-instructions',
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
''
].join('\n');
await writeFile(join(dir,'recomp.yml'),manifest);
console.log(JSON.stringify({generated:'public synthetic 2-op DOL',sha256:sha,bytes:b.length,guestEntry:'0x80001000',outputDir:dir}));
