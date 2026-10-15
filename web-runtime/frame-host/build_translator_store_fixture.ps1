[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Emsdk,
      [Parameter(Mandatory=$true)][string]$TranslatorCli)
$ErrorActionPreference='Stop'
$fixture=Join-Path $PSScriptRoot 'translator-fixture'
$runtime=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$out=Join-Path $fixture 'out\store_fixture'
$source=Join-Path $out 'generated_functions\func_80001000.cpp'
$helper=Join-Path $out 'generated_functions\func_80001010.cpp'
$target=Join-Path $PSScriptRoot 'dist\frame_loop_translated_store_fixture.mjs'
if(-not(Test-Path $TranslatorCli)){throw 'Public precompiled translator CLI not found'}
& node (Join-Path $fixture 'build_store_fixture.mjs')
if($LASTEXITCODE -ne 0){throw 'Public synthetic DOL fixture generation failed'}
& dotnet $TranslatorCli translate-recursive 0x80001000 --project (Join-Path $out 'recomp.yml') --outdir (Join-Path $out 'generated_functions') --threads 1
if($LASTEXITCODE -ne 0){throw 'Actual C# PowerPC translator failed'}
if(-not(Test-Path $source) -or -not(Test-Path $helper)){throw 'Expected TWO translated functions missing'}
$code=Get-Content $source -Raw
$leaf=Get-Content $helper -Raw
if($code -notmatch 'extern "C" void func_80001000\(CpuContext\* MKW_RESTRICT ctx\)' -or
   $code -notmatch 'MemoryInline::FlatWrite32\(r4, r3\);' -or
   $code -notmatch 'MemoryInline::FlatWrite32\(r6, r3\);' -or
   $code -notmatch 'inline leaf 0x80001010' -or
   $code -notmatch 'r3 = \(r3 \+ 1\);' -or
   $leaf -notmatch 'extern "C" void func_80001010\(CpuContext\* MKW_RESTRICT ctx\)'){
 throw 'UNEXPECTED real Translator.Cli generated code: unsupported source call or memory shape'
}
$env:EMSDK=$Emsdk
$env:EMSDK_NODE=Join-Path $Emsdk 'node\24.19.0_64bit\node.exe'
$env:EMSDK_PYTHON=Join-Path $Emsdk 'python\3.13.3_64bit\python.exe'
$env:PATH="$(Join-Path $Emsdk 'upstream\emscripten');$(Join-Path $Emsdk 'upstream\bin');$env:PATH"
$compiler=Join-Path $Emsdk 'upstream\emscripten\em++.exe'
if(-not(Test-Path $compiler)){throw 'Authorized Emscripten SDK unavailable'}
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
$options=@('-std=c++17','-O2','-Wall','-Wextra','-DNSMB_PHASE6_TRANSLATED_STORE_FIXTURE=1',
 '-I',(Join-Path $fixture 'include'),'-sWASM=1','-sMODULARIZE=1','-sEXPORT_ES6=1',
 '-sENVIRONMENT=web,node','--no-entry','-sALLOW_MEMORY_GROWTH=1',
 '-sABORTING_MALLOC=0','-sFILESYSTEM=0','-o',$target)
& $compiler @sources @options
if($LASTEXITCODE -ne 0){throw 'Real translator-generated transactional store compiled Wasm FAILED'}
Write-Host 'Built TEST-ONLY actual upstream Translator.Cli -> C++ two stores + inlined bl -> checked RAM journal Emscripten Wasm'
