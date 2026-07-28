# Changelog

## [1.3.3] - 2026-07-28

### Release Overview
- Titlebar badge shows version (e.g. V1.3.3) instead of DEV
- Desktop/Start Menu shortcut product name is OpenCode (no Dev suffix)

### Developer & Governance
- Inject Skills package version into OpenCode desktop build as display version
- Launch path detection prefers Programs\OpenCode\OpenCode.exe

## [1.3.2] - 2026-07-28

### Release Overview
- Fix Windows CI: include opencode/packages/opencode/script/build-node.ts for desktop prebuild

### Developer & Governance
- Ensure CI can extract release notes via sed/awk (no encoding corruption)

## [1.3.1] - 2026-07-28

### Release Overview
- Fix Windows CI: make scripts/build-opencode-desktop.ps1 ASCII-only for PowerShell 5.1

## [1.3.0] - 2026-07-28

### Release Overview
- Windows bundled editor is this repo's customized OpenCode (requirements workbench)
