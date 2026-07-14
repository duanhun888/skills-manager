#!/usr/bin/env python3
"""Run Golden fixture validation for org-code-review JSON contract."""

from __future__ import annotations

import sys
from pathlib import Path

SKILL_SCRIPTS = Path(__file__).resolve().parents[1] / "skills" / "org-code-review" / "scripts"
sys.path.insert(0, str(SKILL_SCRIPTS))

from review_contract import iter_fixture_files, load_fixture_expected, validate_review_output  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[1] / "skills" / "org-code-review" / "references" / "fixtures"


def test_all_fixtures_pass_contract() -> None:
    for path in iter_fixture_files(FIXTURES):
        raw = load_fixture_expected(path)
        errors = validate_review_output(raw, fail_on="blocker")
        assert not errors, f"{path.name}: {errors}"


def test_evaluate_pass_blocker() -> None:
    from review_contract import evaluate_pass

    assert evaluate_pass([]) is True
    assert evaluate_pass([{"severity": "major"}]) is True
    assert evaluate_pass([{"severity": "blocker"}]) is False


if __name__ == "__main__":
    test_evaluate_pass_blocker()
    test_all_fixtures_pass_contract()
    print("OK test_golden.py")
