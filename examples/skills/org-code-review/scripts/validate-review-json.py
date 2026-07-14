#!/usr/bin/env python3
"""Validate Golden fixture JSON files against review output contract."""

from __future__ import annotations

import sys
from pathlib import Path

from review_contract import iter_fixture_files, load_fixture_expected, validate_review_output

FIXTURES = Path(__file__).resolve().parents[1] / "references" / "fixtures"


def main() -> int:
    paths = iter_fixture_files(FIXTURES)
    if not paths:
        print(f"FAIL: no *.expected.json in {FIXTURES}")
        return 1

    failed = 0
    for path in paths:
        raw = load_fixture_expected(path)
        errors = validate_review_output(raw, fail_on="blocker")
        if errors:
            failed += 1
            print(f"FAIL {path.name}")
            for err in errors:
                print(f"  - {err}")
        else:
            print(f"OK   {path.name} — passed={raw['passed']}")

    if failed:
        print(f"\n{failed} fixture(s) failed")
        return 1

    print(f"\nAll {len(paths)} fixture(s) passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
