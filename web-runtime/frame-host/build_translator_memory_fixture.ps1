[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Emsdk,
  [Parameter(Mandatory=$true)][string]$TranslatorCli
)
$ErrorActionPreference='Stop'
$fixture=Join-Path $PSScriptRoot 'translator-fixture'
$runtime=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$out=Join-Path $fixture 'out\memory_fixture'
$source=Join-Path $out 'generated_functions\func_80001000.cpp'
$target=Join-Path $PSScriptRoot 'dist\frame_loop_translated_load_fixture.mjs'
if(-not(Test-Path $TranslatorCli)){throw 'Public upstream translator CLI not found'}
& node (Join-Path $fixture 'build_memory_fixture.mjs')
if($LASTEXITCODE -ne 0){throw 'Synthetic DOL creation failed'}
& dotnet $TranslatorCli translate-recursive 0x80001000 --project (Join-Path $out 'recomp.yml') --outdir (Join-Path $out 'generated_functions') --threads 1
if($LASTEXITCODE -ne 0){throw 'Actual C# PowerPC translator failed on public synthetic DOL'}
if(-not(Test-Path $source)){throw 'Expected translator function missing'}
$code=Get-Content $source -Raw
if($code -notmatch 'extern "C" void func_80001000\(CpuContext\* MKW_RESTRICT ctx\)' -or
   $code -notmatch 'r3 = MemoryInline::FlatRead32\(r4\);' -or
   $code -notmatch 'ctx->gpr\[3\] = r3;'){
  throw 'Generated output does not match strict 2-instruction translator ABI fixture'
}
$env:EMSDK=$Emsdk
$env:EMSDK_NODE=Join-Path $Emsdk 'node\24.19.0_64bit\node.exe'
$env:EMSDK_PYTHON=Join-Path $Emsdk 'python\3.13.3_64bit\python.exe'
$env:PATH="$(Join-Path $Emsdk 'upstream\emscripten');$(Join-Path $Emsdk 'upstream\bin');$env:PATH"
$compiler=Join-Path $Emsdk 'upstream\emscripten\em++.exe'
if(-not(Test-Path $compiler)){throw 'Emscripten toolchain missing'}
$sources=@(
  (Join-Path $runtime 'src\guest_memory.cpp'),
  (Join-Path $runtime 'interop\synthetic_guest.cpp'),
  (Join-Path $runtime 'interop\device_policy.cpp'),
  (Join-Path $runtime 'runtime-services\input_snapshot.cpp'),
  (Join-Path $PSScriptRoot 'guest_cpu.cpp'),
  (Join-Path $PSScriptRoot 'translator_abi_fixture.cpp'),
  (Join-Path $PSScriptRoot 'frame_loop.cpp'),
  $source
)
$opts=@('-std=c++17','-O2','-Wall','-Wextra','-DNSMB_PHASE5_TRANSLATED_LOAD_FIXTURE=1',
 '-I',(Join-Path $fixture 'include'),
 '-sWASM=1','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,node',
 '--no-entry','-sALLOW_MEMORY_GROWTH=1','-sABORTING_MALLOC=0','-sFILESYSTEM=0',
 '-o',$target)
& $compiler @sources @opts
if($LASTEXITCODE -ne 0){throw 'Real translator output could not link to checked W03/W07 Wasm'}
Write-Host 'Built ACTUAL C# translator output from 2 source-independent PPC instructions as a TEST-ONLY linked W03/W07 Wasm'
