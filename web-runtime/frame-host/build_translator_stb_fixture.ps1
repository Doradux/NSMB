[CmdletBinding()]
param([Parameter(Mandatory)][string]$Emsdk,
      [Parameter(Mandatory)][string]$TranslatorCli)
$ErrorActionPreference='Stop'
$fixture=Join-Path $PSScriptRoot 'translator-fixture'
$runtime=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$out=Join-Path $fixture 'out\stb_fixture'
$source=Join-Path $out 'generated_functions\func_80001000.cpp'
$target=Join-Path $PSScriptRoot 'dist\frame_loop_translated_stb_fixture.mjs'
if(-not(Test-Path $TranslatorCli)){throw 'Original public upstream Translator.Cli missing'}
& node (Join-Path $fixture 'build_stb_fixture.mjs')
if($LASTEXITCODE -ne 0){throw 'Public synthetic DOL generation failed'}
& dotnet $TranslatorCli translate-recursive 0x80001000 --project (Join-Path $out 'recomp.yml') --outdir (Join-Path $out 'generated_functions') --threads 1
if($LASTEXITCODE -ne 0 -or -not(Test-Path $source)){throw 'Real C# translator failed'}
$code=Get-Content $source -Raw
if($code -notmatch 'extern "C" void func_80001000\(CpuContext\* MKW_RESTRICT ctx\)' -or
   $code -notmatch 'MemoryInline::FlatWrite8\(r4, static_cast<uint8_t>\(r3\)\);' -or
   $code -notmatch 'MemoryInline::FlatWrite32\(r6, r3\);' -or
   $code.IndexOf('FlatWrite8') -ge $code.IndexOf('FlatWrite32') -or
   ($code | Select-String -AllMatches 'MemoryInline::' ).Matches.Count -ne 2) {
 throw 'Unexpected generated PPC C++: fail closed rather than run arbitrary translated code'
}
$env:EMSDK=$Emsdk
$env:EMSDK_NODE=Join-Path $Emsdk 'node\24.19.0_64bit\node.exe'
$env:EMSDK_PYTHON=Join-Path $Emsdk 'python\3.13.3_64bit\python.exe'
$env:PATH="$(Join-Path $Emsdk 'upstream\emscripten');$(Join-Path $Emsdk 'upstream\bin');$env:PATH"
$compiler=Join-Path $Emsdk 'upstream\emscripten\em++.exe'
if(-not(Test-Path $compiler)){throw 'Emscripten missing'}
$files=@(
 (Join-Path $runtime 'src\guest_memory.cpp'),
 (Join-Path $runtime 'interop\synthetic_guest.cpp'),
 (Join-Path $runtime 'interop\device_policy.cpp'),
 (Join-Path $runtime 'runtime-services\input_snapshot.cpp'),
 (Join-Path $PSScriptRoot 'guest_cpu.cpp'),
 (Join-Path $PSScriptRoot 'translator_abi_fixture.cpp'),
 (Join-Path $PSScriptRoot 'frame_loop.cpp'),
 $source
)
$opts=@('-std=c++17','-O2','-Wall','-Wextra',
 '-DNSMB_PHASE6_TRANSLATED_STORE_FIXTURE=1','-DNSMB_PHASE8_SUBWORD_FIXTURE=1',
 '-I',(Join-Path $fixture 'include'),'-sWASM=1','-sMODULARIZE=1',
 '-sEXPORT_ES6=1','-sENVIRONMENT=web,node','--no-entry',
 '-sALLOW_MEMORY_GROWTH=1','-sABORTING_MALLOC=0','-sFILESYSTEM=0','-o',$target)
& $compiler @files @opts
if($LASTEXITCODE -ne 0){throw 'Checked phase8 test-only STB Wasm build failed'}
Write-Host 'Built public source-generated PPC STB -> STW -> BLR with atomic W04 journal, TEST ONLY'
