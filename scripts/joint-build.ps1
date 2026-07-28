# Joint build: build 芯宏定制 OpenCode Desktop (DEV) from opencode/ + Skills NSIS
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\joint-build.ps1 -SkipElevate
#   powershell -ExecutionPolicy Bypass -File .\scripts\joint-build.ps1 -SkipElevate -SkipOpenCode
param(
    [switch]$SkipOpenCode,
    [switch]$SkipSkills,
    [switch]$SkipElevate,
    [switch]$SkipFetch
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$VersionFile = Join-Path $Root "OPENCODE_VERSION"
$Staging = Join-Path $Root "release\staging"
$LogFile = "C:\tmp\skills-joint-build.log"

function Log([string]$Message) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $Message"
    Write-Host $line
    New-Item -ItemType Directory -Force -Path "C:\tmp" | Out-Null
    Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
}

if (-not (Test-Path $VersionFile)) {
    throw "Missing OPENCODE_VERSION at repo root"
}
$OpenCodeVersion = (Get-Content $VersionFile -Raw).Trim()
Log "OpenCode pin: $OpenCodeVersion"
Log "Repo: $Root"
New-Item -ItemType Directory -Force -Path $Staging | Out-Null
Set-Content -Path (Join-Path $Staging "OPENCODE_VERSION") -Value $OpenCodeVersion

if (-not $SkipOpenCode -and -not $SkipFetch) {
    Log "START: build OpenCode Desktop from vendored opencode/ (DEV channel)"
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build-opencode-desktop.ps1")
    if ($LASTEXITCODE -ne 0) { throw "build-opencode-desktop failed" }
    $exe = Join-Path $Root "src-tauri\resources\opencode\opencode-desktop-win-x64.exe"
    if (-not (Test-Path $exe)) { throw "Missing $exe after build" }
    Copy-Item $exe (Join-Path $Staging "opencode-desktop-win-x64.exe") -Force
    Log "OK: OpenCode DEV installer staged"
}

if (-not $SkipSkills) {
    Log "START: Skills Tauri build (NSIS will offer OpenCode install if bundled)"
    $tauriBuild = Join-Path $PSScriptRoot "tauri-build.ps1"
    $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $tauriBuild)
    if ($SkipElevate) { $args += "-SkipElevate" }
    & powershell @args
    if ($LASTEXITCODE -ne 0) {
        throw "Skills build failed (exit $LASTEXITCODE)"
    }
    Log "OK: Skills build"
}

Log "DONE: joint-build"
Write-Host ""
Write-Host "Installer: release\*-setup.exe (NSIS post-install asks to install OpenCode Dev / 需求工作台)" -ForegroundColor Green
Write-Host "Or Settings → OpenCode 编辑器 → 安装捆绑的 OpenCode" -ForegroundColor Cyan
