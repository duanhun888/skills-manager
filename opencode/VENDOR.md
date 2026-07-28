# OpenCode（vendored）

本目录为上游开源项目 [anomalyco/opencode](https://github.com/anomalyco/opencode) 的钉扎源码，供芯宏 Skills 仓库**联合构建 / 合体安装包**使用。

- 钉扎版本见仓库根目录 [`OPENCODE_VERSION`](../OPENCODE_VERSION)
- 许可：MIT（见本目录 `LICENSE`）
- 默认不由 Skills 的 `npm run tauri:dev` 启动；构建见 [`scripts/joint-build.ps1`](../scripts/joint-build.ps1)

升级钉扎版本时：替换本目录内容、更新 `OPENCODE_VERSION`，再跑联合构建回归。
