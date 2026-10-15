[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Emsdk,
  [switch]$WithTestFixture
)
$ErrorActionPreference = 'Stop'
$runtime = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dist = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$env:EMSDK = $Emsdk
$env:EMSDK_NODE = Join-Path $Emsdk 'node\24.19.0_64bit\node.exe'
$env:EMSDK_PYTHON = Join-Path $Emsdk 'python\3.13.3_64bit\python.exe'
$env:PATH = "$(Join-Path $Emsdk 'upstream\emscripten');$(Join-Path $Emsdk 'upstream\bin');$env:PATH"
$compiler = Join-Path $Emsdk 'upstream\emscripten\em++.exe'
if (-not (Test-Path $compiler)) { throw 'Emscripten unavailable' }
# Both normal and fixture Wasm link the current-main W04/W07 sources unchanged.
$source = @(
  (Join-Path $runtime 'src\guest_memory.cpp'),
  (Join-Path $runtime 'interop\synthetic_guest.cpp'),
  (Join-Path $runtime 'interop\device_policy.cpp'),
  # Input service shares the SAME C++ W04 RAM instance; no duplicate Wasm.
  (Join-Path $runtime 'runtime-services\input_snapshot.cpp'),
  (Join-Path $PSScriptRoot 'guest_cpu.cpp'),
  (Join-Path $PSScriptRoot 'translator_abi_fixture.cpp'),
  (Join-Path $PSScriptRoot 'frame_loop.cpp')
)
$opts = @('-std=c++17','-O2','-Wall','-Wextra','-sWASM=1','-sMODULARIZE=1',
  '-sEXPORT_ES6=1','-sENVIRONMENT=web,node','--no-entry',
  '-sALLOW_MEMORY_GROWTH=1','-sABORTING_MALLOC=0','-sFILESYSTEM=0')
& $compiler @source @opts '-o' (Join-Path $dist 'frame_loop.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile normal linked W03+typed W07 Wasm' }
Write-Host 'Built ONE synthetic W03+W07 checked memory/device Wasm; default MMIO denied'
if ($WithTestFixture) {
  # Explicit test-only mock C++ callbacks, NEVER present in normal module.
  $fixture = Join-Path $runtime 'interop\test\mock_device_policy.cpp'
  & $compiler @source $fixture @opts '-o' (Join-Path $dist 'frame_loop_fixture.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Failed to compile TEST-ONLY typed policy fixture' }
  Write-Host 'Built separate W07 synthetic callback fixture with statuses 5 and 6'
}
