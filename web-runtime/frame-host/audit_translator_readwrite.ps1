[CmdletBinding()]
param([Parameter(Mandatory)][string]$Emsdk,
      [Parameter(Mandatory)][string]$TranslatorCli)
$ErrorActionPreference='Stop'
$fixture=Join-Path $PSScriptRoot 'translator-fixture'
$dir=Join-Path $fixture 'out\readwrite_fixture'
& node (Join-Path $fixture 'build_readwrite_fixture.mjs')
if($LASTEXITCODE -ne 0){throw 'Public 3-op synthetic DOL generation failed'}
& dotnet $TranslatorCli translate-recursive 0x80001000 --project (Join-Path $dir 'recomp.yml') --outdir (Join-Path $dir 'generated_functions') --threads 1
if($LASTEXITCODE -ne 0){throw 'Real public upstream C# Translator.Cli failed'}
$code=Get-Content (Join-Path $dir 'generated_functions\func_80001000.cpp') -Raw
if($code -notmatch 'extern "C" void func_80001000\(CpuContext\* MKW_RESTRICT ctx\)' -or
   $code -notmatch 'MemoryInline::FlatWrite32\(r4, r3\);' -or
   $code -notmatch 'r5 = MemoryInline::FlatRead32\(r4\);' -or
   $code.IndexOf('FlatWrite32') -gt $code.IndexOf('FlatRead32')){
  throw 'Unexpected real C++ generated source or incorrect guest read/write order'
}
$env:EMSDK=$Emsdk
$env:PATH="$(Join-Path $Emsdk 'upstream\emscripten');$(Join-Path $Emsdk 'upstream\bin');$env:PATH"
$compiler=Join-Path $Emsdk 'upstream\emscripten\em++.exe'
$inc=Join-Path $fixture 'include'
$source=Join-Path $dir 'generated_functions\func_80001000.cpp'
$ErrorActionPreference='Continue' # An expected native compiler error is our negative test.
$diagnostic=& $compiler -std=c++17 -fsyntax-only -DNSMB_PHASE6_TRANSLATED_STORE_FIXTURE=1 -I $inc $source 2>&1 | Out-String
$ErrorActionPreference='Stop'
if($LASTEXITCODE -eq 0){throw 'UNSAFE: read-after-staged-write unexpectedly compiled without journal forwarding'}
if($diagnostic -notmatch 'FlatRead32' -or $diagnostic -notmatch "no member named 'FlatRead32'"){
  throw "Unexpected compiler failure; expected missing journal-aware FlatRead32: $diagnostic"
}
Write-Output 'PASS: source-generated STW->LWZ requires missing journal-aware FlatRead32; fail-closed at real Emscripten compiler'
