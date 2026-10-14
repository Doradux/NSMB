[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Emsdk)
$ErrorActionPreference='Stop'
$runtime = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dist = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$env:EMSDK = $Emsdk
$env:EMSDK_NODE = Join-Path $Emsdk 'node\24.19.0_64bit\node.exe'
$env:EMSDK_PYTHON = Join-Path $Emsdk 'python\3.13.3_64bit\python.exe'
$env:PATH = "$(Join-Path $Emsdk 'upstream\emscripten');$(Join-Path $Emsdk 'upstream\bin');$env:PATH"
$compiler = Join-Path $Emsdk 'upstream\emscripten\em++.exe'
if (-not (Test-Path $compiler)) { throw 'Emscripten unavailable' }
$argsList = @((Join-Path $runtime 'src\guest_memory.cpp'), (Join-Path $PSScriptRoot 'synthetic_guest.cpp'), '-std=c++17','-O2','-Wall','-Wextra','-sWASM=1','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,node','--no-entry','-sALLOW_MEMORY_GROWTH=1','-sABORTING_MALLOC=0','-sFILESYSTEM=0','-o',(Join-Path $dist 'checked_interop.mjs'))
& $compiler @argsList
if ($LASTEXITCODE -ne 0) { throw 'Failed to build synthetic checked interop module' }
Write-Host 'Built standalone synthetic checked interop WebAssembly'
