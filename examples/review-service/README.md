# Skills Review Service（可选）

按 **芯宏中央仓库 org Skill** 审查 Git diff。

> **多数场景不必单独部署本服务。** 中央 `skills-manager-server` 已提供 `POST /api/v1/review`，只需在 `server/.env` 配置 `LLM_API_URL` / `LLM_API_KEY`，GitLab 不配 `REVIEW_SERVICE_URL` 即可。

仅在需要审查与中央 API 隔离、或独立扩缩容时使用本服务。

## 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/review` | 审查 diff，返回 `passed: true/false` |

### POST /review 请求体

```json
{
  "skill_id": "uuid-from-central",
  "skill_hash": "abc123",
  "repo_url": "https://gitlab.com/group/repo",
  "base_sha": "aaa",
  "head_sha": "bbb",
  "ref": "feature/foo",
  "merge_request_iid": "42",
  "event": "merge",
  "diff": "diff --git a/...",
  "fail_on": "blocker"
}
```

### 响应

```json
{
  "passed": false,
  "summary": "发现硬编码密钥",
  "findings": [
    {
      "severity": "blocker",
      "file": "src/config.ts",
      "line": 10,
      "rule": "security/hardcoded-secret",
      "message": "API Key 不应提交到仓库"
    }
  ],
  "skill_id": "...",
  "skill_hash": "...",
  "event": "merge"
}
```

- `passed: true` → GitLab CI 成功，允许提交/合并
- `passed: false` → CI 失败，阻断

## 本地启动

```bash
cd examples/review-service
cp .env.example .env
# 编辑 .env 填入中央 API 与 LLM 凭据

pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 9090 --reload
```

验证：

```bash
curl http://127.0.0.1:9090/health
```

## Docker

```bash
cp .env.example .env
docker compose up -d --build
```

GitLab Group 变量：`REVIEW_SERVICE_URL=http://review.internal:9090`

## 与 GitLab CI 串联

1. 中央仓库上传 `examples/skills/org-code-review`（或 `org-code-review.zip`）
2. 本服务监听内网 9090
3. 业务仓库 include `examples/gitlab/skills-review.yml`
4. Group 变量配置 `SKILLS_SERVER_URL`、`SKILLS_CI_*`、`REVIEW_SERVICE_URL`

## CLI 调试（不启 HTTP）

```bash
export SKILLS_SERVER_URL=... SKILLS_CI_USERNAME=... SKILLS_CI_PASSWORD=...
export LLM_API_URL=... LLM_API_KEY=...
echo '{"skill_id":"...","diff":"diff --git ..."}' | python review_gate.py
```
