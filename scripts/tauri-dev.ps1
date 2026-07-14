# Load VS 2026 environment, then start Tauri dev.
# Run OUTSIDE Cursor: right-click -> Run with PowerShell, or in external terminal.
$ErrorActionPreference = "Stop"

$vcvars = "G:\Program Files\Microsoft Visual Studio\18\Professional\VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path $vcvars)) {
    Write-Error "VS 2026 vcvars not found: $vcvars"
}

Get-Process cargo, rustc, link -ErrorAction SilentlyContinue | Stop-Process -Force

$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
$repo = Split-Path $PSScriptRoot -Parent

cmd /c "`"$vcvars`" && cd /d `"$repo`" && pnpm tauri dev"
