# 更新日志

## [1.2.2] - 2026-07-28

### 发布概览
- 重新发布 1.2.1 功能（修复 GitHub Release 同名资源冲突导致的 Linux/macOS 上传失败）

### 用户可见更新
- 与 1.2.1 相同：Windows 可捆绑 OpenCode 编辑器

### 开发者与治理更新
- 使用新 tag 避开 `ReleaseAsset already_exists` 竞态/残留资源

## [1.2.1] - 2026-07-28

### 发布概览
- Windows 安装包可捆绑 OpenCode 编辑器：安装结束可勾选安装，设置页可安装/打开

### 用户可见更新
- NSIS 安装完成后询问是否安装捆绑的 OpenCode Desktop
- 设置 → OpenCode 编辑器：查看捆绑状态、安装、打开

### 开发者与治理更新
- `scripts/fetch-opencode-desktop.ps1` + `joint-build.ps1`；CI Windows 构建前拉取钉扎安装包
- Tauri resources + NSIS hooks；`opencode_bundle` 命令

## [1.2.0] - 2026-07-28

### 发布概览
- 将 OpenCode 1.18.4 源码纳入同一仓库，为联合构建 / 合体安装做准备

### 用户可见更新
- 暂无单独安装包变化（仍为 Skills 本体构建；合体包后续迭代）

### 开发者与治理更新
- vendor `opencode/`（钉扎见 `OPENCODE_VERSION`）
- 增加 `scripts/joint-build.ps1` 与第三方声明

## [1.1.1] - 2026-07-23

### 发布概览
- 修复 Windows 安装包（setup.exe）未显示应用图标的问题

### 用户可见更新
- Windows NSIS 安装包使用项目品牌图标（鸟标）

### 开发者与治理更新
- `tauri.conf.json` 增加 `bundle.windows.nsis.installerIcon`

## [1.1.0] - 2026-07-22

### 发布概览
- 

### 用户可见更新
- 

### 开发者与治理更新
- 
## [1.0.0] - 2026-07-14

- 芯宏 Skills 仓库首次公开发布
- 桌面客户端：技能库、Skills 广场、技能组合、全局/项目工作区、多 Agent 同步
- 可选组织中央服务：用户认证、RBAC、OBS 内容存储、审计记录
- 内置代码审查 API（`POST /api/v1/review`）
- GitLab CI 样板（`examples/gitlab/`）
