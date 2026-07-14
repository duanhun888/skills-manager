#!/usr/bin/env python3
"""Validate org-code-review SKILL.md structure and frontmatter."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL_MD = ROOT / "SKILL.md"
REQUIRED_DIRS = ["references", "scripts"]
REQUIRED_FILES = [
    "references/rule-catalog.md",
    "references/banned-deps.md",
    "references/fixtures/01-pass-empty.expected.json",
    "references/fixtures/02-fail-hardcoded-secret.expected.json",
]


def parse_frontmatter(content: str) -> dict[str, str]:
    text = content.strip()
    if not text.startswith("---"):
        return {}
    rest = text[3:]
    end = rest.find("\n---")
    if end == -1:
        return {}
    block = rest[:end]
    data: dict[str, str] = {}
    for line in block.splitlines():
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        data[key.strip()] = val.strip().strip('"')
    return data


def main() -> int:
    errors: list[str] = []

    if not SKILL_MD.is_file():
        print(f"FAIL: missing {SKILL_MD}")
        return 1

    content = SKILL_MD.read_text(encoding="utf-8")
    fm = parse_frontmatter(content)

    name = fm.get("name")
    if name != "org-code-review":
        errors.append(f"frontmatter name must be org-code-review, got {name!r}")

    desc = fm.get("description")
    if not desc or len(desc) < 20:
        errors.append("description too short (need clear one-line summary)")
    if desc and len(desc) > 160:
        errors.append("description too long for card display (>160 chars)")

    if fm.get("category") != "dev-workflow":
        errors.append("category should be dev-workflow")

    for rel in REQUIRED_FILES:
        if not (ROOT / rel).is_file():
            errors.append(f"missing required file: {rel}")

    for rel in REQUIRED_DIRS:
        if not (ROOT / rel).is_dir():
            errors.append(f"missing required directory: {rel}")

    if "输出契约" not in content and "输出格式" not in content:
        errors.append("SKILL.md should document JSON output contract")

    if not re.search(r"security/hardcoded-secret", content):
        errors.append("SKILL.md should reference rule id security/hardcoded-secret")

    if errors:
        print("FAIL validate-skill.py")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK validate-skill.py — SKILL.md structure looks good")
    return 0


if __name__ == "__main__":
    sys.exit(main())
