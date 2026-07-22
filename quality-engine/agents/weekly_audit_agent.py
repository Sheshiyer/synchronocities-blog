#!/usr/bin/env python3
"""
weekly_audit_agent.py
─────────────────────
Agent-owned weekly quality-audit loop for the Noesis blog corpus. Wired into
.github/workflows/weekly-audit.yml (Mon 03:17 UTC, matching scripts/cron-setup.md).

Loop:
  a. Run scripts/ci-audit.py (7-dimension audit → docs/ci-audit-report.json).
  b. Parse the JSON report.
  c. FIX stage — mechanical/safe autofixes only:
       1. Existing repo scripts (idempotent, frontmatter-only):
          scripts/apply-cluster-tags.ts, scripts/backfill-entry-kind.ts
          (skipped gracefully when node is unavailable).
       2. Deterministic token fixes (weekly_audit_fixes.py): strip
          [vault: ...] refs, replace the CRITICAL term (WitnessOS →
          "Noesis Engine"). Never free-rewrites post prose.
       3. LLM fixer (env-gated on NVIDIA_API_KEY): an AgentScope agent per
          SPIKE-REPORT.md config, restricted to term-level fix tools.
          Skips with a clear log line when the key is absent.
  d. Re-run the audit if any fix landed; append weekly-audit history and
     regenerate docs/quality-dashboard.md (via scripts/generate-dashboard.py).
  e. Write docs/weekly-audit-gate.json (fail counts before/after — the
     workflow refuses to push when the audit got WORSE) and exit with the
     final audit state (0 = no FAILs, 1 = at least one FAIL).

Usage:
    python quality-engine/agents/weekly_audit_agent.py [--dry-run] [--max-llm-posts N]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
AGENTS_DIR = Path(__file__).resolve().parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
DOCS_DIR = REPO_ROOT / "docs"
REPORT_FILE = DOCS_DIR / "ci-audit-report.json"
HISTORY_FILE = DOCS_DIR / "ci-audit-history.jsonl"
GATE_FILE = DOCS_DIR / "weekly-audit-gate.json"

sys.path.insert(0, str(AGENTS_DIR))  # weekly_audit_fixes + qe_agents (read-only)

import weekly_audit_fixes as fixes  # noqa: E402

REPO_FIX_SCRIPTS = [  # idempotent, frontmatter-only (see script docstrings)
    "scripts/apply-cluster-tags.ts",
    "scripts/backfill-entry-kind.ts",
]

LLM_FIX_SYSTEM_PROMPT = """You are the Noesis weekly-audit fixer. You repair
vocabulary contamination in blog posts using ONLY the provided tools.

Hard rules:
- NEVER rewrite prose. The only edits allowed are the tools
  apply_term_fix_tool (whole-word, allowlisted term replacement) and
  remove_vault_refs_tool (strip [vault: ...] references).
- Call describe_post_violations first to see the exact terms in a post.
- Pick replacements only from the approved_replacements list it returns.
- If a replacement is rejected ("no VCS improvement"), try a different
  approved term or move on — do not retry the same pair.
