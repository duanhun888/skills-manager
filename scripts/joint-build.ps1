# Joint build: OpenCode Desktop (pinned) + Skills Tauri
# Feasibility / CI entrypoint — OpenCode packaging steps may need Bun toolchain.
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\joint-build.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\joint-build.ps1 -SkipOpenCode
#   powershell -ExecutionPolicy Bypass -File .\scripts\joint-build.ps1 -SkipSkills
param(
    [switch]$SkipOpenCode,
    [switch]$SkipSkills,
    [switch]$SkipElevate
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$VersionFile = Join-Path $Root "OPENCODE_VERSION"
$OpenCodeDir = Join-Path $Root "opencode"
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

if (-not $SkipOpenCode) {
    if (-not (Test-Path $OpenCodeDir)) {
        throw "Missing vendored opencode/ directory"
    }
    $bun = Get-Command bun -ErrorAction SilentlyContinue
    if (-not $bun) {
        Log "WARN: bun not found — skip OpenCode binary build; source is still in-repo for joint packaging later"
        Set-Content -Path (Join-Path $Staging "opencode-build-skipped.txt") -Value "bun not installed"
    } else {
        Log "START: OpenCode bun install"
        Push-Location $OpenCodeDir
        try {
            & bun install
            if ($LASTEXITCODE -ne 0) { throw "bun install failed" }
            Log "START: OpenCode desktop build (best-effort)"
            # Upstream desktop package scripts vary by version; record outcome for CI.
            Push-Location (Join-Path $OpenCodeDir "packages\desktop")
            try {
                if (Test-Path "package.json") {
                    & bun run build
                    if ($LASTEXITCODE -ne 0) {
                        Log "WARN: OpenCode desktop build returned $LASTEXITCODE"
                    } else {
                        $outDir = Join-Path $Staging "opencode-desktop"
                        New-Item -ItemType Directory -Force -Path $outDir | Out-Null
                        if (Test-Path "dist") {
                            Copy-Item -Recurse -Force "dist\*" $outDir
                        }
                        Log "OK: OpenCode desktop artifacts staged"
                    }
                }
            } finally {
                Pop-Location
            }
        } finally {
            Pop-Location
        }
    }
}

if (-not $SkipSkills) {
    Log "START: Skills Tauri build via tauri-build.ps1"
    $tauriBuild = Join-Path $PSScriptRoot "tauri-build.ps1"
    $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $tauriBuild)
    if ($SkipElevate) { $args += "-SkipElevate" }
    & powershell @args
    if ($LASTEXITCODE -ne 0) {
        throw "Skills build failed (exit $LASTEXITCODE)"
    }
    Log "OK: Skills build"
}

Log "DONE: joint-build. Staging: $Staging"
Write-Host ""
Write-Host "Next: wire NSIS component to include staging\opencode-desktop (see plan)."
