// Phase20 physically invoke NEW standalone invented PPC-Lite leaf in Node.
// This public test-only scalar ABI is NOT W03 scheduling or service authority.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
function refuse(message){throw Error('P20_TOY_WASM_DENY: '+message);}
export function verifyWasm(bytes,commit){
  if(!Buffer.isBuffer(bytes)||bytes.length<64||bytes.length>2_000_000)
    refuse('invalid wasm size');
  if(typeof commit!=='object'||!commit||
    !/^[0-9a-f]{64}$/.test(commit.expectedWasmSha||'')||
    sha(bytes)!==commit.expectedWasmSha)refuse('independent wasm SHA');
  if(!/^[0-9a-f]{64}$/.test(commit.sourceSha||'') ||
     !Array.isArray(commit.vectors)||commit.vectors.length<12||
     commit.vectors.length>512)refuse('independent oracle');
  if(!WebAssembly.validate(bytes))refuse('invalid actual wasm');
  const module=new WebAssembly.Module(bytes);
  const imports=WebAssembly.Module.imports(module);
  const exports=WebAssembly.Module.exports(module);
  if(imports.length)refuse('untrusted import authority');
  const names=exports.map(e=>e.name);
  if(!names.includes('nsmb_p20_leaf_probe')||
     !names.includes('nsmb_p20_leaf_source_tag') ||
     names.some(e=>/ticket|cpucontext|osgettime|wii|hle|auth|quota/i.test(e)))
     refuse('ABI public forbidden/missing symbols');
  const instance=new WebAssembly.Instance(module,{});
  const fn=instance.exports.nsmb_p20_leaf_probe;
  const tag=instance.exports.nsmb_p20_leaf_source_tag;
  if(typeof fn!=='function'||typeof tag!=='function')
    refuse('actual callable export required');
  if((tag()>>>0)!==(Number.parseInt(commit.sourceSha.slice(0,8),16)>>>0))
    refuse('source tag mismatch');
  let checks=0;
  for (const c of commit.vectors){
    if(!Array.isArray(c.args)||c.args.length!==6||
       c.args.some(n=>!Number.isInteger(n)||n<0||n>0xFFFFFFFF)||
       !Array.isArray(c.expect)||c.expect.length!==5||
       c.expect.some(n=>!Number.isInteger(n)||n<0||n>0xFFFFFFFF))
      refuse('invalid vector schema');
    for(let field=0;field<5;field++){
      const got=fn(...c.args,field)>>>0;
      if(got!==c.expect[field])refuse('actual wasm output != independently decoded PPC');
      checks++;
    }
  }
  return {status:'P20_INVENTED_LEAF_WASM_DYNAMIC_STOP',
    wasmSha256:sha(bytes),sourceSha256:commit.sourceSha,wasmBytes:bytes.length,
    abiExports:names,imports:imports.length,vectors:commit.vectors.length,
    checks,producerAttested:false,authenticReleaseEligible:false,
    realW03SchedulerInvoked:false};
}
async function main(){
  try{
    const args=process.argv.slice(2);
    if(args.length!==4||args[0]!=='--wasm'||args[2]!=='--commit')
      refuse('usage --wasm FILE --commit JSON');
    const report=verifyWasm(readFileSync(args[1]),
      JSON.parse(readFileSync(args[3],'utf8')));
    console.log(JSON.stringify(report));
    process.exitCode=3;
  }catch(err){
    console.error('P20_TOY_WASM_REJECTED_STOP');
    process.exitCode=4;
  }
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url)))
  main();
