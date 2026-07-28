# Compatibility wrapper: bundle uses source build of vendored opencode/ (芯宏定制 DEV),
# not the official anomalyco GitHub release installer.
#
# Prefer: scripts/build-opencode-desktop.ps1
param(
    [string]$Version = "",
    [ValidateSet("win-x64", "win-arm64")]
    [string]$Arch = "win-x64",
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
Write-Host "NOTE: fetch-opencode-desktop.ps1 now builds from opencode/ source (DEV), not GitHub releases."
if ($Version) {
    Write-Host "Ignoring -Version '$Version' (pin is OPENCODE_VERSION + vendored tree)."
}

$args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "build-opencode-desktop.ps1"), "-Arch", $Arch)
if ($SkipInstall) { $args += "-SkipInstall" }
& powershell @args
exit $LASTEXITCODE
