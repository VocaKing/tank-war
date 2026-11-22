# Windows 11 Blender build launcher for Steel Front IS-2.
# Run from the project ZIP folder by double-clicking build-is2-windows.cmd.
# Does not grant remote access, install a server, or require admin privileges.
param([switch]$Full)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$generator = Join-Path $PSScriptRoot 'is2_model1944_blockout.py'
if (-not (Test-Path -LiteralPath $generator)) {
    throw "Missing IS-2 Blender generator: $generator"
}

$blenderExe = $null
if ($env:BLENDER_EXE -and (Test-Path -LiteralPath $env:BLENDER_EXE)) {
    $blenderExe = $env:BLENDER_EXE
} else {
    $programFiles = ${env:ProgramFiles}
    $installRoot = Join-Path $programFiles 'Blender Foundation'
    if (Test-Path -LiteralPath $installRoot) {
        $candidates = @(Get-ChildItem -LiteralPath $installRoot -Directory |
          Sort-Object Name -Descending |
          ForEach-Object { Join-Path $_.FullName 'blender.exe' } |
          Where-Object { Test-Path -LiteralPath $_ })
        if ($candidates.Count -gt 0) { $blenderExe = $candidates[0] }
    }
    if (-not $blenderExe) {
        $found = Get-Command 'blender.exe' -ErrorAction SilentlyContinue
        if ($found) { $blenderExe = $found.Source }
    }
}
if (-not $blenderExe) {
    Write-Host ''
    Write-Host 'Blender not found. Install Blender from https://www.blender.org/download/'
    Write-Host 'If installed to a custom folder, set BLENDER_EXE to the full blender.exe path.'
    exit 1
}

$env:IS2_FAST_PREVIEW = if ($Full) { '0' } else { '1' }
$mode = if ($Full) { 'FULL (five 1200x900 images)' } else { 'FAST (one 720x540 image)' }
Write-Host "Blender: $blenderExe"
Write-Host "Project: $repoRoot"
Write-Host "Mode: $mode"
Write-Host ''

Push-Location $repoRoot
try {
    & $blenderExe --background --factory-startup --python-exit-code 1 --python $generator
    if ($LASTEXITCODE -ne 0) {
        throw "Blender failed with exit code $LASTEXITCODE."
    }
    $glb = Join-Path $repoRoot 'public\models\is2_model1944_blockout.glb'
    $blend = Join-Path $repoRoot 'artifacts\is2-model1944\is2_model1944_first_pass.blend'
    $preview = Join-Path $repoRoot 'artifacts\is2-model1944\01_front_three_quarter.png'
    foreach ($file in @($glb, $blend, $preview)) {
        if (-not (Test-Path -LiteralPath $file)) { throw "Expected output missing: $file" }
    }
    Write-Host ''
    Write-Host 'IS-2 build completed successfully.'
    Write-Host "GLB:     $glb"
    Write-Host "BLEND:   $blend"
    Write-Host "Preview: $preview"
    Invoke-Item -LiteralPath (Split-Path $preview)
} finally {
    Pop-Location
}
