# Retry NSIS installer only (exe already built; ~2-5 min if network OK)
#   powershell -ExecutionPolicy Bypass -File .\scripts\tauri-bundle-only.ps1
param([switch]$SkipElevate)

$sourceRepo = Split-Path $PSScriptRoot -Parent
$targetDir = "C:\tmp\skills-manager-target"
$exePath = Join-Path $targetDir "release\skills-manager.exe"
$logFile = "C:\tmp\skills-manager-bundle.log"

function Wait-ForKey {
    Write-Host ""
    Write-Host "Press Enter to close..."
    Read-Host | Out-Null
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $SkipElevate) {
    Start-Process powershell -Verb RunAs -Wait -WorkingDirectory $sourceRepo -ArgumentList @(
        "-NoProfile", "-NoExit", "-ExecutionPolicy", "Bypass",
        "-File", $MyInvocation.MyCommand.Path, "-SkipElevate"
    )
    exit 0
}

if (-not (Test-Path $exePath)) {
    Write-Host "ERROR: Run full build first. Missing: $exePath" -ForegroundColor Red
    Wait-ForKey
    exit 1
}

Write-Host "Exe found. Bundling NSIS installer (downloads from GitHub)..." -ForegroundColor Cyan
Write-Host "If timeout: use VPN/proxy, then run this script again." -ForegroundColor Yellow
Write-Host ""

$vcvars = "G:\Program Files\Microsoft Visual Studio\18\Professional\VC\Auxiliary\Build\vcvars64.bat"
Set-Location $sourceRepo
$env:CARGO_TARGET_DIR = $targetDir
$env:CARGO_INCREMENTAL = "0"
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path

if (Test-Path $vcvars) {
    $envDump = cmd /c "`"$vcvars`" >nul 2>&1 && set"
    foreach ($line in $envDump) {
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) { continue }
        Set-Item -Path "Env:$($line.Substring(0, $eq))" -Value $line.Substring($eq + 1)
    }
}

cmd /c "npm run tauri:build -- --bundles nsis >> `"$logFile`" 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Bundle failed. Log: $logFile" -ForegroundColor Red
    Write-Host ""
    Write-Host "Portable fallback (no installer):" -ForegroundColor Yellow
    Write-Host "  powershell -File .\scripts\package-portable.ps1"
    Wait-ForKey
    exit 1
}

$nsisDir = Join-Path $targetDir "release\bundle\nsis"
$setup = Get-ChildItem $nsisDir -Filter "*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
$outDir = Join-Path $sourceRepo "release"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Copy-Item $setup.FullName $outDir -Force

Write-Host ""
Write-Host "SUCCESS:" -ForegroundColor Green
Write-Host "  $outDir\$($setup.Name)" -ForegroundColor Green
Wait-ForKey
