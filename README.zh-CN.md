# 芯宏 Skills 仓库

组织统一的 AI Agent Skills 管理平台。

**使用手册：** [`docs/芯宏Skills仓库-使用手册.md`](docs/芯宏Skills仓库-使用手册.md)

## 功能概览

- **统一技能库** — 从 Git、本地目录、`.zip` / `.skill`、Skills 广场安装，统一存放在本机技能库。
- **组织中央仓库** — 登录后上传/下载组织、项目、个人级 Skill，内容存储于华为云 OBS。
- **多 Agent 同步** — 一键同步到 Cursor、Claude Code、Codex 等工具。
- **技能组合** — 一个项目用到多种类型 Skill 时绑成一组，在项目工作区一次性加入。
- **各 Agent / 各项目** — 管理 Agent 全局目录与某个代码仓库里的 Skills。
- **Git 个人备份** — 本机技能库的 Git 版本管理（与组织中央仓库独立）。
- **GitLab 代码审查（可选）** — 按组织 Skill 自动审查 push / MR。

## 快速上手

1. 安装客户端，使用组织账号登录。
2. 从 **Skills 广场** 安装 Skill。
3. 在 **我的技能库** 管理、上传中央、同步 Agent。
4. 在 **各 Agent** 或 **各项目** 使 Skill 生效。

详细步骤见 [使用手册](docs/芯宏Skills仓库-使用手册.md)。

## 中央服务器与 OBS 存储

桌面客户端通过中央 API（`server/`）登记 Skill 元数据，内容 zip 存入华为云 OBS。桶内推荐目录结构：

```
xh-skills/
├── skills/
│   ├── org/{skill_id}/
│   │   ├── content.zip
│   │   └── versions/{hash}.zip
│   ├── project/{project_id}/{skill_id}/
│   │   └── content.zip
│   └── personal/{user_id}/{skill_id}/
│       └── content.zip
└── _system/healthcheck/
```

| 作用范围 | OBS 路径 | 说明 |
|----------|----------|------|
| 组织 | `skills/org/{skill_id}/` | 组织标准库，Skills 广场可读 |
| 项目 | `skills/project/{project_id}/{skill_id}/` | 项目资产，成员共享 |
| 个人 | `skills/personal/{user_id}/{skill_id}/` | 个人草稿/沙箱 |

- 华为云 OBS 需设置 **`OBS_PATH_STYLE=0`**（虚拟主机风格）。
- 内置代码审查：`POST /api/v1/review`（配置 `LLM_API_URL` / `LLM_API_KEY`）。
- GitLab CI 详见 [`examples/gitlab/INSTALL.zh-CN.md`](examples/gitlab/INSTALL.zh-CN.md)。

服务端配置见 `server/.env.example`，启动：

```bash
cd server && cargo run --bin skills-manager-server
```

## 开发构建

### 前置依赖

- Node.js 18+
- Rust 工具链
- [Tauri 依赖](https://v2.tauri.app/start/prerequisites/)

### 命令

```bash
npm install
npm run tauri:dev       # 桌面开发
npm run tauri:build     # 桌面打包
cd server && cargo build --release --bin skills-manager-server   # 中央 API
```

Linux 部署脚本：`server/scripts/build-linux.sh`、`install-linux.sh`。

## 支持的工具

Cursor · Claude Code · Codex · Grok · OpenCode · Amp · Kilo Code · Roo Code · Goose · Gemini CLI · GitHub Copilot · Windsurf · TRAE IDE · Antigravity · Clawdbot · Droid

可在 **设置** 中添加自定义工具。

## 许可

本软件基于 MIT 许可发布。第三方组件声明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
