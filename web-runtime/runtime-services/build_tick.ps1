[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Emsdk)
$ErrorActionPreference='Stop'
$runtime=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dist=Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$env:EMSDK=$Emsdk
$env:EMSDK_NODE=Join-Path $Emsdk 'node\24.19.0_64bit\node.exe'
$env:EMSDK_PYTHON=Join-Path $Emsdk 'python\3.13.3_64bit\python.exe'
$env:PATH="$(Join-Path $Emsdk 'upstream\emscripten');$(Join-Path $Emsdk 'upstream\bin');$env:PATH"
$compiler=Join-Path $Emsdk 'upstream\emscripten\em++.exe'
if(-not(Test-Path $compiler)){throw 'Emscripten unavailable'}
$sources=@(
 (Join-Path $runtime 'src\guest_memory.cpp'),
 (Join-Path $runtime 'interop\synthetic_guest.cpp'),
 (Join-Path $runtime 'interop\device_policy.cpp'),
 (Join-Path $runtime 'runtime-services\input_snapshot.cpp'),
 (Join-Path $runtime 'runtime-services\tick_snapshot.cpp'),
 (Join-Path $runtime 'runtime-services\time64_cpu.cpp'),
 (Join-Path $runtime 'frame-host\guest_cpu.cpp'),
 # Keep exact CURRENT W03 linker source parity: guest_cpu references the
 # self-authored public scalar from translator_abi_fixture.cpp.
 # This is a public synthetic ABI probe, NEVER translated Nintendo code.
 (Join-Path $runtime 'frame-host\translator_abi_fixture.cpp'),
 (Join-Path $runtime 'frame-host\frame_loop.cpp')
)
$argsList=@('-std=c++17','-O2','-Wall','-Wextra','-sWASM=1','-sMODULARIZE=1',
 '-sEXPORT_ES6=1','-sENVIRONMENT=web,node','--no-entry',
 '-sALLOW_MEMORY_GROWTH=1','-sABORTING_MALLOC=0','-sFILESYSTEM=0',
 '-o',(Join-Path $dist 'joined_tick.mjs'))
& $compiler @sources @argsList
if($LASTEXITCODE -ne 0){throw 'Single-Wasm deterministic-tick compile FAILED'}
Write-Host 'Compiled one synthetic Wasm: W03 CPU+W04 RAM+W07 fail-closed policy+W08 input+checked guest tick'
