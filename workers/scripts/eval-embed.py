#!/usr/bin/env python3
"""
Trio-tuning eval — recall@5 across candidate embedding models.

For each candidate embed model:
  1. POST all 125 corpus passages to /test/eval-embed → vectors
  2. POST ~20 queries (mined from canonical_questions frontmatter) → vectors
  3. Compute cosine similarity matrix (queries × passages)
  4. For each query, check if the expected slug is in the top-5 most-similar
  5. Report: recall@5, MRR (mean reciprocal rank), p50/p95 latency, dims, cost

Standard library only — no numpy / no torch / no openai.

Usage:
  bun -e ''                                          # ensure bun is on PATH for parity
  python3 workers/scripts/eval-embed.py              # full eval against deployed Worker
  python3 workers/scripts/eval-embed.py --local      # against http://localhost:8787
  python3 workers/scripts/eval-embed.py --quick      # one model only (e5-v5) for sanity
"""

from __future__ import annotations
import json
import math
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
import yaml

# ─────────────────────────────────────────────────────────────────────────────
# Args
# ─────────────────────────────────────────────────────────────────────────────

LOCAL = '--local' in sys.argv
QUICK = '--quick' in sys.argv
SKIP_REACHABILITY = '--skip-reachability-check' in sys.argv

BASE_URL = 'http://localhost:8787' if LOCAL else 'https://synchronocities-ai.tirak-court.workers.dev'

# Candidates to evaluate. Order = report order.
CANDIDATES = [
    'nvidia/nv-embedqa-e5-v5',              # current default — 1024-d
    'nvidia/nv-embedqa-mistral-7b-v2',      # 4096-d, the original ambitious pick
    'nvidia/nv-embed-v1',                   # general retrieval embedding
]
if QUICK:
    CANDIDATES = CANDIDATES[:1]

# ─────────────────────────────────────────────────────────────────────────
# Pre-flight reachability filter — drops candidates not in the snapshot.
# Avoids wasting NIM calls on models that will 404. See companion script
# workers/scripts/probe-catalog.ts which writes .reachable-models.txt.
# ─────────────────────────────────────────────────────────────────────────

def filter_reachable_candidates(candidates: list[str]) -> list[str]:
    if SKIP_REACHABILITY:
        print(f"⚠️  reachability check SKIPPED — --skip-reachability-check passed")
        return candidates
    snapshot = Path(__file__).resolve().parents[1] / '.reachable-models.txt'
    if not snapshot.exists():
        print(f"✗ Reachability snapshot missing: {snapshot}", file=sys.stderr)
        print(f"  Run: bun workers/scripts/probe-catalog.ts", file=sys.stderr)
        sys.exit(2)
    age_hours = (time.time() - snapshot.stat().st_mtime) / 3600
    reachable = {l.strip() for l in snapshot.read_text().splitlines() if l.strip()}
    kept, dropped = [], []
    for c in candidates:
        (kept if c in reachable else dropped).append(c)
    if dropped:
        for d in dropped:
            print(f"  ⏭  {d} — NOT in reachable snapshot, skipping")
    if not kept:
        print(f"✗ All candidates unreachable. Snapshot is {age_hours:.1f}h old.", file=sys.stderr)
        sys.exit(2)
    if age_hours > 48:
        print(f"⚠️  reachability snapshot is {age_hours:.1f}h old (>48h); consider re-probing")
    print(f"✓ {len(kept)}/{len(candidates)} candidates reachable (snapshot {age_hours:.1f}h old)")
    return kept

# ─────────────────────────────────────────────────────────────────────────────
# Paths + frontmatter parsing
# ─────────────────────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parents[2]
POSTS_DIR = REPO_ROOT / 'src' / 'content' / 'posts'

def parse_frontmatter(text: str) -> dict:
    """Extract YAML frontmatter from a markdown file. Returns {} if missing or broken."""
    if not text.startswith('---\n'):
        return {}
    end = text.find('\n---', 4)
    if end < 0:
        return {}
    try:
        loaded = yaml.safe_load(text[4:end])
        return loaded if isinstance(loaded, dict) else {}
    except yaml.YAMLError:
        return {}

