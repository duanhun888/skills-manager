# 代码审查模版（提交 + 合并）

基于 **芯宏中央仓库 org Skill** 的 GitLab 门禁样板：**符合审查规则 → 提交/合并成功；不符合 → 失败阻断**。

> **GitLab 怎么装？** 按界面一步步操作请看 **[INSTALL.zh-CN.md](./INSTALL.zh-CN.md)**。  
> **新项目试点？** 直接复制 **[demo/](./demo/)** 目录到新仓库（灰度 `allow_failure: true`）。

## 文件说明

| 文件 | 用途 |
|------|------|
| `../skills/org-code-review/SKILL.md` | **审查规则样板**（上传中央仓库，可改必过规则） |
| `skills-review.sh` | 拉中央 Skill + 调审查服务 + 输出 pass/fail |
| `skills-review.yml` | CI：`push` 与 `merge_request` 各跑一遍 |
| `.gitlab-ci.sample.yml` | 业务仓库入口示例 |
| `../review-service/review_gate.py` | 审查服务（读 SKILL.md + LLM 判 JSON） |

## 两步拦截

```
开发者 push ──► skills-review-push ──► 失败则流水线红
       │
       └── 开 MR ──► skills-review-merge ──► 失败则 GitLab 禁止 Merge
```

| 场景 | CI Job | 失败效果 |
|------|--------|----------|
| **提交代码** | `skills-review-push` | Push 流水线失败（配合保护分支禁止合入） |
| **合并代码** | `skills-review-merge` | Required job 未过 → **无法点 Merge** |

## 快速落地

### 1. 上传审查 Skill 到中央仓库

1. 桌面端导入 `examples/skills/org-code-review/`
2. 作用范围选 **组织**
3. 点击 **上传中央仓库**
4. 记下 `skill_id`、`content_hash`

按组织规范修改 `SKILL.md` 中的「必过规则」「禁用依赖」后重新上传即可更新审查标准。

### 2. 配置 GitLab Group 变量

| 变量 | 说明 |
|------|------|
| `SKILLS_SERVER_URL` | 中央 API，如 `http://127.0.0.1:8088` |
| `SKILLS_CI_USERNAME` | 机器账号（能读 org skills） |
| `SKILLS_CI_PASSWORD` | masked |
| `SKILLS_REVIEW_SKILL_NAME` | `org-code-review` |
| `SKILLS_REVIEW_SKILL_HASH` | 可选，pin 版本 |
| `REVIEW_SERVICE_URL` | 可选；不填则用中央 `SKILLS_SERVER_URL/api/v1/review` |

中央服务器 `server/.env` 需配置（若不用独立审查服务）：

| 变量 | 说明 |
|------|------|
| `LLM_API_URL` | OpenAI 兼容接口 |
| `LLM_API_KEY` | LLM 密钥 |
| `LLM_MODEL` | 可选，默认 `gpt-4o-mini` |

### 3. 启动审查能力（二选一）

**A. 推荐 — 中央服务器内置**（无需 `REVIEW_SERVICE_URL`）

在 `server/.env` 添加 `LLM_API_URL`、`LLM_API_KEY`，重启中央服务即可。

**B. 独立审查服务**（可选）

```bash
cd examples/review-service
cp .env.example .env
docker compose up -d --build
```

GitLab 变量：`REVIEW_SERVICE_URL=http://内网IP:9090`

### 4. 业务仓库启用 CI

将 `examples/gitlab/` 拷入仓库，或 `include` 模板项目；根目录参考 `.gitlab-ci.sample.yml`。

**快捷导入审查 Skill**：使用 `examples/skills/org-code-review.zip`（桌面端导入 → 组织 → 上传中央仓库）。

### 5. 保护分支（必须）

**Settings → Repository → Protected branches**

- 禁止直接向 `main` / `develop` push（或仅 Maintainer）
- **Merge 前 Required pipeline**：勾选 `skills-review-merge`
- 可选：Push 也要求 pipeline 成功

### 6. 试运行 → 正式拦截

`skills-review.yml` 中 `allow_failure: false` 为正式模式。灰度时改为 `true`，观察一周后再改回。

## 审查判定（与 SKILL.md 一致）

- LLM 按中央仓库 `SKILL.md` 输出 JSON
- `passed: true` → CI exit 0
- `passed: false` 或存在 `blocker` → CI exit 1 → **提交/合并失败**
- 设置 `SKILLS_REVIEW_FAIL_ON=major` 时，`major` 也会失败

## 本地自测（可选）

```bash
export SKILLS_SERVER_URL=http://127.0.0.1:8088
export SKILLS_CI_USERNAME=ci-bot
export SKILLS_CI_PASSWORD=***
export REVIEW_SERVICE_URL=http://127.0.0.1:9090
export SKILLS_REVIEW_EVENT=push
export SKILLS_REVIEW_BASE_SHA=HEAD~1
export SKILLS_REVIEW_HEAD_SHA=HEAD
export SKILLS_REVIEW_REF=$(git branch --show-current)
bash examples/gitlab/skills-review.sh
```

## 自建 GitLab：push 时直接拒绝（可选）

CI 在 push **之后**运行，提交已在服务端。若要在 `git push` 瞬间拒绝，需在 GitLab 服务器配置 **pre-receive hook** 调用同一 `skills-review.sh`（需 runner 能访问中央 API 与 Review Service）。一般 **MR Required CI** 已满足合并拦截需求。
