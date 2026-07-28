# Changelog

## [1.3.2] - 2026-07-28

### Release Overview
- Fix Windows CI: include opencode/packages/opencode/script/build-node.ts for desktop prebuild (was ignored by upstream .gitignore)

### Developer & Governance
- Ensure CI can extract release notes via sed/awk (no encoding corruption).

## [1.3.1] - 2026-07-28

### Release Overview
- Fix Windows CI: make scripts/build-opencode-desktop.ps1 ASCII-only for PowerShell 5.1

## [1.3.0] - 2026-07-28

### Release Overview
- Windows bundled editor is this repo's customized OpenCode Dev (requirements workbench)