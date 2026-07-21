#!/usr/bin/env python3
"""Coverage comparison: agent-extracted ledger vs production ledger.

Usage: .venv/bin/python compare_coverage.py <slug>
Reads the run ledger from quality-engine/agents/runs/<slug>/ and the
production ledger (READ-ONLY) from quality-engine/audits/albedo-v231-blind/,
then appends the comparison to the run's RUN-REPORT.md.
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def main() -> None:
    slug = sys.argv[1]
    agent = json.loads((REPO / f"quality-engine/agents/runs/{slug}/{slug}-albedo-ledger.json").read_text())
    prod = json.loads((REPO / f"quality-engine/audits/albedo-v231-blind/{slug}-albedo-ledger.json").read_text())

    a_claims = agent["claims"]
    p_claims = prod["claims"]

    def dist(a, p):
        """Min distance between anchor line ranges (0 if overlapping)."""
        a1, a2 = a["anchor"]["line_start"], a["anchor"]["line_end"]
        p1, p2 = p["anchor"]["line_start"], p["anchor"]["line_end"]
        if a2 < p1:
            return p1 - a2
        if p2 < a1:
            return a1 - p2
        return 0

    # Agent claims with a production anchor within ±3 lines
    a_matched = {c["id"]: [p["id"] for p in p_claims if dist(c, p) <= 3] for c in a_claims}
    # Production claims covered by any agent claim within ±3 lines
    p_covered = {p["id"]: [c["id"] for c in a_claims if dist(c, p) <= 3] for p in p_claims}
    p_missed = [p for p in p_claims if not p_covered[p["id"]]]
    a_extra = [c for c in a_claims if not a_matched[c["id"]]]

    # Status agreement where a prod claim is matched by exactly-one-line-away claims
    disagreements = []
    for p in p_claims:
        coverers = p_covered[p["id"]]
        for cid in coverers:
            c = next(x for x in a_claims if x["id"] == cid)
            if dist(c, p) == 0 and c["claim_status"] != p["claim_status"]:
                disagreements.append((p["id"], p["claim_status"], c["id"], c["claim_status"],
                                      p["anchor"]["quote"][:60]))

    lines = [
        "",
        "---",
        "",
        "## Coverage comparison vs production ledger (post-extraction)",
        "",
        f"- Agent claims: **{len(a_claims)}** | Production claims: **{len(p_claims)}**",
        f"- Agent claims with a production anchor within ±3 lines: "
        f"**{len(a_claims) - len(a_extra)}/{len(a_claims)}**",
        f"- Production claims covered (±3 lines) by the agent: "
        f"**{len(p_claims) - len(p_missed)}/{len(p_claims)}**",
        f"- Production claims missed: **{len(p_missed)}**",
        f"- Agent extra claims (no production anchor ±3): **{len(a_extra)}**",
        "",
        "### Production claims missed (±3 rule)",
        "",
    ]
    if p_missed:
        for p in p_missed:
            lines.append(f"- {p['id']} L{p['anchor']['line_start']} [{p['claim_status']}] "
                         f"\"{p['anchor']['quote'][:80]}\"")
    else:
        lines.append("- (none)")
    lines += ["", "### Agent extras (±3 rule)", ""]
    if a_extra:
        for c in a_extra:
            lines.append(f"- {c['id']} L{c['anchor']['line_start']} [{c['claim_status']}] "
                         f"\"{c['anchor']['quote'][:80]}\"")
    else:
        lines.append("- (none)")
    lines += ["", "### Status disagreements on same-line anchors", ""]
    if disagreements:
        for pid, pst, aid, ast, q in disagreements:
            lines.append(f"- {pid}={pst} vs {aid}={ast} — \"{q}\"")
    else:
        lines.append("- (none)")
    lines.append("")

    report = REPO / f"quality-engine/agents/runs/{slug}/RUN-REPORT.md"
    with open(report, "a") as fh:
        fh.write("\n".join(lines))
    print("\n".join(lines[:14]))
    print(f"appended to {report}")


if __name__ == "__main__":
    main()
