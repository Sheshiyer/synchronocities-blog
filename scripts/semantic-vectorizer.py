#!/usr/bin/env python3
"""
semantic-vectorizer.py
──────────────────────
Semantic similarity layer for the Noesis blog corpus.
Loads all 125 posts, encodes them with sentence-transformers (all-MiniLM-L6-v2),
compares each against 4 canonical PASS posts, and outputs a JSON report with
per-post semantic similarity scores and re-classifications (OK / WARNING / Drift).

Usage:
    python scripts/semantic-vectorizer.py

Output:
    docs/semantic-similarity-report.json
"""

import json
import os
import re
import sys
from pathlib import Path

import numpy as np

# ── Paths ────────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = REPO_ROOT / "src" / "content" / "posts"
OUTPUT_DIR = REPO_ROOT / "docs"
OUTPUT_FILE = OUTPUT_DIR / "semantic-similarity-report.json"

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

# ── Helpers ────────────────────────────────────────────────────────────────────

def strip_frontmatter(text: str) -> str:
    """Remove YAML frontmatter from a markdown post."""
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            return parts[2].strip()
    return text.strip()


def load_post_text(path: Path) -> str:
    """Read a post and strip its frontmatter."""
    with open(path, "r", encoding="utf-8") as f:
        return strip_frontmatter(f.read())


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    if norm == 0:
        return 0.0
    return float(np.dot(a, b) / norm)


def encode_texts(model, texts: list[str], batch_size: int = 16) -> np.ndarray:
    """Encode a list of texts using sentence-transformers, batched."""
    embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        embeddings.append(model.encode(batch, convert_to_numpy=True, show_progress_bar=False))
    return np.vstack(embeddings)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
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

    # Load texts
    all_texts = [load_post_text(p) for p in post_paths]
    canonical_texts = [load_post_text(p) for p in canonical_paths]

    # Import sentence-transformers (already installed by pip in the environment)
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as exc:
        print(f"[ERROR] sentence-transformers not installed: {exc}", file=sys.stderr)
        sys.exit(1)

    model_name = "all-MiniLM-L6-v2"
    print(f"[INFO] Loading model: {model_name} …")
    model = SentenceTransformer(model_name)

    # Encode corpus and canonical references
    print(f"[INFO] Encoding {len(all_texts)} corpus posts …")
    corpus_embeddings = encode_texts(model, all_texts)
    print(f"[INFO] Encoding {len(canonical_texts)} canonical reference posts …")
    canonical_embeddings = encode_texts(model, canonical_texts)

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

        # Word count for metadata
        word_count = len(all_texts[idx].split())

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
        "model": model_name,
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
