# OpenCode（vendored · 芯宏定制）

本目录为钉扎源码，供芯宏 Skills **联合构建 / 合体安装包**使用。

- **不是**从 anomalyco GitHub Releases 下载官方 Desktop；Windows 捆绑包由本目录源码构建（`OPENCODE_CHANNEL=dev`）。
- 含需求工作台、素材库、TAPD、送入编码等定制能力（与本地 DEV 一致）。
- 钉扎版本见仓库根目录 [`OPENCODE_VERSION`](../OPENCODE_VERSION)
- 许可：MIT（见本目录 `LICENSE`）；上游为 [anomalyco/opencode](https://github.com/anomalyco/opencode)
- 构建：[`scripts/build-opencode-desktop.ps1`](../scripts/build-opencode-desktop.ps1) / [`scripts/joint-build.ps1`](../scripts/joint-build.ps1)

升级钉扎时：更新本目录内容与 `OPENCODE_VERSION`，再跑联合构建回归。
