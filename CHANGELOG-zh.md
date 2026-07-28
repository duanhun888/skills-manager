# 更新日志

## [1.3.2] - 2026-07-28

### ��������
- �޸� Windows CI���ύ packages/opencode/script/build-node.ts������ .gitignore ���Ե��¸ɾ� checkout ȱʧ����

### ����������������
- ȷ�� OpenCode Desktop �� prebuild �� GitHub Actions �ĸɾ����������С�

## [1.3.1] - 2026-07-28

### 发布概览
- 修复 Windows CI：`build-opencode-desktop.ps1` 改为�?ASCII，避�?PowerShell 5.1 解析失败

### 开发者与治理更新
- PS1 去掉�?ASCII（GitHub `windows-latest` �?BOM UTF-8 会把引号读坏�?

## [1.3.0] - 2026-07-28

### 发布概览
- Windows 捆绑编辑器改�?*本仓库定�?OpenCode Dev（需求工作台�?*，不再下�?anomalyco 官方安装�?

### 用户可见更新
- 安装结束询问「是否安�?OpenCode Dev（需求工作台）�?
- 设置页文案标明为定制 DEV，与本地需求工作台一�?

### 开发者与治理更新
- 新增 `scripts/build-opencode-desktop.ps1`：从 `opencode/` �?`OPENCODE_CHANNEL=dev` 构建�?stage
- CI Windows：安�?Bun 后源码构建，替代 GitHub Releases fetch
- `VENDOR.md` / NSIS / 启动探测路径对齐 OpenCode Dev

## [1.2.2] - 2026-07-28

### 发布概览
- 重新发布 1.2.1 功能（修�?GitHub Release 同名资源冲突导致�?Linux/macOS 上传失败�?

### 用户可见更新
- �?1.2.1 相同：Windows 可捆�?OpenCode 编辑�?

### 开发者与治理更新
- 使用�?tag 避开 `ReleaseAsset already_exists` 竞�?残留资源

## [1.2.1] - 2026-07-28

### 发布概览
- Windows 安装包可捆绑 OpenCode 编辑器：安装结束可勾选安装，设置页可安装/打开

### 用户可见更新
- NSIS 安装完成后询问是否安装捆绑的 OpenCode Desktop
- 设置 �?OpenCode 编辑器：查看捆绑状态、安装、打开

### 开发者与治理更新
- `scripts/fetch-opencode-desktop.ps1` + `joint-build.ps1`；CI Windows 构建前拉取钉扎安装包
- Tauri resources + NSIS hooks；`opencode_bundle` 命令

## [1.2.0] - 2026-07-28

### 发布概览
- �?OpenCode 1.18.4 源码纳入同一仓库，为联合构建 / 合体安装做准�?

### 用户可见更新
- 暂无单独安装包变化（仍为 Skills 本体构建；合体包后续迭代�?

### 开发者与治理更新
- vendor `opencode/`（钉扎见 `OPENCODE_VERSION`�?
- 增加 `scripts/joint-build.ps1` 与第三方声明

## [1.1.1] - 2026-07-23

### 发布概览
- 修复 Windows 安装包（setup.exe）未显示应用图标的问�?

### 用户可见更新
- Windows NSIS 安装包使用项目品牌图标（鸟标�?

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
- 可选组织中央服务：用户认证、RBAC、OBS 内容存储、审计记�?
- 内置代码审查 API（`POST /api/v1/review`�?
- GitLab CI 样板（`examples/gitlab/`�?
