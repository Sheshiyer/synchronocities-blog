#!/usr/bin/env python3
"""
generate-dashboard.py
─────────────────────
Reads the latest CI audit JSON and generates a human-readable markdown dashboard.

Usage:
    python scripts/generate-dashboard.py

Output:
    docs/quality-dashboard.md
"""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
AUDIT_FILE = REPO_ROOT / "docs" / "ci-audit-report.json"
SEMANTIC_FILE = REPO_ROOT / "docs" / "semantic-similarity-report.json"
HISTORY_FILE = REPO_ROOT / "docs" / "ci-audit-history.jsonl"
OUTPUT_FILE = REPO_ROOT / "docs" / "quality-dashboard.md"

# Canonical PASS posts (from alignment report)
CANONICAL_PASS = [
    "seventeen-ways-pattern-repeats.md",
    "why-insight-isnt-change.md",
    "you-dont-need-more-frameworks.md",
    "repetition-is-architecture.md",
]


def load_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_history(path: Path) -> list[dict]:
    if not path.exists():
        return []
    entries = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append(json.loads(line))
    return entries


def generate() -> str:
    audit = load_json(AUDIT_FILE) or {}
    semantic = load_json(SEMANTIC_FILE) or {}
    history = load_history(HISTORY_FILE)

    total_posts = audit.get("total_posts", 0)
    pass_count = audit.get("pass_count", 0)
    warn_count = audit.get("warn_count", 0)
    fail_count = audit.get("fail_count", 0)

    md = []
    md.append("# Tryambakam Noesis — Quality Dashboard")
    md.append("")
    md.append(f"*Generated automatically by `generate-dashboard.py`*")
    md.append("")

    # ── Summary ───────────────────────────────────────────────────────────
    md.append("## 📊 Corpus Summary")
    md.append("")
    md.append(f"| Metric | Count |")
    md.append(f"|--------|-------|")
    md.append(f"| Total Posts | {total_posts} |")
    md.append(f"| ✅ PASS | {pass_count} |")
    md.append(f"| ⚠️ WARNING | {warn_count} |")
    md.append(f"| ❌ FAIL | {fail_count} |")
    md.append("")

    health_pct = round((pass_count / max(1, total_posts)) * 100, 1)
    md.append(f"**Overall Health: {health_pct}%**")
    md.append("")

    # ── Top Contamination Signatures ────────────────────────────────────────
    md.append("## 🔬 Top 5 Contamination Signatures")
    md.append("")
    avoid = audit.get("top_avoid_signatures", [])
    if avoid:
        md.append("| Rank | Term | Occurrences |")
        md.append("|------|------|-------------|")
        for i, item in enumerate(avoid, 1):
            md.append(f"| {i} | `{item['term']}` | {item['count']} |")
    else:
        md.append("*No contamination signatures detected.*")
    md.append("")

    # ── Trend Graph (if history exists) ─────────────────────────────────────
    md.append("## 📈 Trend Over Time")
    md.append("")
    if len(history) >= 2:
        md.append("```")
        md.append("Audit History (PASS / WARN / FAIL)")
        md.append("")
        for entry in history[-10:]:
            ts = entry.get("timestamp", "?")[:10]
            s = entry.get("summary", {})
            p, w, f = s.get("pass_count", 0), s.get("warn_count", 0), s.get("fail_count", 0)
            bar = "█" * p + "▒" * w + "░" * f
            md.append(f"{ts}  {bar}  P:{p} W:{w} F:{f}")
        md.append("```")
    else:
        md.append("*Not enough history for a trend graph. Run `weekly-audit.py` to accumulate data.*")
    md.append("")

    # ── Canonical PASS Posts ────────────────────────────────────────────────
    md.append("## 🏆 Canonical PASS Posts (Reference Models)")
    md.append("")
    md.append("These posts are the gold standard for brand voice, structural integrity, and Kha-Ba-La demonstration:")
    md.append("")
    for name in CANONICAL_PASS:
        md.append(f"- `{name}`")
    md.append("")

    # ── Semantic Similarity Overview ────────────────────────────────────────
    if semantic:
        md.append("## 🧠 Semantic Similarity Overview")
        md.append("")
        ok_c = semantic.get("ok_count", 0)
        warn_c = semantic.get("warning_count", 0)
        drift_c = semantic.get("drift_count", 0)
        md.append(f"| Classification | Count |")
        md.append(f"|------------------|-------|")
        md.append(f"| OK | {ok_c} |")
        md.append(f"| WARNING | {warn_c} |")
        md.append(f"| Drift | {drift_c} |")
        md.append("")

    # ── Posts Needing Attention ─────────────────────────────────────────────
    md.append("## 🚨 Posts Needing Attention")
    md.append("")
    posts = audit.get("posts", [])
    attention = [p for p in posts if p.get("overall") in ("FAIL", "WARNING")]
    attention.sort(key=lambda x: x.get("severity_score", 0))

    if attention:
        md.append("| Post | Overall | Severity | Top Issue |")
        md.append("|------|---------|----------|-----------|")
        for p in attention[:20]:
            name = p.get("post", "?")
            overall = p.get("overall", "?")
            sev = p.get("severity_score", 0)
            dims = p.get("dimensions", {})
            # Find the worst dimension
            worst = max(dims.items(), key=lambda kv: kv[1].get("score", 0) if kv[1].get("verdict") != "PASS" else 100)
            top_issue = worst[0].replace("_", " ").title()
            md.append(f"| `{name}` | {overall} | {sev} | {top_issue} |")
    else:
        md.append("*All posts are PASSing. No attention required.*")
    md.append("")

    # ── Footer ──────────────────────────────────────────────────────────────
    md.append("---")
    md.append("")
    md.append("*Dashboard auto-generated by the Noesis Quality Engine. Do not edit manually.*")
    md.append("")

    return "\n".join(md)


def main():
    md = generate()
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"[INFO] Quality dashboard written to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
