# Changelog

## [1.4.25] - 2026-08-18

### Release Overview
- Isolate local config/data dirs from open-source OpenCode so stale personal model keys cannot leak in

### User-facing
- Config moves to `%USERPROFILE%\.config\xh-skills`
- Data moves to `%USERPROFILE%\.local\share\xh-skills`
- Managed config moves to `C:\ProgramData\xh-skills`
- After upgrade, sign in once so org provider keys are re-synced into the new dirs

### Developer & Governance
- OpenCode `Global.Path` / managed dirs and Skills `opencode_bundle` sync paths all use `xh-skills`
- No longer reads/writes the stock `...\opencode\` directories

## [1.4.24] - 2026-08-13

### Release Overview
- Fix 1.4.23 Windows/macOS/Linux builds: unused `codingOcrUrl` failed `tsc -b`

### User-facing
- No behavior change; same pinned central API and OCR URLs as 1.4.23

### Developer & Governance
- Drop unread OCR state from the admin model-policy page

## [1.4.23] - 2026-08-10

### Release Overview
- Pin central API + OCR URLs to stop config drift; personal text models with images fall back to OCR when VL fails

### User-facing
- Central API fixed to `http://139.159.158.220:8088` (Settings URL editor hidden)
- OCR fixed to `http://192.168.1.230` (admin read-only; sync/coding always use it)
- Personal coding models with attachments fall back to OCR when org vision describe throws
- Vision retries provider aliases; org coding vision model stays available even if missing from allowlist

### Developer & Governance
- `SERVER_API_URL_FIXED` + `FIXED_CODING_OCR_URL`
- `resolveImageDescription` catches VL exceptions before OCR fallback
- `isModelAllowedForSharedProvider` always allows `coding_vision_model`

## [1.4.22] - 2026-08-10

### Release Overview
- Org credentials win over stale personal leftovers: central sync owns the real provider id so old OpenCode residue cannot block Skills Manager

### User-facing
- After login/sync, org-configured providers use central keys; colliding personal keys are demoted or stripped from `auth.json` (backup `auth.json.bak-skills`)
- Writing model defs into `opencode.json` no longer relabels an API-key-connected provider as "config"
- If analysis still fails on ids like `Qwen3.7-plus`, pick the allowlisted real id (e.g. `alibaba-cn/qwen3.7-plus`)

### Developer & Governance
- Auth merge is org-wins (canonical id); personal collisions use `.skills-personal`
- `sync_opencode_provider_auth` strips conflicting personal `auth.json` entries on sync
- Config filenames stay the same (`skills-org-auth.json` / `opencode.json` / `auth.json`) — renaming is not required

## [1.4.21] - 2026-08-10

### Release Overview
- Org model keys now register missing models (e.g. Zhipu GLM-4.6V-Flash) into local/managed OpenCode config on sync

### User-facing
- After ops saves Provider keys + allowlisted models, clients get them in `opencode.json` automatically
- Vision-like model ids (e.g. `glm-4.6v-flash`) are registered with image attachment capability
- Admin credentials copy mentions Zhipu / `glm-4.6v-flash` setup

### Developer & Governance
- `sync_opencode_provider_auth` merges org models into user and ProgramData `opencode.json` without wiping other settings
- Unit tests cover display names, vision heuristic, and config merge

## [1.4.20] - 2026-08-07

### Release Overview
- Ops-friendly coding layout: middle change preview can stay closed (directory + chat only)

### User-facing
- Settings → show change preview by default (on for developers); turn off for directory + chat only
- Closing the middle preview no longer reopens after send / agent file edits
- Click a changed file or the titlebar toggle to open the preview again

### Developer & Governance
- `settings.visibility.reviewPanel` gates the review column like the file tree
- Turn-finish auto-focus respects `reviewPanel.opened`; explicit file/change clicks still open

## [1.4.19] - 2026-08-07

### Release Overview
- Home session history: archive/delete from the list, and fix stale “Session not found” deletes

