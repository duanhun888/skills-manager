# Generate NSIS installer (*-setup.exe) after release build
#   powershell -ExecutionPolicy Bypass -File .\scripts\tauri-bundle.ps1
#
# Output: C:\tmp\skills-manager-target\release\bundle\nsis\*-setup.exe

$ErrorActionPreference = "Stop"
$sourceRepo = Split-Path $PSScriptRoot -Parent
$targetDir = "C:\tmp\skills-manager-target"
$logFile = "C:\tmp\skills-manager-bundle.log"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator (UAC)..."
    Start-Process powershell.exe -ArgumentList "-NoProfile -NoExit -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`"" -Verb RunAs -WorkingDirectory $sourceRepo
    exit 0
}

function Wait-ForKey {
    Write-Host ""
    Write-Host "Press Enter to close..."
    Read-Host | Out-Null
}

try {
    $vcvars = "G:\Program Files\Microsoft Visual Studio\18\Professional\VC\Auxiliary\Build\vcvars64.bat"
    if (-not (Test-Path $vcvars)) { throw "VS 2026 not found: $vcvars" }

    Set-Location $sourceRepo
    $env:CARGO_TARGET_DIR = $targetDir
    $env:CARGO_INCREMENTAL = "0"
    $env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path

    $envDump = cmd /c "`"$vcvars`" >nul 2>&1 && set"
    foreach ($line in $envDump) {
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) { continue }
        Set-Item -Path "Env:$($line.Substring(0, $eq))" -Value $line.Substring($eq + 1)
    }

    Write-Host "Building NSIS installer (bundles nsis only)..."
    Write-Host "Log: $logFile"
    npm run build
    npx tauri build --bundles nsis 2>&1 | Tee-Object -FilePath $logFile

    if ($LASTEXITCODE -ne 0) { throw "tauri build failed, see $logFile" }

    $nsisDir = Join-Path $targetDir "release\bundle\nsis"
    if (-not (Test-Path $nsisDir)) {
        $nsisDir = Join-Path $targetDir "x86_64-pc-windows-msvc\release\bundle\nsis"
    }

    $setup = Get-ChildItem $nsisDir -Filter "*-setup.exe" -ErrorAction SilentlyContinue
    if (-not $setup) { throw "No *-setup.exe in $nsisDir" }

    $outDir = Join-Path $sourceRepo "release"
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    Copy-Item $setup.FullName $outDir -Force

    Write-Host ""
    Write-Host "SUCCESS - send this ONE file to colleagues:" -ForegroundColor Green
    Write-Host "  $($setup.FullName)" -ForegroundColor Green
    Write-Host "  (copied to $outDir\$($setup.Name))" -ForegroundColor Green

} catch {
    Write-Host ""
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Log: $logFile" -ForegroundColor Yellow
    Wait-ForKey
    exit 1
}

Wait-ForKey
