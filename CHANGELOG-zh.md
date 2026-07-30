# Changelog (zh)

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
