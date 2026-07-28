# 芯宏 Skills 仓库

组织统一的 AI Agent Skills 管理平台：桌面客户端 + 中央服务 + 可选 GitLab 代码审查门禁。

**使用手册：** [`docs/芯宏Skills仓库-使用手册.md`](docs/芯宏Skills仓库-使用手册.md)

## 组成

| 组件 | 说明 |
|------|------|
| 桌面客户端 | 安装、管理 Skills，同步到 Cursor / Claude Code / OpenCode 等 |
| 中央 API（`server/`） | 用户认证、Skill 元数据、OBS 内容存储、代码审查 |
| GitLab CI 样板（`examples/gitlab/`） | 按组织 Skill 审查提交与合并 |
| OpenCode（`opencode/`） | 钉扎的上游开源编辑器源码，供联合构建 / 合体安装包（见 `OPENCODE_VERSION`） |

## 开发

```bash
npm install
npm run tauri:dev          # 桌面客户端
cd server && cargo run --bin skills-manager-server   # 中央 API
```

联合构建（Skills + OpenCode，需本机 Bun 才会编 OpenCode 二进制）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\joint-build.ps1 -SkipElevate
```

服务端配置见 `server/.env.example`。

## 文档

- [使用手册（中文）](docs/芯宏Skills仓库-使用手册.md)
- [GitLab CI 安装（中文）](examples/gitlab/INSTALL.zh-CN.md)
- [中央服务 OBS 布局](README.zh-CN.md#中央服务器与-obs-存储)

## 许可

本软件基于 MIT 许可发布。第三方组件声明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
