# Package existing release exe for colleagues (NO recompile, Cursor can stay open)
#   powershell -ExecutionPolicy Bypass -File .\scripts\package-portable.ps1
#
# Requires: C:\tmp\skills-manager-target\release\skills-manager.exe already built

$ErrorActionPreference = "Stop"
$sourceRepo = Split-Path $PSScriptRoot -Parent
$targetDir = "C:\tmp\skills-manager-target"
$exePath = Join-Path $targetDir "release\skills-manager.exe"

if (-not (Test-Path $exePath)) {
    $exePath = Join-Path $targetDir "x86_64-pc-windows-msvc\release\skills-manager.exe"
}
if (-not (Test-Path $exePath)) {
    Write-Host "ERROR: skills-manager.exe not found under $targetDir" -ForegroundColor Red
    Write-Host "Build it first, or copy the exe path manually."
    exit 1
}

$outDir = Join-Path $sourceRepo "release"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$outExe = Join-Path $outDir "skills-manager.exe"
Copy-Item $exePath $outDir -Force

# ASCII filename; GBK body for Windows Notepad on zh-CN (UTF-8 often shows as mojibake).
$readmeSrc = Join-Path $PSScriptRoot "portable-README.txt"
if (-not (Test-Path $readmeSrc)) {
    Write-Host "ERROR: missing $readmeSrc" -ForegroundColor Red
    exit 1
}
$readmePath = Join-Path $outDir "README.txt"
$readmeText = [System.IO.File]::ReadAllText($readmeSrc, (New-Object System.Text.UTF8Encoding $false))
$gbk = [System.Text.Encoding]::GetEncoding(936)
[System.IO.File]::WriteAllText($readmePath, $readmeText, $gbk)

# Remove legacy Chinese-named readme if present
$legacyReadme = Join-Path $outDir "使用说明.txt"
if (Test-Path $legacyReadme) { Remove-Item $legacyReadme -Force }

$zipPath = Join-Path $outDir "skills-manager-portable.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $outExe, $readmePath -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "Done. Send this zip to colleagues:" -ForegroundColor Green
Write-Host "  $zipPath" -ForegroundColor Green
Write-Host "  (README.txt + skills-manager.exe, ASCII names — no unzip garble)" -ForegroundColor Cyan
