# Changelog

## [1.4.12] - 2026-08-04

### Release Overview
- Requirements analysis shows real config validation details; one bad agent/command file no longer blocks the whole workbench

### User-facing
- `ConfigInvalidError` on requirements image analysis now surfaces the invalid file path and schema issues (e.g. `instructions` must be a string array)
- Invalid custom agent/command markdown is skipped with a warning instead of failing every analysis

### Developer & Governance
- Soft-fail `ConfigAgent.load` / `ConfigCommand.load`; requirements chat uses `formatServerError`

## [1.4.11] - 2026-08-03

### Release Overview
- After Skills in-app update, stop stale OpenCode and refresh org policy so the workbench works without a manual quit/reopen

### User-facing
- Installing a Skills update closes running OpenCode before restart; after relaunch, policy is re-synced and a toast asks you to reopen the workbench
- Opening OpenCode from Skills restarts it once when the Skills version changed since last open
- Coding chat shows a toast when images need vision but 编码区识图模型 is not configured

### Developer & Governance
- New `terminate_opencode_editors` command; `openOpenCodeEditorFresh` / post-update AppContext hook

## [1.4.10] - 2026-08-03

### Release Overview
- Coding-area screenshot describe can skip chat context when the ask is image-only

### User-facing
- Short asks like 「分析图片」/ bare attachments describe the image only (no forced prior-chat bias)
- Say 「只看图」/「忽略上下文」to force image-only; coding asks like 「修这个报错」still use chat context

### Developer & Governance
- `visionDescribeMode` + separate system prompts for image-only vs task-context passes

## [1.4.9] - 2026-08-03

### Release Overview
- First build with in-app auto-update (prompt → confirm → install → restart) via GitHub Releases

### User-facing
- Settings → About: **Check for Updates**; startup toast when a newer release is available (install only after you confirm)
- **Upgrade note:** 1.4.7 / 1.4.8 must install 1.4.9 manually once; later versions can update in-app

### Developer & Governance
- Enable Tauri updater artifacts + `latest.json`; CI signs with `TAURI_SIGNING_PRIVATE_KEY` secrets
- Endpoint: `https://github.com/duanhun888/skills-manager/releases/latest/download/latest.json` (Release assets must be anonymously downloadable)

## [1.4.8] - 2026-07-31

### Release Overview
- Coding chat auto-describes attached images with an org-configured vision model, then continues with the selected coding model

### User-facing
- When a message has images and the selected coding model cannot see them, the app first runs the org vision model (with chat context) and then answers with your coding model; no manual model switching
- Queued follow-ups with images also go through the vision describe pass
- New admin field 模型策略 → 编码区识图模型 (e.g. `alibaba-cn/qwen3-vl-plus`); leave empty to keep current behavior

### Developer & Governance
- Central server policy JSON gains optional `coding_vision_model` (read/write/public config); no migration, old clients unaffected
- Vision pass uses the `requirements` agent to bypass restricted-mode coding checks; orchestration lives in `sendFollowupDraft`

## [1.4.7] - 2026-07-30

### Release Overview
- Send-to-coding targets the linked open project instead of always creating a new session

### User-facing
- 「送入编码」reuses an open tab for the linked project, or opens that project's latest session; only creates a new draft when none exist

### Developer & Governance
- Add handoff helper to pick open tabs / latest root session for the linked directory
## [1.4.6] - 2026-07-30

### Release Overview
- Fix periodic UI flicker in the coding workbench model picker

### User-facing
- Model policy / org-provider polling no longer re-renders the UI every 15s when data is unchanged

### Developer & Governance
- Quiet 60s refresh; update Solid state only when fingerprint changes; skip polls while tab is hidden
## [1.4.5] - 2026-07-30

### Release Overview
- Shared provider keys are model-scoped (allowlist); Shared vs Personal entries can be switched
- Fix requirements analysis Session not found after OpenCode restart

### User-facing
- Admin 「模型密钥」requires allowed models per provider; only listed models show as 共享
- Same provider with personal + org keys appears as 共享 / 个人 for switching
- Requirements chat recreates analysis session when the stored session is missing

### Developer & Governance
- Org marker stores `models` map; OpenCode filters shared provider catalogs to allowlist
- Auth exposes colliding org keys as `{id}.skills-shared` so both sources coexist

## [1.4.4] - 2026-07-30

### Release Overview
- Fix CI TypeScript error when syncing org provider credentials
- Make Open OpenCode a large primary action on the OpenCode agent page

### User-facing
- OpenCode workspace: prominent open button in empty state / above skill list (removed from header)

### Developer & Governance
- Normalize optional API `type`/`key` into required `OpenCodeProviderAuthEntry` before Tauri invoke

## [1.4.3] - 2026-07-30

### Release Overview
- Org-wide OpenCode provider API keys (ops) with Shared badge; personal custom providers coexist by display name
- Requirements: associate any local folder; denser editor header for more workspace

### User-facing
- Admin 「模型密钥」: ops configure provider keys; sync on login / Open OpenCode into `skills-org-auth.json` (does not overwrite personal `auth.json`)
- Model picker shows **共享** for org providers; personal setups use Custom provider + display name and appear alongside
- Requirements create/editor: pick open/recent project or Browse any local folder

### Developer & Governance
- OpenCode Auth merges org + personal credentials; `GET /skills/org-providers` marks shared providers
- Tauri `sync_opencode_provider_auth` writes org auth + provider marker files

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
