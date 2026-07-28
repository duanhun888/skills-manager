# Changelog

## [1.3.2] - 2026-07-28

### Release Overview
- Fix Windows CI: commit packages/opencode/script/build-node.ts because it is ignored by upstream .gitignore (fresh checkout missing it).

### Developer & Governance
- Ensure OpenCode Desktop prebuild can run in a clean GitHub Actions environment.

## [1.3.1] - 2026-07-28

### Release Overview
- Fix Windows CI: `build-opencode-desktop.ps1` ASCII-only so PowerShell 5.1 can parse it

### Developer & Governance
- Remove non-ASCII from PS1 scripts (UTF-8-without-BOM broke string parsing on `windows-latest`)

## [1.3.0] - 2026-07-28

### Release Overview
- Windows bundled editor is now **this repo’s customized OpenCode Dev** (requirements workbench), not the anomalyco GitHub release

### User-facing
- NSIS asks to install OpenCode Dev (requirements workbench)
- Settings copy clarifies the custom DEV build

### Developer & Governance
- `scripts/build-opencode-desktop.ps1` builds from vendored `opencode/` with `OPENCODE_CHANNEL=dev`
- CI Windows: Bun + source build instead of fetching official releases
- VENDOR.md / NSIS / desktop launch paths aligned with OpenCode Dev

## [1.2.2] - 2026-07-28

### Release Overview
- Re-release of 1.2.1 features (fix GitHub Release asset name conflicts that failed Linux/macOS uploads)

### User-facing
- Same as 1.2.1: Windows can bundle OpenCode Desktop

### Developer & Governance
- New tag avoids leftover `ReleaseAsset already_exists` conflicts

## [1.2.1] - 2026-07-28

### Release Overview
- Windows installer can bundle OpenCode Desktop: optional post-install and Settings install/open

### User-facing
- NSIS asks whether to install bundled OpenCode after Skills setup
- Settings �?OpenCode editor: bundle status, install, open

### Developer & Governance
- `fetch-opencode-desktop.ps1` + `joint-build.ps1`; CI fetches pinned installer on Windows
- Tauri resources + NSIS hooks; `opencode_bundle` commands

## [1.2.0] - 2026-07-28

### Release Overview
- Vendor OpenCode 1.18.4 source in-repo for joint build / bundled installer work

### User-facing
- No installer change yet (Skills-only build; combined package comes later)

### Developer & Governance
- Add vendored `opencode/` (pin in `OPENCODE_VERSION`)
- Add `scripts/joint-build.ps1` and third-party notice

## [1.1.1] - 2026-07-23

### Release Overview
- Fix Windows setup.exe missing the app brand icon

### User-facing
- NSIS installer now uses the project brand icon

### Developer & Governance
- Set `bundle.windows.nsis.installerIcon` in `tauri.conf.json`

## [1.1.0] - 2026-07-22

### Release Overview
- 

### User-facing
- 

### Developer & Governance
- 
## [1.0.0] - 2026-07-14

- Initial public release of 芯宏 Skills 仓库
- Desktop client: skill library, Skills market, presets, global/project workspaces, multi-agent sync
- Optional org central server: auth, RBAC, OBS storage, audit logs
- Built-in code review API (`POST /api/v1/review`)
- GitLab CI samples (`examples/gitlab/`)