def load_posts() -> list[dict]:
    """Return [{slug, title, passage}] for every .md in posts/."""
    posts = []
    for p in sorted(POSTS_DIR.glob('*.md')):
        text = p.read_text()
        fm = parse_frontmatter(text)
        # Extract body (after frontmatter)
        body_match = re.search(r'^---\n[\s\S]*?\n---\n([\s\S]*)$', text)
        body = (body_match.group(1) if body_match else text).strip()
        # Strip markdown to plain text for first 500 chars
        body_plain = re.sub(r'```[\s\S]*?```', '', body)  # drop code blocks
        body_plain = re.sub(r'[#*_`]+', '', body_plain)    # strip md syntax
        body_plain = re.sub(r'\s+', ' ', body_plain).strip()[:500]
        title = fm.get('title', p.stem)
        excerpt = fm.get('excerpt', '')
        passage = f"{title}\n\n{excerpt}\n\n{body_plain}".strip()
        posts.append({
            'slug': p.stem,
            'title': title,
            'passage': passage,
        })
    return posts

def load_eval_pairs() -> list[dict]:
    """Build query→expected_slug pairs from canonical_questions frontmatter.
    Picks up to 2 questions per post, max 25 pairs total."""
    pairs = []
    posts_with_q = []
    for p in sorted(POSTS_DIR.glob('*.md')):
        fm = parse_frontmatter(p.read_text())
        qs = (fm.get('llm') or {}).get('canonical_questions') or []
        if qs:
            posts_with_q.append((p.stem, qs))
    # Pick up to 2 from each post
    for slug, qs in posts_with_q:
        for q in qs[:2]:
            pairs.append({'query': q, 'expected_slug': slug})
            if len(pairs) >= 25:
                return pairs
    return pairs

# ─────────────────────────────────────────────────────────────────────────────
# HTTP
# ─────────────────────────────────────────────────────────────────────────────

USER_AGENT = (
    'synchronocities-eval/1.0 '
    '(Mozilla/5.0 AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36)'
)

def call_embed(texts: list[str], model: str, input_type: str) -> dict:
    """POST /test/eval-embed. Returns the full response dict."""
    body = json.dumps({'texts': texts, 'model': model, 'input_type': input_type}).encode()
    req = urllib.request.Request(
        f'{BASE_URL}/test/eval-embed',
        data=body,
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': USER_AGENT,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {'error': f'HTTP {e.code}', 'detail': e.read().decode()[:300]}
    except Exception as e:
        return {'error': str(e)}

# ─────────────────────────────────────────────────────────────────────────────
# Cosine similarity (stdlib only)
# ─────────────────────────────────────────────────────────────────────────────

def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * p
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)

