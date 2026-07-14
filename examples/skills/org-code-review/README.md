# org-code-review

组织级 **GitLab 代码审查门禁** Skill。由 CI 拉取中央仓库最新版本，对 Push / MR 的 **diff** 做安全与规范审查。

| 项 | 说明 |
|----|------|
| 作用范围 | **组织**（全员共享） |
| 业务类型 | 开发流程规范 |
| 配套 CI | `examples/gitlab/skills-review.yml` |
| 审查服务 | 中央 `POST /api/v1/review` 或 `examples/review-service` |

## 快速发布

1. 桌面端 **导入** 本目录或 `org-code-review.zip`
2. 作用范围选 **组织**，业务类型 **开发流程规范**
3. 点击 **上传中央仓库**
4. GitLab Group 变量配置 `SKILLS_SERVER_URL`、`SKILLS_CI_*`（见 `examples/gitlab/INSTALL.zh-CN.md`）

## 目录结构

```
org-code-review/
├── SKILL.md                 # LLM 审查指令（CI 拉取此文件）
├── README.md                # 本说明（给人看，CI 不读）
├── references/
│   ├── rule-catalog.md      # 规则 ID 目录
│   ├── banned-deps.md       # 组织禁用依赖/API（按实际维护）
│   └── fixtures/            # Golden 样例（回归测试 JSON 契约）
└── scripts/
    ├── validate-skill.py    # 校验 SKILL.md 结构与 frontmatter
    └── validate-review-json.py  # 校验审查输出 JSON
```

## 如何改规则

1. 编辑 `SKILL.md`（必过规则摘要）或 `references/rule-catalog.md`（细则）
2. 禁用库清单改 `references/banned-deps.md`
3. 更新 frontmatter `metadata.version`（如 `1.1.0` → `1.2.0`）
4. 本地运行校验（见下）
5. 桌面端 **重新上传中央仓库** → GitLab 自动用新 `content_hash`

## 本地校验

```bash
# 校验 Skill 文件结构
python scripts/validate-skill.py

# 校验 fixtures 中的 JSON 契约
python scripts/validate-review-json.py
```

中央服务联调（需 LLM 配置）：

```powershell
cd server
.\scripts\verify-review.ps1 -SkillName org-code-review
```

## 卡片展示建议

上传后「我的技能库」卡片会读 `SKILL.md` frontmatter：

| 字段 | 当前建议值 |
|------|------------|
| name | `org-code-review` |
| description | 组织级 GitLab 代码审查门禁：对 Push/MR 的 diff 执行安全与规范检查；命中 blocker 则 CI 失败 |
| tags | `ci-gate` `code-review` `gitlab` `security` |

描述控制在 **一行 80 字内**，便于卡片 `line-clamp` 展示。

## 版本记录

| 版本 | 变更 |
|------|------|
| 1.1.0 | 专业结构：rule ID、references/、metadata、Golden fixtures |
| 1.0.0 | 初始样板 |
