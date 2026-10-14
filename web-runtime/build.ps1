[CmdletBinding()]
param([string]$Emsdk)
if (-not $Emsdk) { $Emsdk = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\NSMBW-Private\toolchain\emsdk')) }
$ErrorActionPreference = "Stop"
$source = Join-Path $PSScriptRoot "src\guest_memory.cpp"
$dist = Join-Path $PSScriptRoot "dist"
New-Item -ItemType Directory -Force $dist | Out-Null
$env:EMSDK = $Emsdk
$env:EMSDK_NODE = Join-Path $Emsdk "node\24.19.0_64bit\node.exe"
$env:EMSDK_PYTHON = Join-Path $Emsdk "python\3.13.3_64bit\python.exe"
$env:PATH = "$(Join-Path $Emsdk 'upstream\emscripten');$(Join-Path $Emsdk 'upstream\bin');$env:PATH"
$compiler = Join-Path $Emsdk "upstream\emscripten\em++.exe"
if (-not (Test-Path $compiler)) { throw "Emscripten not found at $compiler" }
& $compiler $source -std=c++17 -O2 -Wall -Wextra "-sWASM=1" "-sMODULARIZE=1" "-sEXPORT_ES6=1" "-sENVIRONMENT=web,node" "--no-entry" "-sALLOW_MEMORY_GROWTH=1" "-sFILESYSTEM=0" "-o" (Join-Path $dist "guest_memory.mjs")
if ($LASTEXITCODE -ne 0) { throw "Failed to compile experimental Wii RAM module" }
Write-Host "Built $dist\guest_memory.wasm"
