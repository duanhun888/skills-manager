"""芯宏 Skills 代码审查服务 — FastAPI HTTP 封装。"""

from __future__ import annotations

import os
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from review_gate import ReviewRequest, run_review

app = FastAPI(
    title="Skills Review Service",
    description="按中央仓库 org Skill 审查 Git diff，供 GitLab CI 调用",
    version="1.0.0",
)


class ReviewBody(BaseModel):
    skill_id: str
    skill_hash: str = ""
    repo_url: str = ""
    base_sha: str = ""
    head_sha: str = ""
    ref: str = ""
    merge_request_iid: str = ""
    event: Literal["push", "merge"] = "push"
    diff: str = ""
    fail_on: Literal["blocker", "major"] = "blocker"


class ReviewResult(BaseModel):
    passed: bool
    summary: str
    findings: list[dict[str, Any]]
    skill_id: str
    skill_hash: str
    event: str = ""


def _required_env() -> list[str]:
    missing = [
        k
        for k in (
            "SKILLS_SERVER_URL",
            "SKILLS_CI_USERNAME",
            "SKILLS_CI_PASSWORD",
            "LLM_API_URL",
            "LLM_API_KEY",
        )
        if not os.environ.get(k)
    ]
    return missing


@app.get("/health")
def health() -> dict[str, str]:
    missing = _required_env()
    if missing:
        return {"status": "degraded", "missing_env": ",".join(missing)}
    return {"status": "ok"}


@app.post("/review", response_model=ReviewResult)
def review(body: ReviewBody) -> ReviewResult:
    missing = _required_env()
    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"review service not configured, missing: {', '.join(missing)}",
        )

    if not body.diff.strip():
        return ReviewResult(
            passed=True,
            summary="无代码变更",
            findings=[],
            skill_id=body.skill_id,
            skill_hash=body.skill_hash,
            event=body.event,
        )

    try:
        result = run_review(
            ReviewRequest(
                skill_id=body.skill_id,
                skill_hash=body.skill_hash,
                repo_url=body.repo_url,
                base_sha=body.base_sha,
                head_sha=body.head_sha,
                ref=body.ref,
                merge_request_iid=body.merge_request_iid,
                diff=body.diff,
                fail_on=body.fail_on,
            )
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"review failed: {e}") from e

    out = result.to_dict()
    out["event"] = body.event
    return ReviewResult(**out)