- Work through the posts listed by the user, then stop and summarize."""


def log(msg: str) -> None:
    print(f"[weekly-audit-agent] {msg}", flush=True)


def run_ci_audit() -> tuple[dict, int, str]:
    """Run scripts/ci-audit.py; return (report, exit_code, stdout)."""
    proc = subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / "ci-audit.py")],
        cwd=REPO_ROOT, capture_output=True, text=True, check=False,
    )
    sys.stdout.write(proc.stdout)
    if proc.stderr:
        sys.stderr.write(proc.stderr)
    if not REPORT_FILE.exists():
        log("ci-audit.py did not produce a report")
        return {"fail_count": -1, "posts": []}, 1, proc.stdout
    with open(REPORT_FILE, encoding="utf-8") as fh:
        return json.load(fh), proc.returncode, proc.stdout


def summary_of(report: dict) -> dict:
    return {
        "total_posts": report.get("total_posts", 0),
        "pass_count": report.get("pass_count", 0),
        "warn_count": report.get("warn_count", 0),
        "fail_count": report.get("fail_count", 0),
    }


# ── Fix stage 1: existing repo scripts (idempotent, metadata-only) ───────────

def run_repo_fix_scripts(dry_run: bool) -> list[dict]:
    results = []
    node = shutil.which("node")
    if node is None:
        log("[SKIP] repo fix scripts: node not on PATH")
        return results
    for rel in REPO_FIX_SCRIPTS:
        script = REPO_ROOT / rel
        if not script.exists():
            log(f"[SKIP] {rel}: not found")
            continue
        if dry_run:
            log(f"[DRY-RUN] would run repo fix script: {rel}")
            results.append({"script": rel, "ran": False, "dry_run": True})
            continue
        proc = subprocess.run(
            [node, "--experimental-strip-types", str(script)],
            cwd=REPO_ROOT, capture_output=True, text=True, check=False,
            timeout=300,
        )
        log(f"[FIX] {rel} exited {proc.returncode}: "
            f"{(proc.stdout or proc.stderr).strip()[:300]}")
        results.append({"script": rel, "ran": True,
                        "exit_code": proc.returncode})
    return results


# ── Fix stage 3: AgentScope LLM fixer (env-gated) ────────────────────────────

def _resolve_nvidia_key() -> str | None:
    key = __import__("os").environ.get("NVIDIA_API_KEY")
    if key:
        return key
    try:  # local fallback documented in SPIKE-REPORT.md; absent in CI
        from qe_agents.config import load_nvidia_api_key
        return load_nvidia_api_key()
    except Exception:
        return None


async def _llm_fix_loop(candidates: list[dict]) -> None:
    from agentscope.agent import Agent, ReActConfig
    from agentscope.message import UserMsg
    from agentscope.tool import Toolkit
    from qe_agents.config import build_model
    from qe_agents.tools import (
        AutoAllowFunctionTool, read_post, read_post_lines,
    )

    toolkit = Toolkit(tools=[
        AutoAllowFunctionTool(read_post, is_read_only=True),
        AutoAllowFunctionTool(read_post_lines, is_read_only=True),
        AutoAllowFunctionTool(fixes.describe_post_violations, is_read_only=True),
        AutoAllowFunctionTool(fixes.apply_term_fix_tool),
        AutoAllowFunctionTool(fixes.remove_vault_refs_tool),
    ])
    agent = Agent(
        name="weekly-audit-fixer",
        system_prompt=LLM_FIX_SYSTEM_PROMPT,
        model=build_model(stream=True, think=False),
        toolkit=toolkit,
        react_config=ReActConfig(max_iters=10),
    )
    payload = json.dumps(candidates, ensure_ascii=False, indent=1)
    task = (
        "Fix vocabulary contamination in these posts (slug + failing terms). "
        "Use only the tools; never rewrite prose. Posts:\n" + payload
    )
    reply = await asyncio.wait_for(
        agent.reply(UserMsg(name="user", content=task)), timeout=600,
    )
    texts = [getattr(b, "text", "") for b in getattr(reply, "content", []) or []]
    log(f"[LLM] fixer final reply: {' '.join(t for t in texts if t)[:500]}")


def run_llm_fix_stage(report: dict, dry_run: bool, max_posts: int) -> str:
    """Returns a status string recorded in the gate file."""
    candidates = []
    for post in report.get("posts", []):
        slug = post.get("post", "").removesuffix(".md")
        vocab = post.get("dimensions", {}).get("vocabulary", {})
        std = vocab.get("standard_matches", [])
        if std and slug:
            candidates.append({
                "slug": slug,
                "overall": post.get("overall"),
                "severity_score": post.get("severity_score"),
                "standard_matches": [[t, c] for t, c in std],
            })
    candidates.sort(key=lambda p: (p["overall"] != "FAIL",
                                   p["severity_score"] or 0))
    candidates = candidates[:max_posts]

    key = _resolve_nvidia_key()
    if key is None:
        log("[SKIP] LLM fix stage: NVIDIA_API_KEY not present — "
            "deterministic fixes only (set the NVIDIA_API_KEY secret to enable)")
        return "skipped-no-key"
    if not candidates:
        log("[LLM] no vocabulary-contamination candidates; nothing to fix")
        return "skipped-no-candidates"
    if dry_run:
        log(f"[DRY-RUN] would run AgentScope LLM fixer on "
            f"{len(candidates)} post(s): {[c['slug'] for c in candidates]}")
        return "skipped-dry-run"

    __import__("os").environ.setdefault("NVIDIA_API_KEY", key)
    log(f"[LLM] running AgentScope fixer on {len(candidates)} post(s) "
        f"(NIM nemotron-3-super, term-level tools only)")
    try:
        asyncio.run(_llm_fix_loop(candidates))
        return "ran"
    except Exception as exc:  # noqa: BLE001 — LLM stage is best-effort
        log(f"[WARN] LLM fix stage failed non-fatally: {exc}")
        return "failed"


# ── History + dashboard + gate ───────────────────────────────────────────────

def append_history(entry: dict) -> None:
    with open(HISTORY_FILE, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    log(f"appended history entry → {HISTORY_FILE.relative_to(REPO_ROOT)}")


def regen_dashboard(dry_run: bool) -> None:
    if dry_run:
        log("[DRY-RUN] would regenerate docs/quality-dashboard.md")
        return
    proc = subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / "generate-dashboard.py")],
        cwd=REPO_ROOT, capture_output=True, text=True, check=False,
    )
    sys.stdout.write(proc.stdout)
    if proc.returncode != 0:
        log(f"[WARN] generate-dashboard.py exited {proc.returncode}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="audit + report fix candidates; write nothing")
    parser.add_argument("--max-llm-posts", type=int, default=5,
                        help="cap on posts sent to the LLM fixer (default 5)")
    args = parser.parse_args()
    dry_run = args.dry_run

    ts = datetime.now(timezone.utc).isoformat()
    log(f"starting weekly audit at {ts} (dry_run={dry_run})")

    # In dry-run, preserve the committed report file (ci-audit rewrites it).
    saved_report = REPORT_FILE.read_bytes() if dry_run and REPORT_FILE.exists() else None

    try:
        # (a)+(b) initial audit
        report_before, exit_before, _ = run_ci_audit()
        before = summary_of(report_before)
        log(f"initial audit: PASS {before['pass_count']} | "
            f"WARNING {before['warn_count']} | FAIL {before['fail_count']}")

        # (c) FIX stage
        script_results = run_repo_fix_scripts(dry_run)
        fix_log = fixes.apply_deterministic_fixes(
            report_before, write=not dry_run)
        applied = [f for f in fix_log if f["result"].get("applied")]
        if dry_run:
            would = [f for f in fix_log
                     if f["kind"] in ("vault_references", "critical_term")]
            log(f"[DRY-RUN] {len(would)} deterministic fix candidate(s): "
                f"{json.dumps(would, ensure_ascii=False)[:800]}")
        else:
            log(f"deterministic fixes applied: {len(applied)}")
        llm_status = run_llm_fix_stage(report_before, dry_run,
                                       args.max_llm_posts)

        # re-audit if anything landed
        fixes_landed = bool(applied) or (
            llm_status == "ran") or any(
            r.get("ran") and r.get("exit_code") == 0 for r in script_results)
        if not dry_run and fixes_landed:
            log("fixes applied — re-running audit for final state")
            report_after, exit_after, audit_stdout = run_ci_audit()
        else:
            report_after, exit_after, audit_stdout = report_before, exit_before, ""
        after = summary_of(report_after)

        # (d) history + dashboard
        entry = {
            "timestamp": ts,
            "agent": "quality-engine/agents/weekly_audit_agent.py",
            "audit_exit_code": exit_after,
            "summary": after,
            "before": before,
            "fixes_applied": len(applied),
            "llm_fix_stage": llm_status,
            "note": ("post fixes are applied in the CI working tree only; "
                     "the workflow commits report/history/dashboard only"),
        }
        if dry_run:
            log(f"[DRY-RUN] would append history entry: "
                f"{json.dumps(entry, ensure_ascii=False)[:600]}")
        else:
            append_history(entry)
        regen_dashboard(dry_run)

        # (e) gate — the workflow refuses to push when the audit got worse
        gate = {
            "timestamp": ts,
            "fail_before": before["fail_count"],
            "fail_after": after["fail_count"],
            "warn_before": before["warn_count"],
            "warn_after": after["warn_count"],
            "worse": after["fail_count"] > before["fail_count"],
            "fixes_applied": len(applied),
            "fixed_posts": sorted({f["slug"] for f in applied}),
            "llm_fix_stage": llm_status,
            "dry_run": dry_run,
        }
        if dry_run:
            log(f"[DRY-RUN] gate (not written): "
                f"{json.dumps(gate, ensure_ascii=False)}")
        else:
            GATE_FILE.write_text(json.dumps(gate, indent=1) + "\n",
                                 encoding="utf-8")
            log(f"gate written → {GATE_FILE.relative_to(REPO_ROOT)}: "
                f"fails {gate['fail_before']} → {gate['fail_after']}, "
                f"worse={gate['worse']}")

        log(f"final state: PASS {after['pass_count']} | "
            f"WARNING {after['warn_count']} | FAIL {after['fail_count']} "
            f"→ exit {exit_after}")
        return exit_after
    finally:
        if dry_run:
            if saved_report is not None:
                REPORT_FILE.write_bytes(saved_report)
            elif REPORT_FILE.exists():
                REPORT_FILE.unlink()


if __name__ == "__main__":
    sys.exit(main())
