#!/usr/bin/env python3
"""CLI: python run_extraction.py <slug>

Runs the 2-agent blind extraction pipeline for a post slug and saves, under
quality-engine/agents/runs/<slug>/:
  - <slug>-albedo-ledger.json   (final ledger, written by the agents)
  - trace.json                  (tool-call trace + agent replies + usage)
  - validator-history.json      (every validation result, appended live)
  - RUN-REPORT.md               (human summary; coverage comparison appended
                                 separately after the run)
"""
import argparse
import asyncio
import collections
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from qe_agents import tools as T  # noqa: E402
from qe_agents.pipeline import run_pipeline  # noqa: E402


def _usage_totals(replies: list[dict]) -> dict:
    totals = collections.Counter()
    seen = False
    for r in replies:
        u = r.get("usage")
        if isinstance(u, dict):
            for k, v in u.items():
                if isinstance(v, (int, float)) and "token" in k.lower():
                    totals[k] += v
                    seen = True
    return dict(totals) if seen else {}


def build_report(result: dict) -> str:
    ledger = result["ledger"]
    claims = ledger.get("claims", [])
    status_dist = collections.Counter(c.get("claim_status") for c in claims)
    mode_dist = collections.Counter(c.get("claim_mode") for c in claims)
    fv = result["final_validation"]

    lines = [
        f"# RUN-REPORT — blind extraction: `{result['slug']}`",
        "",
        f"- Run timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"- Ledger: `quality-engine/agents/runs/{result['slug']}/{result['slug']}-albedo-ledger.json`",
        f"- Claims extracted: **{len(claims)}**",
        f"- Final validator state: **failure_count = {fv['failure_count']}**",
        f"- NIM model calls (counted via middleware): {result['model_calls']}",
        "",
        "## Status distribution",
        "",
    ]
    lines += [f"- {k}: {v}" for k, v in sorted(status_dist.items())]
    lines += ["", "## Mode distribution", ""]
    lines += [f"- {k}: {v}" for k, v in sorted(mode_dist.items())]
    lines += ["", "## Validator history (per iteration)", ""]
    for it in result["validator_iters"]:
        lines.append(f"### Iteration {it['iteration']} — failure_count = {it['failure_count']}")
        if it["failures"]:
            lines += [f"- `{f}`" for f in it["failures"]]
        else:
            lines.append("- (green)")
        lines.append("")
    usage = _usage_totals(result["replies"])
    lines += ["## Token usage (from reply.usage where exposed)", ""]
    if usage:
        lines += [f"- {k}: {v}" for k, v in sorted(usage.items())]
    else:
        lines.append("- Not exposed on reply objects in this agentscope build.")
    lines += ["", "## Agent reply summary", ""]
    for r in result["replies"]:
        texts = [b.get("text", "") for b in r["blocks"] if b.get("text")]
        preview = (texts[-1][:600] + "...") if texts and len(texts[-1]) > 600 else (texts[-1] if texts else "(no text block)")
        lines.append(f"### {r['agent']} round {r['round']} ({r.get('latency_s', '?')}s)")
        lines.append("")
        lines.append(preview)
        lines.append("")
    return "\n".join(lines)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("slug", help="post slug, e.g. vortex-based-mathematics")
    parser.add_argument("--extract-only", action="store_true",
                        help="run only the extractor stage")
    parser.add_argument("--verifier-only", action="store_true",
                        help="skip extraction; reuse existing ledger in run dir")
    parser.add_argument("--expand", metavar="START-END",
                        help="second-pass extraction over a line range, appending claims")
    args = parser.parse_args()

    run_dir = T.RUNS_DIR / args.slug
    run_dir.mkdir(parents=True, exist_ok=True)
    T.set_trace_file(run_dir / "trace.jsonl")
    t0 = time.monotonic()
    if args.verifier_only:
        from qe_agents.pipeline import run_verifier_only
        result = await run_verifier_only(args.slug, run_dir)
    elif args.expand:
        from qe_agents.pipeline import run_expansion
        start_s, end_s = args.expand.split("-")
        replies = await run_expansion(args.slug, run_dir, int(start_s), int(end_s))
        ledger = json.loads(
            (run_dir / f"{args.slug}-albedo-ledger.json").read_text())
        result = {"slug": args.slug,
                  "ledger_path": str(run_dir / f"{args.slug}-albedo-ledger.json"),
                  "ledger": ledger, "replies": replies,
                  "validator_iters": [],
                  "final_validation": T.validate_ledger(
                      f"quality-engine/agents/runs/{args.slug}"),
                  "model_calls": __import__("qe_agents.pipeline",
                                            fromlist=["MODEL_CALLS"]).MODEL_CALLS["count"]}
    elif args.extract_only:
        from qe_agents.pipeline import run_extractor
        replies = await run_extractor(args.slug, run_dir)
        ledger = json.loads(
            (run_dir / f"{args.slug}-albedo-ledger.json").read_text())
        result = {"slug": args.slug,
                  "ledger_path": str(run_dir / f"{args.slug}-albedo-ledger.json"),
                  "ledger": ledger, "replies": replies,
                  "validator_iters": [],
                  "final_validation": T.validate_ledger(
                      f"quality-engine/agents/runs/{args.slug}"),
                  "model_calls": __import__("qe_agents.pipeline",
                                            fromlist=["MODEL_CALLS"]).MODEL_CALLS["count"]}
    else:
        result = await run_pipeline(args.slug, run_dir)
    wall = time.monotonic() - t0

    # Prefer the disk-flushed trace (accumulates across staged runs/timeouts).
    tool_trace = T.TRACE
    trace_jsonl = run_dir / "trace.jsonl"
    if trace_jsonl.exists():
        tool_trace = [json.loads(ln) for ln in trace_jsonl.read_text().splitlines() if ln.strip()]
    trace = {
        "slug": args.slug,
        "wall_time_s": round(wall, 1),
        "model_calls": result["model_calls"],
        "tool_trace": tool_trace,
        "replies": result["replies"],
        "validator_iters": result["validator_iters"],
    }
    (run_dir / "trace.json").write_text(json.dumps(trace, indent=1, ensure_ascii=False))
    (run_dir / "RUN-REPORT.md").write_text(build_report(result))

    fv = result["final_validation"]
    print(f"DONE slug={args.slug} claims={len(result['ledger']['claims'])} "
          f"final_failures={fv['failure_count']} model_calls={result['model_calls']} "
          f"wall={wall:.0f}s")
    if fv["failure_count"]:
        print("REMAINING FAILURES:")
        for f in fv["failures"]:
            print(f"  - {f}")


if __name__ == "__main__":
    asyncio.run(main())