def main():
    print(f"▸ Pre-flight reachability gate")
    candidates = filter_reachable_candidates(CANDIDATES)
    print()

    print(f"▸ Loading corpus from {POSTS_DIR}")
    posts = load_posts()
    print(f"  {len(posts)} posts")

    print(f"▸ Building query/slug eval pairs from canonical_questions")
    pairs = load_eval_pairs()
    print(f"  {len(pairs)} pairs")
    print()

    passages = [p['passage'] for p in posts]
    slugs = [p['slug'] for p in posts]
    queries = [pair['query'] for pair in pairs]
    expected = [pair['expected_slug'] for pair in pairs]

    print(f"▸ Hitting {BASE_URL}/test/eval-embed for {len(candidates)} model(s)")
    print()

    results = []

    for model in candidates:
        print(f"── {model}")
        # Embed passages
        t0 = time.time()
        p_resp = call_embed(passages, model, 'passage')
        p_ms = (time.time() - t0) * 1000
        if 'error' in p_resp:
            print(f"  passages FAILED: {p_resp.get('error')} {p_resp.get('detail','')[:120]}")
            print()
            continue
        passage_vecs = p_resp['vectors']
        dims = p_resp['dimensions']
        print(f"  passages: {len(passage_vecs)} × {dims}d in {p_ms:.0f}ms (worker reports {p_resp['ms']}ms)")

        # Embed queries
        t0 = time.time()
        q_resp = call_embed(queries, model, 'query')
        q_ms = (time.time() - t0) * 1000
        if 'error' in q_resp:
            print(f"  queries FAILED: {q_resp.get('error')} {q_resp.get('detail','')[:120]}")
            print()
            continue
        query_vecs = q_resp['vectors']
        print(f"  queries:  {len(query_vecs)} × {dims}d in {q_ms:.0f}ms (worker reports {q_resp['ms']}ms)")

        # Compute recall@5 + MRR
        hits_at_5 = 0
        hits_at_10 = 0
        rr_sum = 0.0
        per_query_latency = []

        # Cosine per query
        for qi, qv in enumerate(query_vecs):
            t_q = time.time()
            sims = [(slugs[pi], cosine(qv, passage_vecs[pi])) for pi in range(len(passage_vecs))]
            sims.sort(key=lambda x: -x[1])
            top10 = [s[0] for s in sims[:10]]
            expected_slug = expected[qi]
            if expected_slug in top10[:5]:
                hits_at_5 += 1
            if expected_slug in top10:
                hits_at_10 += 1
            if expected_slug in top10:
                rank = top10.index(expected_slug) + 1
                rr_sum += 1.0 / rank
            per_query_latency.append((time.time() - t_q) * 1000)

        recall_5 = hits_at_5 / len(queries) if queries else 0
        recall_10 = hits_at_10 / len(queries) if queries else 0
        mrr = rr_sum / len(queries) if queries else 0
        sorted_latencies = sorted(per_query_latency)
        p50 = percentile(sorted_latencies, 0.50)
        p95 = percentile(sorted_latencies, 0.95)

        print(f"  recall@5:  {recall_5*100:.1f}%  ({hits_at_5}/{len(queries)})")
        print(f"  recall@10: {recall_10*100:.1f}% ({hits_at_10}/{len(queries)})")
        print(f"  MRR:       {mrr:.3f}")
        print(f"  scoring latency (per query, in-process cosine): p50={p50:.1f}ms p95={p95:.1f}ms")
        print()

        results.append({
            'model': model,
            'dims': dims,
            'passages_ms_total': p_resp['ms'],
            'queries_ms_total': q_resp['ms'],
            'recall_5': recall_5,
            'recall_10': recall_10,
            'mrr': mrr,
            'p50_score_ms': p50,
            'p95_score_ms': p95,
            'hits_5': hits_at_5,
            'hits_10': hits_at_10,
            'total_queries': len(queries),
        })

    # Summary table
    print("=" * 76)
    print(f"{'model':<42} {'dims':>5}  {'r@5':>6}  {'r@10':>6}  {'MRR':>6}  {'p_ms':>6}  {'q_ms':>6}")
    print("-" * 76)
    for r in results:
        m = r['model'][:42]
        print(
            f"{m:<42} {r['dims']:>5}  "
            f"{r['recall_5']*100:>5.1f}%  "
            f"{r['recall_10']*100:>5.1f}%  "
            f"{r['mrr']:>6.3f}  "
            f"{r['passages_ms_total']:>5}ms  "
            f"{r['queries_ms_total']:>5}ms"
        )
    print("=" * 76)

    # Write artifact
    artifact = REPO_ROOT / 'workers' / '.eval-results.json'
    artifact.write_text(json.dumps({
        'base_url': BASE_URL,
        'corpus_size': len(posts),
        'queries': pairs,
        'results': results,
    }, indent=2))
    print(f"\n▸ Wrote {artifact.relative_to(REPO_ROOT)}")

if __name__ == '__main__':
    main()
