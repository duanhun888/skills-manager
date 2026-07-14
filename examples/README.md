# 代码审查门禁 — 完整样板

提交 / 合并时按 **中央仓库 org Skill** 审查，符合通过，不符合失败。

## 目录

```
examples/
├── skills/
│   ├── org-code-review/SKILL.md    # 审查规则（可编辑）
│   ├── org-code-review/README.md   # 发布与维护说明
│   └── org-code-review.zip         # 桌面端一键导入
├── gitlab/
│   ├── skills-review.yml           # CI：push + MR
│   ├── skills-review.sh            # 审查脚本
│   └── README.md                   # GitLab 配置
└── review-service/
    ├── app.py                      # FastAPI POST /review
    ├── review_gate.py              # 核心逻辑
    ├── docker-compose.yml
    └── README.md                   # 服务部署
```

## 5 分钟串联

| 步骤 | 操作 |
|------|------|
| 1 | 桌面端导入 `skills/org-code-review.zip` → **组织** → **上传中央仓库** |
| 1b | 可选：`python skills/org-code-review/scripts/validate-skill.py` 校验结构 |
| 2 | 中央服务器创建 `ci-bot` 机器账号 |
| 3 | 中央 `server/.env` 配置 `LLM_API_URL` + `LLM_API_KEY`（或单独部署 review-service） |
| 4 | GitLab Group 变量：`SKILLS_SERVER_URL`、`SKILLS_CI_*`（`REVIEW_SERVICE_URL` 可选） |
| 5 | 业务仓库 include `gitlab/skills-review.yml`，保护分支 Required CI |

## 判定

```
diff + 中央 SKILL.md → LLM → JSON { passed, findings }
passed=true  → CI 绿 → 可提交/合并
passed=false → CI 红 → 阻断
```

详细说明见各子目录 README。
