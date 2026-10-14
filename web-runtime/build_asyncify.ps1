[CmdletBinding()]
param([string]$Emsdk = 'C:\Users\kakyg\Documents\NSMBW-Private\toolchain\emsdk')
$ErrorActionPreference = 'Stop'
$env:EMSDK = $Emsdk
$env:EMSDK_NODE = Join-Path $Emsdk 'node\24.19.0_64bit\node.exe'
$env:EMSDK_PYTHON = Join-Path $Emsdk 'python\3.13.3_64bit\python.exe'
$env:PATH = "$(Join-Path $Emsdk 'upstream\emscripten');$(Join-Path $Emsdk 'upstream\bin');$env:PATH"
$compiler = Join-Path $Emsdk 'upstream\emscripten\em++.exe'
$out = Join-Path $PSScriptRoot 'dist\asyncify_probe.mjs'
& $compiler (Join-Path $PSScriptRoot 'src\asyncify_probe.cpp') '-std=c++17' '-O2' '-sWASM=1' '-sMODULARIZE=1' '-sEXPORT_ES6=1' '-sENVIRONMENT=web,node' '--no-entry' '-sASYNCIFY=1' '-sASYNCIFY_STACK_SIZE=65536' '-sEXPORTED_RUNTIME_METHODS=ccall' '-sFILESYSTEM=0' '-o' $out
if ($LASTEXITCODE -ne 0) { throw 'Asyncify build failed' }
Write-Host 'Built asyncify_probe.wasm'
