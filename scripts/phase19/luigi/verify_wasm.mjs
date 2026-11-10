// Exact-byte ABI + dynamic invented PPC toy proof. No original Wii code.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

function fail(message) {
  throw new Error('INVENTED_WASM_REJECTED_STOP: '+message);
}
function sha(bytes){return createHash('sha256').update(bytes).digest('hex');}

export function validateWasm(bytes, {expectedSha, sourceSha, inputs}={}) {
  if (!Buffer.isBuffer(bytes) || bytes.length===0 || bytes.length>1_000_000)
    fail('invalid or oversized artifact bytes');
  if (typeof expectedSha!=='string' || !/^[0-9a-f]{64}$/.test(expectedSha)
      || sha(bytes)!==expectedSha)
    fail('Wasm digest does not match external expected bytes');
  if (typeof sourceSha!=='string' || !/^[0-9a-f]{64}$/.test(sourceSha))
    fail('invalid external source SHA');
  if (!WebAssembly.validate(bytes))fail('not a valid WebAssembly module');
  const module=new WebAssembly.Module(bytes);
  const imports=WebAssembly.Module.imports(module);
  if (imports.length)fail('invented program must have zero imports');
  const exports=WebAssembly.Module.exports(module);
  const keys=exports.map(e=>e.name);
  for(const key of ['nsmb_toy_execute','nsmb_toy_function_count','nsmb_toy_source_tag']){
    if(!keys.includes(key))fail('missing expected invented ABI export '+key);
  }
  if(keys.some(k=>/wii|hle|ios|osgettime|forge|debug/i.test(k)))
    fail('forbidden guest/hardware/test-forge export');
  const instance=new WebAssembly.Instance(module,{});
  const {nsmb_toy_execute:run,nsmb_toy_function_count:count,
         nsmb_toy_source_tag:tag}=instance.exports;
  if(typeof run!=='function' || typeof count!=='function' || typeof tag!=='function')
    fail('ABI exports not callable');
  if((count()>>>0)!==6)fail('invented expected function count mismatch');
  const expectedTag=Number.parseInt(sourceSha.slice(0,8),16)>>>0;
  if((tag()>>>0)!==expectedTag)fail('compiled source tag mismatches pinned source');
  if(!Array.isArray(inputs) || !inputs.length || inputs.length>64)
    fail('bounded independent test vectors required');
  for(const e of inputs){
    if(typeof e!=='object' || e===null || !Number.isInteger(e.entry)
       || !Number.isInteger(e.initial) || !Number.isInteger(e.expected)
       || e.entry<0 || e.entry>4096 || e.initial<0 || e.initial>100000
       || e.expected<0 || e.expected>0xffffffff)
      fail('invalid test vector');
    const result=run(e.entry,e.initial)>>>0;
    if(result!==e.expected)
      fail('genuine new Wasm execution differs from independent source oracle');
  }
  return {
    status:'FRESH_INVENTED_WASM_DYNAMIC_STOP',wasmSha256:sha(bytes),
    wasmBytes:bytes.length,sourceSha256:sourceSha,
    importCount:imports.length,exportNames:keys,caseCount:inputs.length,
    producerAttested:false,authenticReleaseEligible:false
  };
}

if(process.argv[1] && resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)) {
  try{
    if(process.argv.length!==6 || process.argv[2]!=='--wasm' ||
       process.argv[4]!=='--test-commit')fail('usage');
    const bytes=readFileSync(process.argv[3]);
    const commitment=JSON.parse(readFileSync(process.argv[5],'utf8'));
    const response=validateWasm(bytes,commitment);
    process.stdout.write(JSON.stringify(response)+'\n');
    process.exitCode=3; // toy success means authentic release STOP
  }catch(e){
    console.error('INVENTED_WASM_REJECTED_STOP');
    process.exitCode=4;
  }
}
