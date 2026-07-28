# Download pinned OpenCode Desktop Windows installer into Tauri resources.
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\fetch-opencode-desktop.ps1
param(
    [string]$Version = "",
    [ValidateSet("win-x64", "win-arm64")]
    [string]$Arch = "win-x64"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
if (-not $Version) {
    $Version = (Get-Content (Join-Path $Root "OPENCODE_VERSION") -Raw).Trim()
}
$OutDir = Join-Path $Root "src-tauri\resources\opencode"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$Asset = "opencode-desktop-$Arch.exe"
$Url = "https://github.com/anomalyco/opencode/releases/download/v$Version/$Asset"
$Dest = Join-Path $OutDir $Asset
$Meta = Join-Path $OutDir "VERSION.txt"

Write-Host "Fetching OpenCode Desktop $Version ($Arch)"
Write-Host "  $Url"

if ((Test-Path $Dest) -and (Test-Path $Meta)) {
    $existing = (Get-Content $Meta -Raw).Trim()
    if ($existing -eq "$Version/$Arch") {
        $sizeMb = [math]::Round((Get-Item $Dest).Length / 1MB, 1)
        Write-Host "Already present: $Dest ($sizeMb MB) — skip download"
        exit 0
    }
}

$tmp = "$Dest.partial"
try {
    Invoke-WebRequest -Uri $Url -OutFile $tmp -UseBasicParsing
    Move-Item -Force $tmp $Dest
} catch {
    if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
    throw
}

Set-Content -Path $Meta -Value "$Version/$Arch" -NoNewline
Set-Content -Path (Join-Path $OutDir "README.txt") -Value @"
Bundled OpenCode Desktop installer (pinned).
Version: $Version
Arch: $Arch
Source: $Url
Do not commit the .exe — fetched at build time by scripts/fetch-opencode-desktop.ps1
"@

$sizeMb = [math]::Round((Get-Item $Dest).Length / 1MB, 1)
Write-Host "OK: $Dest ($sizeMb MB)"
