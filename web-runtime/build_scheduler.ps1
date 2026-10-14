[CmdletBinding()]
param([string]$Emsdk = 'C:\Users\kakyg\Documents\NSMBW-Private\toolchain\emsdk')
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$source = Join-Path $root 'src\scheduler.cpp'
$out = Join-Path $root 'dist\scheduler.mjs'
New-Item -Force -ItemType Directory (Join-Path $root 'dist') | Out-Null
$env:EMSDK = $Emsdk
$env:EMSDK_NODE = Join-Path $Emsdk 'node\24.19.0_64bit\node.exe'
$env:EMSDK_PYTHON = Join-Path $Emsdk 'python\3.13.3_64bit\python.exe'
$env:PATH = "$(Join-Path $Emsdk 'upstream\emscripten');$(Join-Path $Emsdk 'upstream\bin');$env:PATH"
$compiler = Join-Path $Emsdk 'upstream\emscripten\em++.exe'
if (-not (Test-Path $compiler)) { throw 'Emscripten compiler missing' }
& $compiler $source '-std=c++17' '-O2' '-Wall' '-Wextra' '-sWASM=1' '-sMODULARIZE=1' '-sEXPORT_ES6=1' '-sENVIRONMENT=web,node' '--no-entry' '-sFILESYSTEM=0' '-o' $out
if ($LASTEXITCODE -ne 0) { throw 'Scheduler Wasm compilation failed' }
Write-Host 'Built scheduler.wasm and scheduler.mjs'
