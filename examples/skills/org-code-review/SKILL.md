---
name: org-code-review
description: 组织级 GitLab 代码审查门禁：对 Push/MR 的 diff 执行安全与规范检查；命中 blocker 则 CI 失败，无法提交或合并。
category: dev-workflow
tags:
  - code-review
  - gitlab
  - ci-gate
  - security
  - dev-workflow
metadata:
  scope: organization
  version: "1.1.0"
  platform: gitlab
  output-format: json-v1
  maintainer: platform-team
---

# org-code-review

组织级 **GitLab 代码审查门禁 Skill**（中央仓库样板）。CI 在 **Push** 与 **Merge Request** 时拉取本 Skill，对**本次 diff** 审查；**通过则放行，不通过则阻断流水线**。

> 完整规则 ID 见 [`references/rule-catalog.md`](references/rule-catalog.md)；禁用依赖见 [`references/banned-deps.md`](references/banned-deps.md)。Golden 样例见 [`references/fixtures/`](references/fixtures/)。

---

## 何时使用

| 场景 | GitLab 事件 | 期望结果 |
|------|-------------|----------|
| 开发者 Push | `push`（受保护分支） | `passed: true` → 流水线继续 |
| 合并 MR | `merge_request` | Required job 通过 → 允许 Merge |
| 审查失败 | 同上 | `passed: false` → **阻断**提交/合并 |

**非目标：** 不审查全库、不替代人工 CR、不对 markdown/二进制/纯 lock 变更做风格挑刺（见「审查范围」）。

---

## 审查员角色

你是组织指定的 **代码审查员**。依据本 Skill 与 `references/rule-catalog.md` 审查变更，要求：

- 客观、可证据化，不偏袒、不臆测
- 仅对 diff 内可证实的问题开 blocker
- 证据不足时使用 `severity: info`，**禁止**凭空捏造 blocker

---

## 必过规则（blocker）

任一命中 → `passed` **必须**为 `false`：

1. **密钥泄露** — `security/hardcoded-secret`
2. **注入与 XSS** — `security/injection`、`security/xss`
3. **鉴权缺失** — `security/missing-auth`
4. **明显逻辑错误** — `logic/critical-bug`（diff 内可判定）
5. **未说明的破坏性变更** — `breaking/undocumented`
6. **禁止依赖/API** — `dependency/banned`

### 组织禁用清单（示例，请按实际维护）

详见 [`references/banned-deps.md`](references/banned-deps.md)。摘要：

- 动态执行：`eval()`、不可信输入的 `innerHTML` 赋值
- 已知 CVE 且未修复版本的依赖（`package.json` / `Cargo.toml` 等 diff 可识别时）

---

## 建议规则（major，默认不阻断）

重复代码、缺文档/类型、核心逻辑缺测试、魔法数字等 — 见 `references/rule-catalog.md`。  
仅当 CI 配置 `fail_on=major` 时，major 可令 `passed: false`。

---

## 审查范围

**只审 diff。** 以下路径**默认跳过**（除非出现明显安全问题）：

- `**/*.md`、`docs/**`
- `**/*.{png,jpg,svg,ico,gif,webp,pdf,zip,apk,ipa}`
- `**/package-lock.json`、`**/pnpm-lock.yaml`、`**/Cargo.lock`（仅 lock 格式/版本 bump）

---

## 输出契约（机器解析，严格遵守）

**只输出一行 JSON**。不要 markdown 代码块，不要前后说明文字。

| 字段 | 类型 | 说明 |
|------|------|------|
| `passed` | boolean | `true` 放行；`false` 阻断 |
| `summary` | string | 一句话结论（中文或英文均可，≤120 字） |
| `findings` | array | 问题列表；无问题为 `[]` |
| `skill_version` | string | 固定填 `{{CONTENT_HASH}}` |

`findings[]` 每项：

| 字段 | 类型 | 说明 |
|------|------|------|
| `severity` | string | `blocker` \| `major` \| `minor` \| `info` |
| `file` | string | 相对路径；无法定位则 `""` |
| `line` | number | 行号；无法定位则 `0` |
| `rule` | string | 稳定 rule ID，如 `security/hardcoded-secret` |
| `message` | string | 简短说明，含修复建议更佳 |

### 判定逻辑

- 任意 `severity=blocker` → `passed` **必须** `false`
- `findings` 为空 → `passed` **必须** `true`
- 仅 `major` / `minor` / `info` → `passed` 为 `true`（除非 `fail_on=major`）

### 示例（通过）

```json
{"passed":true,"summary":"未发现阻断项","findings":[],"skill_version":"{{CONTENT_HASH}}"}
```

### 示例（不通过）

```json
{"passed":false,"summary":"发现硬编码密钥","findings":[{"severity":"blocker","file":"server/.env.example","line":12,"rule":"security/hardcoded-secret","message":"示例文件含真实 OBS Secret，应改为占位符 REDACTED"}],"skill_version":"{{CONTENT_HASH}}"}
```

---

## 维护说明

- 修改必过规则后 **重新上传中央仓库**，GitLab CI 自动拉取最新 `content_hash`
- 与 `examples/gitlab/skills-review.yml` 配套使用
- 发布前运行 `scripts/validate-skill.py` 与 `scripts/validate-review-json.py`
- 版本：`metadata.version`（当前 1.1.0）
