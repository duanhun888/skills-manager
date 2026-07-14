#!/usr/bin/env python3
"""
最小 Review Service 示例 — 对接芯宏 Skills 中央库 + GitLab CI。

部署为内网 HTTP 服务（FastAPI / Flask 包装此逻辑均可）。

环境变量:
  SKILLS_SERVER_URL      中央 API
  SKILLS_CI_USERNAME     读 org skill 的机器账号
  SKILLS_CI_PASSWORD
  LLM_API_URL            OpenAI 兼容接口
  LLM_API_KEY
  LLM_MODEL              如 gpt-4o-mini

POST /review
  见下方 ReviewRequest / ReviewResponse
"""

from __future__ import annotations

import io
import json
import os
import re
import zipfile
from dataclasses import dataclass
from typing import Any
from urllib import request


@dataclass
class ReviewRequest:
    skill_id: str
    skill_hash: str
    repo_url: str
    base_sha: str
    head_sha: str
    ref: str
    merge_request_iid: str
    diff: str
    fail_on: str = "blocker"
    event: str = "push"


@dataclass
class ReviewResponse:
    passed: bool
    summary: str
    findings: list[dict[str, Any]]
    skill_id: str
    skill_hash: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "summary": self.summary,
            "findings": self.findings,
            "skill_id": self.skill_id,
            "skill_hash": self.skill_hash,
        }


def login(base_url: str, user: str, password: str) -> str:
    body = json.dumps({"username": user, "password": password}).encode()
    req = request.Request(
        f"{base_url.rstrip('/')}/api/v1/auth/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    return data["access_token"]


def fetch_skill_zip(base_url: str, token: str, skill_id: str) -> bytes:
    req = request.Request(
        f"{base_url.rstrip('/')}/api/v1/skills/{skill_id}/content",
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    with request.urlopen(req, timeout=120) as resp:
        return resp.read()


def extract_skill_md(zip_bytes: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for name in zf.namelist():
            if name.endswith("SKILL.md") or name == "SKILL.md":
                return zf.read(name).decode("utf-8", errors="replace")
    raise ValueError("SKILL.md not found in skill archive")


def call_llm(system: str, user: str) -> dict[str, Any]:
    api_url = os.environ["LLM_API_URL"].rstrip("/")
    api_key = os.environ["LLM_API_KEY"]
    model = os.environ.get("LLM_MODEL", "gpt-4o-mini")
    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    req = request.Request(
        f"{api_url}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read())
    text = data["choices"][0]["message"]["content"].strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def evaluate_pass(findings: list[dict[str, Any]], fail_on: str) -> bool:
    blockers = {"blocker"}
    if fail_on == "major":
        blockers.add("major")
    for f in findings:
        if f.get("severity") in blockers:
            return False
    return True


def run_review(req: ReviewRequest) -> ReviewResponse:
    base = os.environ["SKILLS_SERVER_URL"]
    user = os.environ["SKILLS_CI_USERNAME"]
    password = os.environ["SKILLS_CI_PASSWORD"]

    token = login(base, user, password)
    skill_md = extract_skill_md(fetch_skill_zip(base, token, req.skill_id))

    system = skill_md.replace("{{CONTENT_HASH}}", req.skill_hash or "unknown")
    user_prompt = f"""审查以下 Git 变更。

事件: {req.event}（push=提交, merge=合并）
仓库: {req.repo_url}
分支/ref: {req.ref}
MR: {req.merge_request_iid or 'N/a'}
base: {req.base_sha}
head: {req.head_sha}

```diff
{req.diff[:120000]}
```

严格按 SKILL 中的 JSON 格式输出一行结果。"""

    raw = call_llm(system, user_prompt)
    findings = raw.get("findings") or []
    passed = raw.get("passed")
    if passed is None:
        passed = evaluate_pass(findings, req.fail_on)
    else:
        passed = bool(passed) and evaluate_pass(findings, req.fail_on)

    return ReviewResponse(
        passed=passed,
        summary=str(raw.get("summary") or ""),
        findings=findings,
        skill_id=req.skill_id,
        skill_hash=req.skill_hash,
    )


if __name__ == "__main__":
    import sys

    payload = json.loads(sys.stdin.read())
    result = run_review(
        ReviewRequest(
            skill_id=payload["skill_id"],
            skill_hash=payload.get("skill_hash") or "",
            repo_url=payload.get("repo_url") or "",
            base_sha=payload.get("base_sha") or "",
            head_sha=payload.get("head_sha") or "",
            ref=payload.get("ref") or "",
            merge_request_iid=str(payload.get("merge_request_iid") or ""),
            diff=payload.get("diff") or "",
            fail_on=payload.get("fail_on") or "blocker",
        )
    )
    print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
