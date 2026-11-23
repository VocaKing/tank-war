param(
    [string]$EngineRoot = $env:UE57_ROOT,
    [ValidateRange(640, 7680)][int]$Width = 2560,
    [ValidateRange(480, 4320)][int]$Height = 1440,
    [switch]$Editor
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Project = Join-Path $Root 'SteelFront.uproject'

function Test-Engine([string]$Path) {
    return ($Path -and (Test-Path -LiteralPath (Join-Path $Path 'Engine\Binaries\Win64\UnrealEditor.exe')))
}

if (-not $EngineRoot) {
    $Launcher = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\EpicGames\Unreal Engine\5.7' -ErrorAction SilentlyContinue
    $EngineRoot = $Launcher.InstalledDirectory
    if (-not (Test-Engine $EngineRoot)) {
        $EngineRoot = Join-Path $env:ProgramFiles 'Epic Games\UE_5.7'
    }
}
if (-not (Test-Engine $EngineRoot)) {
    throw 'Unreal Engine 5.7 was not found. Install it in Epic Games Launcher or set UE57_ROOT to its UE_5.7 folder.'
}

$Build = Join-Path $EngineRoot 'Engine\Build\BatchFiles\Build.bat'
$EditorCmd = Join-Path $EngineRoot 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
$EditorExe = Join-Path $EngineRoot 'Engine\Binaries\Win64\UnrealEditor.exe'
$Content = Join-Path $Root 'Content\Prototype'
$LogDir = Join-Path $Root 'Saved\Logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Invoke-Step([string]$Description, [string]$Executable, [string[]]$Arguments) {
    Write-Host $Description
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed (exit $LASTEXITCODE). Check the console and $LogDir."
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $Content 'Normandy.sfbin'))) {
    throw 'Missing Content\Prototype\Normandy.sfbin. Extract the complete prototype before running.'
}

Invoke-Step 'Building Steel Front for Unreal Engine 5.7' $Build @(
    'SteelFrontEditor', 'Win64', 'Development', "-Project=$Project", '-WaitMutex', '-NoHotReload'
)

$Common = @($Project, '-unattended', '-nop4', '-nosplash', '-nullrhi', '-stdout', '-FullStdOutLogOutput')
$MeshNames = 'Terrain','Buildings','Water','Hull','Turret','Gun','Foliage'
$MaterialNames = 'Terrain','Stone','Foliage','Armor','Water','Target','Stand','Tracer'

function Test-Assets([string]$Folder, [string]$Prefix, [string[]]$Names) {
    foreach ($Name in $Names) {
        if (-not (Test-Path -LiteralPath (Join-Path $Content "$Folder\$Prefix$Name.uasset"))) {
            return $false
        }
    }
    return $true
}

if (-not (Test-Assets 'Meshes' 'SM_' $MeshNames)) {
    Invoke-Step 'Preparing Normandy meshes and Nanite data' $EditorCmd ($Common + @(
        '-run=SteelFrontBake', "-abslog=$(Join-Path $LogDir 'SteelFrontBake.log')"
    ))
}
if (-not (Test-Assets 'Materials' 'M_' $MaterialNames)) {
    $MaterialScript = Join-Path $PSScriptRoot 'PrepareMaterials.py'
    Invoke-Step 'Preparing textures and materials' $EditorCmd ($Common + @(
        '-run=pythonscript', "-script=$MaterialScript", "-abslog=$(Join-Path $LogDir 'SteelFrontMaterials.log')"
    ))
}
if (-not (Test-Assets 'Meshes' 'SM_' $MeshNames) -or -not (Test-Assets 'Materials' 'M_' $MaterialNames)) {
    throw "Unreal did not generate all the expected assets. Check $LogDir."
}

$QuotedProject = '"{0}"' -f $Project
$ArgsList = @($QuotedProject, '/Engine/Maps/Entry', '-dx12', '-log')
if (-not $Editor) {
    $ArgsList += @('-game', '-windowed', "-ResX=$Width", "-ResY=$Height")
}
Start-Process -FilePath $EditorExe -ArgumentList $ArgsList -WorkingDirectory $Root
