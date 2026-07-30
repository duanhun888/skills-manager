# Changelog

## [1.4.2] - 2026-07-30

### Release Overview
- Fix coding workbench model picker ignoring Skills policy (new-session used a separate selection path)

### User-facing
- Restricted models are hidden in 新建会话 / 编码工作台 picker, not only in other Local.model paths
- Auto-switch away from a blocked model if it was previously selected

### Developer & Governance
- `createPromptModelSelection.visible` applies `useSkillsModelPolicy`
- Model token normalize treats `.` like `-` (`qwen3.7-plus` ↔ `qwen3-7-plus`)

## [1.4.1] - 2026-07-29

### Release Overview
- Fix OpenCode model restriction: match real runtime IDs (e.g. `alibaba-cn/qwen3.7-plus`), not only exact admin strings
- Fix coding UI ignoring policy: `/skills/model-policy` was 401 when desktop server password is set

### User-facing
- Restricted models hide/reject even when admin listed `opencode/...` or bare model id
- Policy sync expands `alibaba` / `alibaba-cn` / `opencode` aliases onto disk for older OpenCode builds
- Admin hint clarifies real provider/model IDs vs UI display names

### Developer & Governance
- Looser `entryMatches` (bare id, model token, provider aliases); UI keeps last good policy instead of failing open
- GET `/skills/model-policy` is public (local org policy file); UI also sends Basic auth when configured
- Unit tests for model-policy matching

## [1.4.0] - 2026-07-29

### Release Overview
- OpenCode model policy: backend toggle open vs restricted (vision models requirements-only when restricted)

### User-facing
- Admin 「Model policy」 tab for ops
- Sync policy to disk on Skills login / Open OpenCode
- OpenCode: requirements agent; coding UI + prompt guard when restricted
- Open OpenCode from Agents/Settings syncs policy first

### Developer & Governance
- OpenCode reads skills-model-policy.json; GET /skills/model-policy
- Skills writes user + ProgramData policy files
- Bundled OpenCode EXPECTED_VERSION.txt for version checks
- Central API (server/, deploy separately) adds model-policy endpoints
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
