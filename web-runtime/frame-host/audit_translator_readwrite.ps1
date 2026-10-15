[CmdletBinding()]
param([Parameter(Mandatory)][string]$Emsdk,
      [Parameter(Mandatory)][string]$TranslatorCli)
$ErrorActionPreference='Stop'
# Phase 6 baseline intentionally refused source-generated STW->LWZ because
# FlatRead32 had no journal overlay. Phase 7 now permits ONLY the exact
# validated STW->LWZ->STW->BLR four-op fixture in a TEST-ONLY Wasm build.
& (Join-Path $PSScriptRoot 'build_translator_readwrite_fixture.ps1') -Emsdk $Emsdk -TranslatorCli $TranslatorCli
if($LASTEXITCODE -ne 0){throw 'Phase7 exact source-generated journal forwarding gate failed'}
Write-Output 'PASS: real translated STW->LWZ->STW forwards journal read, with actual checked Wasm'
