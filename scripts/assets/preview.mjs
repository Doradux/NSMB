#!/usr/bin/env node
// Private manifest packaging forecast. Reports aggregate counts only.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planPackages } from './plan.mjs';

async function main(args) {
  if (args.length < 1 || args.length > 2 || !path.isAbsolute(args[0]) ||
      path.extname(args[0]).toLowerCase() !== '.json') {
    throw new Error('Usage: node scripts/assets/preview.mjs ABSOLUTE_PRIVATE_MANIFEST.json [TARGET_BYTES]');
  }
  const full = path.resolve(args[0]);
  const metadata = await fs.lstat(full);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 32 * 1024 * 1024)
    throw new Error('Unsafe, oversized or missing manifest');
  let folder = path.dirname(full);
  while (true) {
    const dotgit = await fs.lstat(path.join(folder, '.git')).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (dotgit) throw new Error('Private input must not be inside Git');
    const parent = path.dirname(folder);
    if (parent === folder) break;
    folder = parent;
  }
  const manifest = JSON.parse(await fs.readFile(full, 'utf8'));
  const result = planPackages(manifest, { targetBytes: args[1] ?? '67108864' });
  console.log(JSON.stringify({
    files: result.assignments.length,
    packs: result.packs.length,
    oversizedPacks: result.packs.filter(p => p.oversized).length,
    sourceBytes: result.totals.sourceBytes,
    estimatedUncompressedPackBytes: result.totals.estimatedUncompressedPackBytes
  }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    console.error('PACK_PLAN_ERROR: invalid or untrusted private input');
    process.exitCode = 1;
  });
}
