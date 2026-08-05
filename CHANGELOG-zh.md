# Changelog (zh)

## [1.4.13] - 2026-08-05

### 发布概览
- 编码区截图：可配置 OCR / VL 优先级

### 用户可见更新
- Skills 模型策略新增 **编码区 OCR 服务** 与 **识图优先级**（组织默认）
- 账号可在 **设置 → 我的编码区识图优先级** 单独覆盖（默认=跟随组织）；需强制先用模型的账号可选「先 VL」
- 可选：OCR→VL、VL→OCR、仅 OCR、仅 VL
- Toast 区分 OCR / VL；跟进文案标注识图来源

### 开发者与治理更新
- 策略字段：`coding_ocr_url`、`coding_image_priority`；账号覆盖写入 `skills-model-user-policy.json`（本机按 user id 存储）
- 管理端保存仍会写入本机 OpenCode 策略

## [1.4.12] - 2026-08-04

### 发布概览
- 需求分析展示真实配置校验细节；单个坏的 agent/command 文件不再拖垮整个工作台

### 用户可见更新
- 需求区识图分析遇到 `ConfigInvalidError` 时，会显示无效文件路径与字段问题（例如 `instructions` 必须是字符串数组）
- 非法自定义 agent/command 文档会跳过并告警，不再导致每次分析都失败

### 开发者与治理更新
- `ConfigAgent.load` / `ConfigCommand.load` 改为软失败；需求对话使用 `formatServerError`

## [1.4.11] - 2026-08-03

### 发布概览
- Skills 应用内更新后自动结束旧 OpenCode 并刷新组织策略，无需手动完全退出再打开工作台

### 用户可见更新
- 安装更新前关闭正在运行的 OpenCode；Skills 重启后重新同步模型策略，并提示重新打开工作台
- 从 Skills 打开 OpenCode 时，若 Skills 版本相对上次打开已变，会先重启再打开
- 编码区附图需要识图但未配置「编码区识图模型」时给出 toast 提示

### 开发者与治理更新
- 新增 `terminate_opencode_editors`；`openOpenCodeEditorFresh` 与启动后版本变更钩子

## [1.4.10] - 2026-08-03

### 发布概览
- 编码区识图：纯看图类请求不再强制结合会话上下文

### 用户可见更新
- 「分析图片」或只贴图：仅根据附图识图，不被上文带偏
- 可写「只看图 / 忽略上下文」强制仅看图；「修这个报错」等编码请求仍结合上下文

### 开发者与治理更新
- 增加 `visionDescribeMode`，仅看图 / 结合上下文使用不同系统提示

## [1.4.9] - 2026-08-03

### 发布概览
- 首个支持应用内自动升级的版本（提示 → 确认 → 安装 → 重启），更新源为 GitHub Releases

### 用户可见更新
- 设置 → 关于：**检查更新**；启动后若有新版本会 toast 提示（需确认后才安装）
- **升级说明：** 1.4.7 / 1.4.8 需先手动安装 1.4.9；之后版本可在应用内升级

### 开发者与治理更新
- 开启 Tauri updater 产物与 `latest.json`；CI 使用 `TAURI_SIGNING_PRIVATE_KEY` 签名
- 更新地址：`https://github.com/duanhun888/skills-manager/releases/latest/download/latest.json`（Release 资源需可匿名下载）

## [1.4.8] - 2026-07-31

### 发布概览
- 编码区附图自动识图：先用组织配置的视觉模型识别截图，再切回所选编码模型继续回答

### 用户可见更新
- 消息带图且当前编码模型不支持看图时，自动先用视觉模型（结合会话上下文）识图，再用编码模型作答，无需手动切换
- 排队发送的带图消息同样走识图流程
- 管理端新增「模型策略 → 编码区识图模型」（如 `alibaba-cn/qwen3-vl-plus`）；留空则保持原行为

### 开发者与治理更新
- 中央服务策略 JSON 新增可选 `coding_vision_model`（读写/公共配置下发）；无需 migration，旧客户端不受影响
- 识图轮走 `requirements` 智能体绕过受限模式编码校验；编排集中在 `sendFollowupDraft`

## [1.4.7] - 2026-07-30

### 发布概览
- 「送入编码」送入已关联并打开的项目，不再每次强制新建会话

### 用户可见更新
- 优先复用该项目已打开标签，否则打开该项目最近会话；仅在无会话时新建草稿

### 开发者与治理更新
- 增加 handoff 辅助逻辑：按关联目录匹配打开标签 / 最近根会话
## [1.4.6] - 2026-07-30

### 发布概览
- 修复编码工作台界面定时闪烁

### 用户可见更新
- 模型策略 / 组织 Provider 轮询在数据未变时不再每 15 秒重绘界面

### 开发者与治理更新
- 静默 60 秒刷新；指纹变化才更新状态；页面隐藏时跳过轮询
## [1.4.5] - 2026-07-30

