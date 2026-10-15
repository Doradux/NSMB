[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Emsdk,
      [Parameter(Mandatory=$true)][string]$TranslatorCli)
$ErrorActionPreference='Stop'
$dir=Join-Path $PSScriptRoot 'translator-fixture'
$out=Join-Path $dir 'out\subword_fixture'
$source=Join-Path $out 'generated_functions\func_80001000.cpp'
& node (Join-Path $dir 'build_subword_fixture.mjs')
if($LASTEXITCODE -ne 0){throw 'Synthetic STB/STH guest fixture creation failed'}
& dotnet $TranslatorCli translate-recursive 0x80001000 --project (Join-Path $out 'recomp.yml') --outdir (Join-Path $out 'generated_functions') --threads 1
if($LASTEXITCODE -ne 0 -or -not(Test-Path $source)){throw 'Real public Translator.Cli failed to generate subword C++'}
$generated=Get-Content $source -Raw
if($generated -notmatch 'extern "C" void func_80001000\(CpuContext\* MKW_RESTRICT ctx\)' -or
   $generated -notmatch 'MemoryInline::FlatWrite8\(r4, static_cast<uint8_t>\(r3\)\);' -or
   $generated -notmatch 'MemoryInline::FlatWrite16\(r6, static_cast<uint16_t>\(r3\)\);') {
  throw 'Generated C++ changed from strictly audited source-only PPC STB/STH shape'
}
$env:EMSDK=$Emsdk
$env:EMSDK_NODE=Join-Path $Emsdk 'node\24.19.0_64bit\node.exe'
$env:EMSDK_PYTHON=Join-Path $Emsdk 'python\3.13.3_64bit\python.exe'
$env:PATH="$(Join-Path $Emsdk 'upstream\emscripten');$(Join-Path $Emsdk 'upstream\bin');$env:PATH"
$compiler=Join-Path $Emsdk 'upstream\emscripten\em++.exe'
if(-not(Test-Path $compiler)){throw 'Emscripten missing'}
# Expected RED BUILD: deliberately no FakeSuccess FlatWrite8/16 helpers.
# One upstream-generated function; the existing narrow 32-bit journal MUST
# reject linking unsupported width operations at the C++ compiler boundary.
$start=New-Object System.Diagnostics.ProcessStartInfo
$start.FileName=$compiler
$start.Arguments='-std=c++17 -DNSMB_PHASE6_TRANSLATED_STORE_FIXTURE=1 -I "'+(Join-Path $dir 'include')+'" -fsyntax-only "'+$source+'"'
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
$start.UseShellExecute=$false
$proc=[System.Diagnostics.Process]::Start($start)
$stdout=$proc.StandardOutput.ReadToEnd()
$stderr=$proc.StandardError.ReadToEnd()
$proc.WaitForExit()
if($proc.ExitCode -eq 0){throw 'FAIL-OPEN: compiled unsupported STB/STH into Wasm without verified guest write journal!'}
if($stderr -notmatch 'FlatWrite8' -or $stderr -notmatch 'FlatWrite16'){
  throw ('Unexpected failure reason, cannot claim strict opcode rejection: '+$stderr)
}
Write-Host 'PASS: actual precompiled upstream Translator.Cli emits FlatWrite8(uint8_t) + FlatWrite16(uint16_t)'
Write-Host 'PASS: compiled C++ properly REJECTS BOTH unsupported guest subword stores; no fake success or linked game.'
Write-Host 'TEST ONLY. To implement: W04 atomic multi-page reservation, W07 width-specific typed status, byte/halfword endianness, aliases, MMIO fail-closed.'
