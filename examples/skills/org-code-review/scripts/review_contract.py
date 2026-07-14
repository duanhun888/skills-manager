"""Review JSON contract — shared by skill fixtures and review-service tests."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

SEVERITIES = frozenset({"blocker", "major", "minor", "info"})
RULE_PATTERN = re.compile(r"^[a-z][a-z0-9-]*/[a-z0-9][a-z0-9-]*$")


def evaluate_pass(findings: list[dict[str, Any]], fail_on: str = "blocker") -> bool:
    blockers = {"blocker"}
    if fail_on == "major":
        blockers.add("major")
    for item in findings:
        if item.get("severity") in blockers:
            return False
    return True


def validate_review_output(raw: dict[str, Any], *, fail_on: str = "blocker") -> list[str]:
    errors: list[str] = []

    if not isinstance(raw, dict):
        return ["root must be a JSON object"]

    if "passed" not in raw:
        errors.append("missing field: passed")
    elif not isinstance(raw["passed"], bool):
        errors.append("passed must be boolean")

    summary = raw.get("summary")
    if summary is None:
        errors.append("missing field: summary")
    elif not isinstance(summary, str):
        errors.append("summary must be string")
    elif len(summary.strip()) == 0:
        errors.append("summary must not be empty")
    elif len(summary) > 200:
        errors.append("summary should be <= 200 chars")

    findings = raw.get("findings")
    if findings is None:
        errors.append("missing field: findings")
    elif not isinstance(findings, list):
        errors.append("findings must be array")
    else:
        for i, item in enumerate(findings):
            prefix = f"findings[{i}]"
            if not isinstance(item, dict):
                errors.append(f"{prefix} must be object")
                continue
            for key in ("severity", "file", "line", "rule", "message"):
                if key not in item:
                    errors.append(f"{prefix} missing field: {key}")
            sev = item.get("severity")
            if sev not in SEVERITIES:
                errors.append(f"{prefix} invalid severity: {sev!r}")
            rule = item.get("rule")
            if isinstance(rule, str) and not RULE_PATTERN.match(rule):
                errors.append(f"{prefix} rule must match category/id: {rule!r}")
            line = item.get("line")
            if not isinstance(line, int) or line < 0:
                errors.append(f"{prefix} line must be non-negative int")

    skill_version = raw.get("skill_version")
    if skill_version is None:
        errors.append("missing field: skill_version")
    elif not isinstance(skill_version, str):
        errors.append("skill_version must be string")

    if isinstance(raw.get("passed"), bool) and isinstance(findings, list):
        expected = evaluate_pass(findings, fail_on)
        if raw["passed"] != expected:
            errors.append(
                f"passed={raw['passed']} inconsistent with findings "
                f"(expected passed={expected} for fail_on={fail_on!r})"
            )
        if len(findings) == 0 and raw["passed"] is False:
            errors.append("passed must be true when findings is empty")

    return errors


def load_fixture_expected(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def iter_fixture_files(fixtures_dir: Path) -> list[Path]:
    return sorted(fixtures_dir.glob("*.expected.json"))