### 发布概览
- 共享密钥按模型白名单开放；共享与个人可切换选择
- 修复需求分析在 OpenCode 重启后 Session not found

### 用户可见更新
- 管理端「模型密钥」每个 Provider 必填允许模型；仅白名单以「共享」展现
- 同一 Provider 同时有组织/个人密钥时，列表出现「共享」「个人」两条可切换
- 需求会话失效时自动新建分析会话

### 开发者与治理更新
- 组织标记写入 `models`；OpenCode 过滤共享 Provider 模型目录
- 冲突时组织钥挂到 `{id}.skills-shared`，与个人并存

## [1.4.4] - 2026-07-30

### 发布概览
- 修复 CI：同步组织模型密钥时的 TypeScript 类型错误
- OpenCode 页「打开」改为大号主按钮，更易发现

### 用户可见更新
- OpenCode 工作区：空状态/列表上方醒目打开按钮（不再放在顶栏）

### 开发者与治理更新
- 将接口返回的可选 `type`/`key` 规范化为必填后再调用 Tauri

## [1.4.3] - 2026-07-30

### 发布概览
- 组织级 OpenCode 模型密钥（ops 配置，模型旁「共享」）；个人用自定义提供商设显示名称，与共享共存
- 需求：可关联任意本地文件夹；编辑器顶栏更紧凑以腾出工作区

### 用户可见更新
- 管理后台「模型密钥」：登录/打开 OpenCode 时同步到本机 `skills-org-auth.json`，不覆盖个人 `auth.json`
- 模型列表组织 Provider 显示「共享」；个人通过「自定义提供商」命名，与共享条目同时出现
- 需求新建/编辑：可选当前/最近项目，或浏览任意本地目录

### 开发者与治理更新
- OpenCode Auth 合并组织与个人凭证；`GET /skills/org-providers` 标记共享 Provider
- Tauri `sync_opencode_provider_auth` 写入组织密钥与共享标记文件

## [1.4.2] - 2026-07-30

### 发布概览
- 修复编码工作台模型列表仍显示受限模型：新建会话走了另一套选择器，未套用 Skills 策略

### 用户可见更新
- 「新建会话 / 编码工作台」下拉框会隐藏仅限需求的模型
- 若当前已选中受限模型，自动切到可用模型

### 开发者与治理更新
- `createPromptModelSelection` 接入模型策略
- 模型 ID 归一化兼容 `qwen3.7-plus` / `qwen3-7-plus`

## [1.4.1] - 2026-07-29

### 发布概览
- 修复模型限制未生效：按真实运行时 ID（如 `alibaba-cn/qwen3.7-plus`）匹配，不再依赖后台填的精确字符串
- 修复编码区读不到策略：桌面端开启服务密码时 `/skills/model-policy` 返回 401，UI 静默当成「开放」

### 用户可见更新
- 后台写了 `opencode/...` 或仅模型 ID 时，编码区也能正确隐藏/拒绝
- 下发策略时自动展开 alibaba / alibaba-cn / opencode 别名（兼容旧版 OpenCode 精确匹配）
- 管理页提示改为说明真实 provider/model，勿用界面显示名

### 开发者与治理更新
- 放宽匹配；UI 拉取失败时保留上次策略，避免静默变成「开放」
- `/skills/model-policy` 改为可匿名读取（本机组织策略）；有密码时 UI 仍带 Basic
- 增加 model-policy 匹配单测

## [1.4.0] - 2026-07-29

### 发布概览
- OpenCode 模型策略：后台可配置「开放 / 限制」，限制模式下视觉模型仅需求工作台可用

### 用户可见更新
- 用户与权限新增「模型策略」页（ops）
- 登录或打开 OpenCode 时同步策略到本机
- OpenCode：需求会话走 requirements Agent；限制模式下编码区过滤并拦截名单模型
- 各 Agent / 设置页打开 OpenCode 前自动同步策略

### 开发者与治理更新
- OpenCode 读取 skills-model-policy.json；提供 GET /skills/model-policy
- Skills 写入用户配置与 ProgramData 策略文件
- 捆绑 OpenCode 增加 EXPECTED_VERSION.txt 便于版本核对
- 中央 API（server/，需单独部署）新增 model-policy 接口
## [1.3.3] - 2026-07-28

### Release Overview
- Titlebar badge shows version instead of DEV
- Shortcut name is OpenCode (no Dev)

## [1.3.2] - 2026-07-28

### Release Overview
- Fix Windows CI: include build-node.ts for desktop prebuild

## [1.3.1] - 2026-07-28

### Release Overview
- Fix Windows CI: ASCII-only PowerShell build script

## [1.3.0] - 2026-07-28

### Release Overview
- Bundle customized OpenCode (requirements workbench)
