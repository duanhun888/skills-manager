# Changelog (zh)

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
