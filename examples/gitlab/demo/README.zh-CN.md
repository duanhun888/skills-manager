# 灰度试点：skills-review-demo

新建 GitLab 空项目，把本目录下文件**原样提交**到仓库根目录即可（保持 `.gitlab/` 路径）。

## 1. 新建项目

GitLab → New project → `skills-review-demo`（空仓库，不要勾选 Auto DevOps）

## 2. Group / 项目 CI 变量

**Settings → CI/CD → Variables** 添加：

| Key | Value |
|-----|-------|
| `SKILLS_SERVER_URL` | `http://你的中央服务器IP:8088` |
| `SKILLS_CI_USERNAME` | `ci-bot` |
| `SKILLS_CI_PASSWORD` | 你为 ci-bot 设置的强密码（Mask） |
| `SKILLS_REVIEW_SKILL_NAME` | `org-code-review` |
| `SKILLS_REVIEW_SKILL_HASH` | `7007d98ca665676e657cc756310d83af2b07c31f368de976a66f2d929f384bb0` |

`REVIEW_SERVICE_URL` **不要建**。

## 3. 提交本目录文件

仓库结构应为：

```
skills-review-demo/
├── .gitlab-ci.yml
├── .gitlab/
│   ├── skills-review.yml
│   └── skills-review.sh
├── README.md
└── tests/
    ├── should-pass.php
    └── should-fail.php
```

Web IDE 或本地 push 均可。

## 4. 验证（约 10 分钟）

### 测试 A：正常代码（应绿，但 allow_failure 下红了也不挡合并）

1. 只改 `tests/should-pass.php`，commit & push
2. **CI/CD → 流水线** 出现今天的记录
3. Job `skills-review-push` → 日志末尾 `=== PASSED ===`

### 测试 B：故意违规（应红，但不挡合并）

1. 把 `tests/should-fail.php` 提交进仓库（含硬编码密钥）
2. Push 或开 MR
3. Job 变红，日志 `=== FAILED ===`，流水线整体仍可能显示 **passed with warnings**（灰度模式）

### 测试 C：MR 审查

1. 新建分支，修改 `should-fail.php`，开 Merge Request
2. 应出现 `skills-review-merge` job

## 5. 灰度 → 正式

本 demo 的 `.gitlab/skills-review.yml` 已设 **`allow_failure: true`**（失败不阻断）。

试点 1～2 周无问题后：

1. 把 `allow_failure: true` 改成 `false`
2. 保护分支开启 **Pipelines must succeed**
3. 再推广到老项目

## 常见问题

| 现象 | 处理 |
|------|------|
| 没有流水线 | 确认已 push `.gitlab-ci.yml` |
| `login failed` | `SKILLS_SERVER_URL` 改成 Runner 能访问的 IP |
| `org skill not found` | 中央库上传 `org-code-review` |
| Job 一直 pending | **Settings → CI/CD → Runners** 无可用 Runner |
