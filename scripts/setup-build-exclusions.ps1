# One-time Defender exclusions (auto UAC elevate)
#   powershell -ExecutionPolicy Bypass -File scripts\setup-build-exclusions.ps1
$ErrorActionPreference = "Stop"

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Write-Host "Requesting Administrator (UAC)..."
    $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $MyInvocation.MyCommand.Path)
    Start-Process -FilePath "powershell.exe" -ArgumentList $argList -Verb RunAs -WorkingDirectory (Get-Location).Path
    exit 0
}

$paths = @(
    "C:\tmp\skills-manager-target",
    "C:\build\skills-manager-release",
    "G:\vsworkplate01\skills-manager"
)

foreach ($p in $paths) {
    New-Item -ItemType Directory -Force -Path $p -ErrorAction SilentlyContinue | Out-Null
    Add-MpPreference -ExclusionPath $p
    Write-Host "Excluded: $p"
}

foreach ($proc in @("rustc.exe", "cargo.exe", "link.exe", "cl.exe", "vctip.exe")) {
    Add-MpPreference -ExclusionProcess $proc
    Write-Host "Excluded process: $proc"
}

Write-Host ""
Write-Host "Next: close Cursor, then run scripts\tauri-build.ps1 as Administrator"
