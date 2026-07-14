# Local Windows release build
# Easiest: double-click build.cmd in project root
# Or Admin PowerShell:
#   cd G:\vsworkplate01\skills-manager
#   powershell -NoExit -ExecutionPolicy Bypass -File .\scripts\tauri-build.ps1 -SkipElevate
param(
    [switch]$Clean,
    [switch]$SkipElevate
)

$ScriptPath = $MyInvocation.MyCommand.Path
$sourceRepo = Split-Path $PSScriptRoot -Parent
$logFile = "C:\tmp\skills-manager-build.log"
$targetDir = "C:\tmp\skills-manager-target"
$exePath = Join-Path $targetDir "release\skills-manager.exe"

function Log([string]$Message) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $Message"
    Write-Host $line
    try { Add-Content -Path $logFile -Value $line -ErrorAction SilentlyContinue } catch {}
}

function Wait-ForKey {
    Write-Host ""
    Write-Host "Press Enter to close..."
    Read-Host | Out-Null
}

function Run-Cmd {
    param([string]$Label, [string]$CommandLine)
    Log "START: $Label"
    Log "CMD: $CommandLine"
    cmd /c "$CommandLine >> `"$logFile`" 2>&1"
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed (exit $LASTEXITCODE). See $logFile"
    }
    Log "OK: $Label"
}

New-Item -ItemType Directory -Force -Path "C:\tmp" | Out-Null
"=== build $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Set-Content $logFile

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Log "Script started. Admin=$isAdmin Repo=$sourceRepo"

if (-not $isAdmin -and -not $SkipElevate) {
    Write-Host ""
    Write-Host "Need Administrator. Opening UAC dialog - click YES." -ForegroundColor Yellow
    Write-Host "Or: right-click PowerShell -> Run as administrator, then run with -SkipElevate" -ForegroundColor Yellow
    $elevArgs = @(
        "-NoProfile", "-NoExit", "-ExecutionPolicy", "Bypass",
        "-File", $ScriptPath, "-SkipElevate"
    )
    if ($Clean) { $elevArgs += "-Clean" }
    $proc = Start-Process -FilePath "powershell.exe" -ArgumentList $elevArgs -Verb RunAs -WorkingDirectory $sourceRepo -Wait -PassThru
    Write-Host "Elevated build exit code: $($proc.ExitCode)"
    Wait-ForKey
    exit $proc.ExitCode
}

if (-not $isAdmin) {
    Write-Host "ERROR: Not running as Administrator." -ForegroundColor Red
    Write-Host "Use build.cmd or Admin PowerShell + -SkipElevate"
    Wait-ForKey
    exit 1
}

try {
    cmd /c "taskkill /F /IM vctip.exe /T >nul 2>&1"
    foreach ($name in @("cargo", "rustc", "link", "mspdbsrv")) {
        Get-Process $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }

    Write-Host ""
    Write-Host "=== Skills Manager Windows Build ===" -ForegroundColor Cyan
    Write-Host "Log: $logFile"
    Write-Host ""

    Run-Cmd "rustup llvm-tools" "rustup component add llvm-tools-preview"

    foreach ($p in @($targetDir, $sourceRepo)) {
        Add-MpPreference -ExclusionPath $p -ErrorAction SilentlyContinue | Out-Null
    }

    if ($Clean -and (Test-Path $targetDir)) {
        Log "Cleaning $targetDir"
        Remove-Item -Recurse -Force $targetDir
    }
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

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

    Log "npm ci + tauri build (~15-25 min, output in log)"
    Write-Host "Building... (see $logFile for full output)" -ForegroundColor Cyan
    Run-Cmd "npm ci" "npm ci"
    Run-Cmd "tauri build" "npm run tauri:build -- --bundles nsis"

    $nsisDir = Join-Path $targetDir "release\bundle\nsis"
    if (-not (Test-Path $nsisDir)) {
        $nsisDir = Join-Path $targetDir "x86_64-pc-windows-msvc\release\bundle\nsis"
    }
    $setup = Get-ChildItem $nsisDir -Filter "*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    $outDir = Join-Path $sourceRepo "release"
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null

    if ($setup) {
        Copy-Item $setup.FullName $outDir -Force
        Write-Host ""
        Write-Host "SUCCESS - send this file:" -ForegroundColor Green
        Write-Host "  $outDir\$($setup.Name)" -ForegroundColor Green
    } elseif (Test-Path $exePath) {
        Copy-Item $exePath $outDir -Force
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $sourceRepo "scripts\package-portable.ps1")
        Write-Host ""
        Write-Host "NSIS bundle failed (GitHub timeout?) but exe is ready." -ForegroundColor Yellow
        Write-Host "Send: $outDir\skills-manager-portable.zip" -ForegroundColor Green
        Write-Host "Or retry installer: powershell -File .\scripts\tauri-bundle-only.ps1" -ForegroundColor Yellow
    } else {
        throw "No setup.exe or skills-manager.exe after build"
    }

} catch {
    if (Test-Path $exePath) {
        $outDir = Join-Path $sourceRepo "release"
        New-Item -ItemType Directory -Force -Path $outDir | Out-Null
        Copy-Item $exePath $outDir -Force
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $sourceRepo "scripts\package-portable.ps1")
        Write-Host ""
        Write-Host "Build error but portable zip created:" -ForegroundColor Yellow
        Write-Host "  $outDir\skills-manager-portable.zip" -ForegroundColor Green
        Write-Host "Retry setup.exe: powershell -File .\scripts\tauri-bundle-only.ps1" -ForegroundColor Yellow
        Wait-ForKey
        exit 0
    }
    Write-Host ""
    Write-Host "BUILD FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Full log: $logFile" -ForegroundColor Yellow
    Wait-ForKey
    exit 1
}

Wait-ForKey
exit 0
