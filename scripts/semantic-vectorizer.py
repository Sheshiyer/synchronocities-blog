#!/usr/bin/env python3
"""
semantic-vectorizer.py
──────────────────────
Semantic similarity layer for the Noesis blog corpus.

SINGLE EMBEDDING LANGUAGE: e5-v5 (nvidia/nv-embedqa-e5-v5, 1024-d, cosine),
served by the Cloudflare Worker `synchronocities-ai` — the same model that
embeds the production Vectorize index `synchronocities-corpus`. The local
MiniLM stack (384-d, sentence-transformers) was removed (ISSUE-03+10) because
it produced incomparable scores against the production index.

Default path: embeds each post via the Worker's admin-gated diagnostic route
    POST /test/eval-embed   {texts, model, input_type} -> {vectors, dimensions}
using the production text form (title + excerpt + cleaned body[:800], mirroring
workers/src/lib/posts.ts buildEmbedText). Auth: X-Admin-Key header, loaded from
the ADMIN_API_KEY env var or workers/.env (never printed, never committed).

Usage:
    python scripts/semantic-vectorizer.py                  # default: Worker e5-v5
    python scripts/semantic-vectorizer.py --base-url URL   # e.g. http://localhost:8787
    python scripts/semantic-vectorizer.py --offline        # local e5 fallback (see below)

--offline is an escape hatch only: it needs `sentence-transformers` installed
and uses intfloat/e5-large-v2 (1024-d, cosine) — same e5 family as production.
It is NOT the default and is not required for normal operation.

Output:
    docs/semantic-similarity-report.json
"""

import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = REPO_ROOT / "src" / "content" / "posts"
OUTPUT_DIR = REPO_ROOT / "docs"
OUTPUT_FILE = OUTPUT_DIR / "semantic-similarity-report.json"
WORKERS_ENV_FILE = REPO_ROOT / "workers" / ".env"

# ── Embedding configuration (single embedding language) ─────────────────────
DEFAULT_BASE_URL = "https://synchronocities-ai.sheshnarayan-iyer.workers.dev"
EMBED_MODEL = "nvidia/nv-embedqa-e5-v5"
EMBED_MODEL_LABEL = "e5-v5"
EMBED_DIMS = 1024
EMBED_METRIC = "cosine"
EMBED_INPUT_TYPE = "passage"
BATCH_SIZE = 32
MAX_BODY_CHARS = 800  # mirrors MAX_BODY_CHARS in workers/src/lib/posts.ts

# ── Canonical PASS posts (from Cosmological Alignment Report) ───────────────
CANONICAL_PASS = [
    "seventeen-ways-pattern-repeats.md",
    "why-insight-isnt-change.md",
    "you-dont-need-more-frameworks.md",
    "repetition-is-architecture.md",
]

# ── Thresholds ───────────────────────────────────────────────────────────────
OK_THRESHOLD = 0.65      # cosine similarity >= 0.65 → OK
WARNING_THRESHOLD = 0.45  # >= 0.45 and < 0.65 → WARNING
# < 0.45 → Drift

# ── Frontmatter / text helpers ───────────────────────────────────────────────

def split_frontmatter(text: str) -> tuple[str, str]:
    """Split a markdown post into (frontmatter_yaml, body)."""
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            return parts[1], parts[2].strip()
    return "", text.strip()


def parse_frontmatter_field(frontmatter: str, field: str) -> str:
    """Extract a scalar frontmatter field without a YAML dependency.

    Tries PyYAML first (if installed); falls back to a line regex that handles
    the simple `key: value` (optionally quoted) form used by post frontmatter.
    """
    if not frontmatter:
        return ""
    try:
        import yaml  # type: ignore

        loaded = yaml.safe_load(frontmatter)
        if isinstance(loaded, dict) and loaded.get(field):
            return str(loaded[field]).strip()
        return ""
    except ImportError:
        m = re.search(rf"^\s*{re.escape(field)}\s*:\s*(.+?)\s*$", frontmatter, re.MULTILINE)
        if not m:
            return ""
        return m.group(1).strip().strip('"').strip("'")