### User-facing
- Hover a session on Home to archive or open ⋯ → Delete (with confirm)
- Deleting a ghost/stale session clears it from the list instead of failing with “Session not found”

### Developer & Governance
- Home delete uses the session directory client and updates the home session index
- Missing-session API errors are treated as successful local cleanup

## [1.4.18] - 2026-08-06

### Release Overview
- Coding review diffs: denser Pierre styling plus Monaco DiffEditor for a VS Code-like read-only change preview

### User-facing
- Review / file-tab change previews use Monaco DiffEditor (split or unified) with compact 12px / 18px lines
- Split view labels panes as before/after (full previous vs updated file) so red/green means aligned add/remove, not “deletes-only vs adds-only”
- Timeline and media diffs stay on Pierre; pure text tabs without a diff are unchanged
- Remaining Pierre diffs also use tighter line height and word-level highlighting

### Developer & Governance
- Add `monaco-editor` to session-ui with lazy load + Vite workers
- `MonacoDiffPreview` wired into `SessionReviewFilePreviewV2` and `SessionFileViewV2` diff mode

## [1.4.17] - 2026-08-06

### Release Overview
- Coding workbench: default file tree, open current file in external editor, and Cursor-like turn diffs without requiring project git

### User-facing
- File tree is shown by default in coding sessions; preview opens beside chat
- Open the active preview file in VS Code / Cursor / Zed (with line jump when a range is selected)
- After the agent edits files, change count and green/red diffs appear even when the folder is not a git repo
- OCR usefulness treats short CJK logos more fairly; Trae CN project skills use `.trae/skills`

### Developer & Governance
- Shadow-git snapshots no longer require `project.vcs === "git"`; summarize falls back to tool `filediff` / apply_patch files
- Client aggregates live tool diffs for the review panel; desktop `openPath` supports `path:line` via `-g`
- One-shot layout/settings migration opens file tree + review panel for existing installs

## [1.4.16] - 2026-08-05

### Release Overview
- Fix coding OCR: parse nested PaddleX `rec_texts` so successful OCR is not treated as empty

### User-facing
- When the local OCR service returns text, Skills/OpenCode no longer falsely falls back to VL with “OCR unavailable”
- Nested shapes such as `result.ocrResults[].prunedResult.rec_texts` are recognized

### Developer & Governance
- `coding-ocr`: recursively collect `rec_texts` / `rec_scores`; add nested-payload unit test

## [1.4.15] - 2026-08-05

### Release Overview
- Keep admin OCR URL display after save when central config omits or returns a stale value

### User-facing
- Model policy OCR address no longer snaps back to the old server value after Save
- Load prefers last locally saved OCR URL / image priority

### Developer & Governance
- AdminModelPolicy: cache-first OCR fields; do not reload form from server after save

## [1.4.14] - 2026-08-05

### Release Overview
- Keep coding OCR URL when central server does not persist it yet

### User-facing
- Saving Model policy with an OCR address no longer gets wiped to empty when Skills later syncs org config from an older central server
- Admin save caches OCR URL / image priority locally for OpenCode

### Developer & Governance
- `syncOpenCodeModelPolicyFromServer` merges SkillStore cache when server omits `coding_ocr_url` / `coding_image_priority`

## [1.4.13] - 2026-08-05

### Release Overview
- Coding-area screenshots: configurable OCR / VL priority

### User-facing
- Skills model policy adds **编码区 OCR 服务** and **识图优先级** (org default)
- Accounts can override priority under **Settings → My coding image priority** (default = follow org); e.g. VL-first for accounts that must use the vision model
- Priority options: OCR→VL, VL→OCR, OCR only, VL only
- Toasts distinguish OCR vs VL; follow-up text marks `[截图识别]` source

### Developer & Governance
- Policy fields: `coding_ocr_url`, `coding_image_priority`; per-user overlay file `skills-model-user-policy.json` (SkillStore keyed by user id)
- Admin save writes local OpenCode policy even if central server ignores new fields

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
