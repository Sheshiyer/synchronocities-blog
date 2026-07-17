#!/usr/bin/env python3
"""
weekly-audit.py
───────────────
Runs the CI audit weekly and appends results to a history log.

Usage:
    python scripts/weekly-audit.py

Output:
    docs/ci-audit-history.jsonl
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
AUDIT_SCRIPT = REPO_ROOT / "scripts" / "ci-audit.py"
HISTORY_FILE = REPO_ROOT / "docs" / "ci-audit-history.jsonl"
LATEST_REPORT = REPO_ROOT / "docs" / "ci-audit-report.json"


def main():
    print(f"[INFO] Running weekly audit at {datetime.now(timezone.utc).isoformat()}")

    # Run the CI audit (capture its exit code)
    result = subprocess.run(
        [sys.executable, str(AUDIT_SCRIPT)],
        capture_output=True,
        text=True,
    )

    # Load the latest report
    if not LATEST_REPORT.exists():
        print(f"[ERROR] CI audit did not produce a report.", file=sys.stderr)
        sys.exit(1)

    with open(LATEST_REPORT, "r", encoding="utf-8") as f:
        report = json.load(f)

    # Append to history
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "audit_exit_code": result.returncode,
        "audit_stdout": result.stdout,
        "audit_stderr": result.stderr,
        "summary": {
            "total_posts": report.get("total_posts", 0),
            "pass_count": report.get("pass_count", 0),
            "warn_count": report.get("warn_count", 0),
            "fail_count": report.get("fail_count", 0),
            "top_avoid_signatures": report.get("top_avoid_signatures", []),
            "top_drift_patterns": report.get("top_drift_patterns", []),
        },
    }

    with open(HISTORY_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    print(f"[INFO] Appended weekly audit entry to: {HISTORY_FILE}")
    print(f"       PASS: {entry['summary']['pass_count']}  |  "
          f"WARNING: {entry['summary']['warn_count']}  |  "
          f"FAIL: {entry['summary']['fail_count']}")

    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