def clean_body_for_embedding(body: str) -> str:
    """Mirror of cleanBodyForEmbedding() in workers/src/lib/posts.ts.

    Order matters: remove fenced code blocks FIRST so their interior (which
    may legitimately contain `#`, `[brackets]`, or list markers) is excised
    whole, not partially mutated by later regexes.
    """
    body = re.sub(r"```[\s\S]*?```", "", body)      # code blocks (must run first)
    body = re.sub(r"^#+\s+", "", body, flags=re.MULTILINE)  # headers
    body = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", body)    # link text only
    body = re.sub(r"^\s*[-*]\s+", "", body, flags=re.MULTILINE)  # list markers
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body.strip()


def build_embed_text(raw_text: str) -> tuple[str, str]:
    """Build the production embed text (title + excerpt + cleaned body[:800]).

    Mirrors buildEmbedText() in workers/src/lib/posts.ts so local QA scores
    live in the same vector space as the production Vectorize index.
    Returns (embed_text, full_body) — the full body is kept for word_count.
    """
    frontmatter, body = split_frontmatter(raw_text)
    title = parse_frontmatter_field(frontmatter, "title")
    excerpt = parse_frontmatter_field(frontmatter, "excerpt")
    parts = [p for p in (title, excerpt) if p]
    if body:
        parts.append(clean_body_for_embedding(body)[:MAX_BODY_CHARS])
    return "\n\n".join(parts), body


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors (stdlib only)."""
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


# ── Admin key loading ────────────────────────────────────────────────────────

def load_admin_key() -> str:
    """Load ADMIN_API_KEY from the environment, falling back to workers/.env.

    The key is never printed. Fails loudly when unavailable.
    """
    key = os.environ.get("ADMIN_API_KEY", "").strip()
    if key:
        return key
    if WORKERS_ENV_FILE.exists():
        for line in WORKERS_ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, _, value = line.partition("=")
            if name.strip() == "ADMIN_API_KEY":
                return value.strip().strip('"').strip("'")
    print(
        "[ERROR] ADMIN_API_KEY not found. Export it or add it to workers/.env — "
        "the Worker auth-gates /test/* routes via the X-Admin-Key header.",
        file=sys.stderr,
    )
    sys.exit(2)


# ── Worker embedding client ─────────────────────────────────────────────────

class EmbedError(Exception):
    """Non-retryable embedding failure (auth, bad request, shape mismatch)."""


# Cloudflare Bot Management (error 1010) rejects non-browser user agents on
# this zone; mirror the browser-like UA used by workers/scripts/eval-embed.py.
USER_AGENT = (
    "synchronocities-qa/2.0 "
    "(Mozilla/5.0 AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36)"
)


def _post_eval_embed(base_url: str, admin_key: str, texts: list[str]) -> dict:
    """One HTTP attempt against POST /test/eval-embed. Returns parsed JSON."""
    payload = json.dumps(
        {"texts": texts, "model": EMBED_MODEL, "input_type": EMBED_INPUT_TYPE}
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/test/eval-embed",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
            "X-Admin-Key": admin_key,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read())


def _embed_batch_with_retry(base_url: str, admin_key: str, texts: list[str]) -> list[list[float]]:
    """Embed one batch with backoff on 5xx/network errors; halve-split on the
    NIM 512-token cap (same strategy as workers/src/routes/embed-batch.ts)."""
    backoff = [1, 2, 4, 8]
    last_err: Exception | None = None
    for attempt in range(len(backoff) + 1):
        try:
            data = _post_eval_embed(base_url, admin_key, texts)
            vectors = data.get("vectors") or []
            dims = data.get("dimensions") or 0
            if len(vectors) != len(texts):
                raise EmbedError(
                    f"worker returned {len(vectors)} vectors for {len(texts)} texts"
                )
            if dims != EMBED_DIMS:
                raise EmbedError(
                    f"unexpected embedding dims {dims} (expected {EMBED_DIMS}) — "
                    f"is the Worker still on {EMBED_MODEL}?"
                )
            return vectors
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", errors="replace")[:300]
            except Exception:
                pass
            if e.code in (401, 403):
                raise EmbedError(
                    f"auth rejected (HTTP {e.code}) — check ADMIN_API_KEY. {detail}"
                ) from e
            if e.code == 400 and "exceeds maximum allowed token size" in detail:
                # NIM 512-token cap: halve the batch and retry smaller pieces.
                if len(texts) == 1:
                    halved = texts[0][: max(50, len(texts[0]) // 2)]
                    print(
                        f"[WARN] text exceeds NIM token cap — halving to {len(halved)} chars and retrying",
                        file=sys.stderr,
                    )
                    return _embed_batch_with_retry(base_url, admin_key, [halved])
                mid = len(texts) // 2
                return _embed_batch_with_retry(base_url, admin_key, texts[:mid]) + \
                    _embed_batch_with_retry(base_url, admin_key, texts[mid:])
            if 500 <= e.code < 600:
                last_err = EmbedError(f"worker HTTP {e.code}: {detail}")
            else:
                raise EmbedError(f"worker HTTP {e.code}: {detail}") from e
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last_err = EmbedError(f"network/parse error: {e}")
        if attempt < len(backoff):
            wait = backoff[attempt]
            print(f"[WARN] embed attempt {attempt + 1} failed ({last_err}); retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise EmbedError(f"embedding failed after retries: {last_err}")


def encode_texts_worker(base_url: str, admin_key: str, texts: list[str]) -> list[list[float]]:
    """Encode all texts through the Worker in BATCH_SIZE chunks."""
    all_vectors: list[list[float]] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        vectors = _embed_batch_with_retry(base_url, admin_key, batch)
        all_vectors.extend(vectors)
        print(f"[INFO]   embedded {len(all_vectors)}/{len(texts)} texts")
    return all_vectors


# ── Optional offline fallback (escape hatch, NOT the default) ───────────────

def encode_texts_offline(texts: list[str]) -> list[list[float]]:
    """Fully-offline fallback using sentence-transformers intfloat/e5-large-v2
    (1024-d, cosine — same e5 family as production). Requires the optional
    `sentence-transformers` package; not needed for the default Worker path."""
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
    except ImportError:
        print(
            "[ERROR] --offline requires `pip install sentence-transformers`. "
            "The default path (Worker e5-v5) needs no local model — prefer it.",
            file=sys.stderr,
        )
        sys.exit(2)
    print("[INFO] Loading offline model: intfloat/e5-large-v2 …")
    model = SentenceTransformer("intfloat/e5-large-v2")
    vectors = []
    for i in range(0, len(texts), 16):
        batch = [f"passage: {t}" for t in texts[i : i + 16]]
        vectors.extend(model.encode(batch, convert_to_numpy=True, show_progress_bar=False).tolist())
        print(f"[INFO]   embedded {len(vectors)}/{len(texts)} texts (offline)")
    return vectors


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    offline = "--offline" in args
    base_url = DEFAULT_BASE_URL
    if "--base-url" in args:
        idx = args.index("--base-url")
        try:
            base_url = args[idx + 1]
        except IndexError:
            print("[ERROR] --base-url requires a URL argument", file=sys.stderr)
            sys.exit(2)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Find all posts
    post_paths = sorted(POSTS_DIR.glob("*.md"))
    if not post_paths:
        print(f"[ERROR] No markdown posts found in {POSTS_DIR}", file=sys.stderr)
        sys.exit(1)

    print(f"[INFO] Found {len(post_paths)} posts.")

    # Resolve canonical paths
    canonical_paths = [POSTS_DIR / name for name in CANONICAL_PASS]
    missing = [p.name for p in canonical_paths if not p.exists()]
    if missing:
        print(f"[WARN] Missing canonical posts: {missing}", file=sys.stderr)
        canonical_paths = [p for p in canonical_paths if p.exists()]
        if not canonical_paths:
            print("[ERROR] No canonical reference posts available.", file=sys.stderr)
            sys.exit(1)

    # Build embed texts (production form: title + excerpt + cleaned body[:800])
    post_names = [p.name for p in post_paths]
    raw_texts = [p.read_text(encoding="utf-8") for p in post_paths]
    all_embed_texts: list[str] = []
    all_bodies: list[str] = []
    for raw in raw_texts:
        embed_text, body = build_embed_text(raw)
        all_embed_texts.append(embed_text)
        all_bodies.append(body)
    # Canonical references, in CANONICAL_PASS order for stable reporting
    canonical_embed_texts = [
        all_embed_texts[post_names.index(p.name)] for p in canonical_paths
    ]

    # Encode corpus and canonical references
    if offline:
        print("[INFO] Backend: OFFLINE intfloat/e5-large-v2 (escape hatch)")
        corpus_embeddings = encode_texts_offline(all_embed_texts)
        canonical_embeddings = encode_texts_offline(canonical_embed_texts)
        embed_source = "offline sentence-transformers intfloat/e5-large-v2"
    else:
        admin_key = load_admin_key()
        print(f"[INFO] Backend: Worker e5-v5 via {base_url}/test/eval-embed")
        print(f"[INFO] Encoding {len(all_embed_texts)} corpus posts …")
        corpus_embeddings = encode_texts_worker(base_url, admin_key, all_embed_texts)
        print(f"[INFO] Encoding {len(canonical_embed_texts)} canonical reference posts …")
        canonical_embeddings = encode_texts_worker(base_url, admin_key, canonical_embed_texts)
        embed_source = f"{base_url.rstrip('/')}/test/eval-embed ({EMBED_MODEL})"

    # Compute per-post max similarity to any canonical reference
    results = []
    for idx, post_path in enumerate(post_paths):
        post_name = post_path.name
        post_emb = corpus_embeddings[idx]

        similarities = [cosine_similarity(post_emb, ref_emb) for ref_emb in canonical_embeddings]
        max_sim = max(similarities)
        best_canonical = CANONICAL_PASS[similarities.index(max_sim)]

        if max_sim >= OK_THRESHOLD:
            classification = "OK"
        elif max_sim >= WARNING_THRESHOLD:
            classification = "WARNING"
        else:
            classification = "Drift"

        # Word count for metadata (full body, frontmatter stripped)
        word_count = len(all_bodies[idx].split())

        results.append({
            "post": post_name,
            "max_similarity": round(max_sim, 4),
            "best_canonical_match": best_canonical,
            "classification": classification,
            "word_count": word_count,
            "similarities_to_all_canonicals": {
                CANONICAL_PASS[i]: round(sim, 4)
                for i, sim in enumerate(similarities)
            },
        })

    # Aggregate stats
    ok_count = sum(1 for r in results if r["classification"] == "OK")
    warn_count = sum(1 for r in results if r["classification"] == "WARNING")
    drift_count = sum(1 for r in results if r["classification"] == "Drift")

    report = {
        "report_type": "semantic_similarity",
        "model": EMBED_MODEL_LABEL,
        "embedding_model": EMBED_MODEL,
        "embedding_dims": EMBED_DIMS,
        "metric": EMBED_METRIC,
        "embedding_source": embed_source,
        "note": (
            "Single embedding language: e5-v5 (1024-d, cosine) via the "
            "synchronocities-ai Worker — the same model that embeds the "
            "production Vectorize index. The local MiniLM stack was removed."
        ),
        "canonical_pass_posts": [p.name for p in canonical_paths],
        "thresholds": {
            "ok": OK_THRESHOLD,
            "warning": WARNING_THRESHOLD,
        },
        "total_posts": len(results),
        "ok_count": ok_count,
        "warning_count": warn_count,
        "drift_count": drift_count,
        "posts": results,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\n[INFO] Semantic similarity report written to: {OUTPUT_FILE}")
    print(f"       OK: {ok_count}  |  WARNING: {warn_count}  |  Drift: {drift_count}")

    if drift_count > 0:
        print(f"\n[INFO] Posts classified as Drift (may need TF-IDF reclassification review):")
        for r in results:
            if r["classification"] == "Drift":
                print(f"       • {r['post']} (sim={r['max_similarity']})")


if __name__ == "__main__":
    main()
