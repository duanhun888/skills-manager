# Build customized OpenCode Desktop (DEV / requirements workbench) from vendored opencode/
# and stage the Windows installer into src-tauri/resources/opencode/.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\build-opencode-desktop.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\build-opencode-desktop.ps1 -SkipInstall
#
# Env:
#   OPENCODE_CHANNEL   default: dev
#   OPENCODE_SKIP_BUILD=1  if installer already staged, skip rebuild
#
# IMPORTANT: Keep this file ASCII-only (or UTF-8 with BOM). Windows PowerShell 5.1 on
# GitHub Actions mis-parses UTF-8-without-BOM when non-ASCII bytes appear in strings.
param(
    [switch]$SkipInstall,
    [ValidateSet("win-x64", "win-arm64")]
    [string]$Arch = "win-x64"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$OpenCodeRoot = Join-Path $Root "opencode"
$DesktopDir = Join-Path $OpenCodeRoot "packages\desktop"
$OutDir = Join-Path $Root "src-tauri\resources\opencode"
$Asset = "opencode-desktop-$Arch.exe"
$Dest = Join-Path $OutDir $Asset
$Meta = Join-Path $OutDir "VERSION.txt"

if (-not (Test-Path $OpenCodeRoot)) {
    throw "Missing vendored OpenCode at $OpenCodeRoot"
}
if (-not (Test-Path $DesktopDir)) {
    throw "Missing desktop package at $DesktopDir"
}

$PinVersion = "unknown"
$VersionFile = Join-Path $Root "OPENCODE_VERSION"
if (Test-Path $VersionFile) {
    $PinVersion = (Get-Content $VersionFile -Raw).Trim()
}
if (-not $env:OPENCODE_CHANNEL) { $env:OPENCODE_CHANNEL = "dev" }
$Channel = $env:OPENCODE_CHANNEL
$Pin = "source/$PinVersion/$Channel/$Arch"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if ($env:OPENCODE_SKIP_BUILD -eq "1" -and (Test-Path $Dest) -and (Test-Path $Meta)) {
    $existing = (Get-Content $Meta -Raw).Trim()
    if ($existing -eq $Pin) {
        $sizeMb = [math]::Round((Get-Item $Dest).Length / 1MB, 1)
        Write-Host "Already staged: $Dest ($sizeMb MB) - OPENCODE_SKIP_BUILD=1"
        exit 0
    }
}

function Assert-Bun {
    $bun = Get-Command bun -ErrorAction SilentlyContinue
    if (-not $bun) {
        throw "bun is required to build OpenCode Desktop. See https://bun.sh"
    }
    $bunVer = (& bun --version).Trim()
    Write-Host "bun: $bunVer"
}

Assert-Bun

$SkillsVersion = "unknown"
$PkgJson = Join-Path $Root "package.json"
if (Test-Path $PkgJson) {
    try {
        $SkillsVersion = (Get-Content $PkgJson -Raw | ConvertFrom-Json).version
    } catch {
        $SkillsVersion = "unknown"
    }
}
if (-not $env:VITE_OPENCODE_DISPLAY_VERSION) {
    $env:VITE_OPENCODE_DISPLAY_VERSION = $SkillsVersion
}
if (-not $env:OPENCODE_DISPLAY_VERSION) {
    $env:OPENCODE_DISPLAY_VERSION = $env:VITE_OPENCODE_DISPLAY_VERSION
}

Write-Host "Building OpenCode Desktop from source"
Write-Host "  root:    $OpenCodeRoot"
Write-Host "  channel: $Channel"
Write-Host "  pin:     $PinVersion"
Write-Host "  arch:    $Arch"
Write-Host "  badge:   V$($env:VITE_OPENCODE_DISPLAY_VERSION)"

Push-Location $OpenCodeRoot
try {
    if (-not $SkipInstall) {
        Write-Host "bun install (opencode workspace)..."
        bun install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            Write-Host "frozen-lockfile failed; retrying bun install..."
            bun install
        }
        if ($LASTEXITCODE -ne 0) { throw "bun install failed" }
    }

    Push-Location $DesktopDir
    try {
        Write-Host "prebuild (icons + node server)..."
        bun ./scripts/prebuild.ts
        if ($LASTEXITCODE -ne 0) { throw "desktop prebuild failed" }

        Write-Host "electron-vite build..."
        $env:NODE_OPTIONS = "--max-old-space-size=4096"
        bun run build
        if ($LASTEXITCODE -ne 0) { throw "desktop build failed" }

        Write-Host "electron-builder --win ($Arch)..."
        # Avoid requiring Azure/Apple signing secrets in Skills CI/local builds.
        $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
        $ebArgs = @("--win", "--publish", "never", "--config", "electron-builder.config.ts")
        if ($Arch -eq "win-arm64") { $ebArgs += "--arm64" } else { $ebArgs += "--x64" }
        & npx --yes electron-builder @ebArgs
        if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

        $built = Get-ChildItem (Join-Path $DesktopDir "dist") -Filter "opencode-desktop-*.exe" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notmatch "uninstall" } |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if (-not $built) {
            throw "No opencode-desktop-*.exe under packages/desktop/dist after package"
        }

        Copy-Item -Force $built.FullName $Dest
        Set-Content -Path $Meta -Value $Pin -NoNewline -Encoding ascii
        Set-Content -Path (Join-Path $OutDir "EXPECTED_VERSION.txt") -Value $PinVersion -NoNewline -Encoding ascii
        $readmeLines = @(
            "Bundled OpenCode Desktop = custom source build (not anomalyco GitHub release)."
            "Source: opencode/ in this repo (requirements workbench / DEV channel)."
            "Pin: $PinVersion"
            "Channel: $Channel"
            "Arch: $Arch"
            "Built by scripts/build-opencode-desktop.ps1 (do not commit the .exe)."
        )
        Set-Content -Path (Join-Path $OutDir "README.txt") -Value $readmeLines -Encoding ascii

        $sizeMb = [math]::Round((Get-Item $Dest).Length / 1MB, 1)
        $builtName = $built.Name
        Write-Host "OK: $Dest ($sizeMb MB) built-as $builtName"
    }
    finally {
        Pop-Location
    }
}
finally {
    Pop-Location
}
