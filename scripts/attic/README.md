# scripts/attic — Quarantined One-Off Scripts

This directory preserves one-off scripts that have already served their purpose
and must **never be re-run**, kept as calibration history rather than deleted.

## calibrate_audit.py

- **What it was:** A one-off in-place patcher used to calibrate/rewrite
  `scripts/ci-audit.py`.
- **Why quarantined:** It already performed its rewrite. Re-running it against
  the current `scripts/ci-audit.py` would corrupt the audit script, because it
  patches in place assuming the pre-calibration file state.
- **Status:** Do not execute. Retained for calibration history and provenance
  of the ci-audit rewrite.

Quarantined during repo housekeeping (July 2026).
