# GitLab 端安装手册

在 GitLab 上启用「按中央仓库 Skill 审查代码」：**符合 → 流水线绿；不符合 → 提交/合并失败**。

## 前置条件

| 组件 | 要求 |
|------|------|
| GitLab | 13+，已开启 CI/CD |
| GitLab Runner | 任意 executor（Docker/K8s/Shell 均可），能跑 `alpine` 镜像 |
| 网络 | Runner 能访问 **中央 API** 与 **Review Service**（内网 IP 或域名） |
| 中央库 | 已上传 org scope 的 `org-code-review` Skill |
| 审查能力 | **推荐**：中央服务器配置 `LLM_API_URL` + `LLM_API_KEY`（无需单独审查服务） |
| | 或部署 `examples/review-service` 并设置 `REVIEW_SERVICE_URL` |

> Runner 在公网、中央库在 `127.0.0.1` 时 CI 会连不上，需用内网可达地址（如 `http://10.x.x.x:8088`）。

---

## 方式 A：单仓库安装（最快）

适合先在一个项目试点。

### 1. 拷贝 CI 文件到业务仓库

在业务 Git 仓库根目录创建：

```
your-repo/
├── .gitlab-ci.yml
└── .gitlab/
    ├── skills-review.yml      ← 从 examples/gitlab/skills-review.yml 复制
    └── skills-review.sh       ← 从 examples/gitlab/skills-review.sh 复制
```

根目录 `.gitlab-ci.yml`：

```yaml
stages:
  - review
  - build   # 你原有的 stage

variables:
  SKILLS_REVIEW_SCRIPT: ".gitlab/skills-review.sh"

include:
  - local: '.gitlab/skills-review.yml'

# 下面保留你原来的 build/test job ...
```

提交并 push 到 GitLab。

### 2. 配置 CI/CD 变量

**项目** → **Settings** → **CI/CD** → **Variables** → **Add variable**

| Key | Value | 选项 |
|-----|-------|------|
| `SKILLS_SERVER_URL` | `http://你的中央API:8088` | 不要 Protect（除非仅保护分支跑） |
| `SKILLS_CI_USERNAME` | `ci-bot` | |
| `SKILLS_CI_PASSWORD` | 机器账号密码 | **Mask** |
| `REVIEW_SERVICE_URL` | `http://审查服务:9090` | **可选**；不填则用 `SKILLS_SERVER_URL/api/v1/review` |
| `SKILLS_REVIEW_SKILL_NAME` | `org-code-review` | 可选，默认已是 |
| `SKILLS_REVIEW_SKILL_HASH` | 中央库 content_hash | 可选，建议 pin |

### 3. 确认 Runner 可用

**Settings** → **CI/CD** → **Runners** → 至少一个 **绿色 Available**。

无 Runner 时：安装 [GitLab Runner](https://docs.gitlab.com/runner/install/)，注册到该项目或 Group。

### 4. 保护分支 + 必选流水线

**Settings** → **Repository** → **Protected branches**

对 `main`（或 `develop`）：

| 项 | 建议 |
|----|------|
| Allowed to merge | Maintainers |
| Allowed to push | No one（或仅 Maintainers） |
| **Require approval** | 按团队规范 |

**Settings** → **Merge requests** → **Merge checks**（GitLab 15.11+）：

- 勾选 **Pipelines must succeed**

较老版本在 Protected branches 里勾选 **Require CI/CD pipeline to succeed before merging**。

### 5. 验证

1. 新建分支，改一行代码，push → 应出现 `skills-review-push` job
2. 开 MR → 应出现 `skills-review-merge` job
3. Job 日志末尾：`=== PASSED ===` 或 `=== FAILED ===`
4. 故意写硬编码密码 → 应失败，MR 无法合并

---

## 方式 B：Group 统一安装（推荐多项目）

适合整个组/公司所有仓库共用一套审查规则。

### 1. 新建 CI 模板项目

在 GitLab Group 下新建项目，例如 `devops/ci-templates`，放入：

```
ci-templates/
├── skills-review.yml
└── skills-review.sh
```

将 `skills-review.yml` 里的脚本路径改为：

```yaml
variables:
  SKILLS_REVIEW_SCRIPT: "skills-review.sh"
```

并在 job 里用 `bash "$SKILLS_REVIEW_SCRIPT"`（模板项目根目录即脚本位置）。

### 2. Group 级 CI 变量（一次配置，全组生效）

**Group** → **Settings** → **CI/CD** → **Variables**

配置与「方式 A」相同的 5 个变量。子项目自动继承，无需每个仓库重复填。

### 3. 各业务仓库只写 include

业务仓库 `.gitlab-ci.yml`：

```yaml
stages:
  - review
  - build

include:
  - project: 'your-group/ci-templates'
    ref: main
    file: '/skills-review.yml'

# 你的 build job ...
```

若模板项目是 **私有**，需在模板项目 **Settings → CI/CD → Token Access** 中允许业务项目访问。

### 4. Group 默认 MR 规则（可选）

**Group** → **Settings** → **Merge request approvals** / **Merge checks**  
统一要求 **Pipelines must succeed**。

---

## 试运行 vs 正式拦截

灰度第一周，在 `skills-review.yml` 两个 job 下加：

```yaml
allow_failure: true
```

观察 job 与 `review-report.json` artifact 无误后改回 `false`（模板默认已是 `false`）。

---

## 常见问题

### Job 报 `missing env: SKILLS_SERVER_URL`

变量未配置，或变量勾了 **Protected** 但 MR 来自非保护分支。

### `login failed` / `review request failed`

- 检查 Runner 到中央 API 的网络、防火墙
- 若未配置 `REVIEW_SERVICE_URL`，中央服务器需设置 `LLM_API_URL` 和 `LLM_API_KEY`
- `curl http://中央API:8088/api/v1/review` 应返回 401（说明路由存在）

### `org skill not found: org-code-review`

中央库未上传该 Skill，或 `SKILLS_REVIEW_SKILL_NAME` 与中央库 name 不一致。

### MR 能合并但审查失败了

未开启 **Pipelines must succeed**，或 `allow_failure: true`。

### push job 不跑

- 已有 open MR 时 push job 会跳过（由 merge job 审查），属正常
- 检查 `.gitlab-ci.yml` 的 `rules` 是否被你自己改坏

### 需要 `git fetch` 失败

确保 Runner 对仓库有 checkout 权限；`GIT_DEPTH` 太浅时可在项目变量设 `GIT_DEPTH: "0"`。

---

## 安装检查清单

- [ ] 中央库已上传 `org-code-review`（组织 scope）
- [ ] 中央服务器 `server/.env` 已配置 `LLM_API_URL` + `LLM_API_KEY`（或已部署独立 Review Service）
- [ ] GitLab CI 变量已配置（`REVIEW_SERVICE_URL` 可省略）
- [ ] Runner 可用且能访问上述两个 URL
- [ ] 业务仓库已有 `.gitlab-ci.yml` + include/本地脚本
- [ ] 保护分支 + MR 要求流水线成功
- [ ] 试跑 MR，确认失败能阻断合并

更完整的架构说明见 [README.md](./README.md)。
