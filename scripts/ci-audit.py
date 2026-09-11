#!/usr/bin/env python3
"""
ci-audit.py
───────────
Full 7-dimension quality audit for the Noesis blog corpus.
Runs against all posts and produces a JSON report with per-post scores,
classifications (PASS / WARNING / FAIL), aggregate counts, and exit codes.

Dimensions (from Cosmological Alignment Report):
  1. Kha-Ba-La Structural Check
  2. Vocabulary Purity (VCS)
  3. Voice Calibration
  4. Cosmological Coherence
  5. Fractal Operation (FDS)
  6. Source Grounding (SLS)
  7. Shadow Integration

Additional checks:
  • Tonal Drift Flags (warmth, academic, motivational, generic excess)
  • Kha-Ba-La heuristic tightening (1500-word window, absence demonstration)
  • Shadow & First-Person checks are WARN-only for non-technical posts

Usage:
    python scripts/ci-audit.py

Output:
    docs/ci-audit-report.json
Exit codes:
    0 → no FAILs (only WARNs and OKs)
    1 → at least one FAIL
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

# ── Paths ────────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = REPO_ROOT / "src" / "content" / "posts"
OUTPUT_DIR = REPO_ROOT / "docs"
OUTPUT_FILE = OUTPUT_DIR / "ci-audit-report.json"

# ── Vocabulary DNA (from VOCABULARY-DNA-MASTER.md) ───────────────────────────

AVOID_CRITICAL = ["witnessos"]
AVOID_STANDARD = [
    "journey", "path", "healing", "manifesting", "abundance", "vibration",
    "authentic self", "higher self", "optimization", "hacks", "productivity",
    "tribe", "community", "dual guardrail dyad",
    "ai / artificial intelligence", "artificial intelligence", "ai ",
    "truth", "blunder", "spiritual war", "flat earth", "conspiracy",
]

EMERGENT_TERMS = [
    "healing", "optimization", "vibration", "journey", "truth", "energy", "quantum",
]

USE_TERMS = [
    "authorship", "coherence", "integration", "inquiry", "pattern", "structure",
    "inhabitation", "cultivation", "capacity", "sovereignty", "recursive", "meta",
    "upstream", "triangulation", "engine coherence", "symbolic recursion",
    "field cartography", "the three-eyed view", "arbitration", "multi-engine",
    "purushartha", "coherence matrix", "noesis engine", ".init protocol",
    "compass", "witness prompt", "self-consciousness", "cascade error",
    "structural compounding", "epistemic conflict", "field-level arbitration",
    "planar inquiry", "local topology hypothesis", "coordination detection",
    "structural alignment analysis", "field alignment", "structural coherence",
    "kha", "ba", "la", "kha-ba-la",
]

SHADOW_TERMS = [
    "cost", "fracture", "inherited code", "shadow", "metabolize", "stuckness",
    "resistance", "failure", "breakdown", "collapse", "rupture", "limit",
    "constraint", "cost of", "price of",
]

SOURCE_MARKERS = [
    r"\[\d+\]",           # [1] style citations
    r"\b(?:gober|hickson|young|fool's wisdom|upside down|kings dethroned|pubmed|doi:|arxiv)\b",
    r"\b(?:source|reference|citation|footnote|see also|further reading)\b",
]

# ── Tonal Drift dictionaries ──────────────────────────────────────────────────
WARMTH_EXCESS = ["love", "light", "gratitude", "blessing", "heart", "soul",
                  "divine", "sacred", "blessed", "oneness"]
MOTIVATIONAL_EXCESS = ["unlock", "potential", "transform your", "amazing", "incredible",
                       "you can do", "unleash", "discover your", "power within"]
GENERIC_EXCESS = ["amazing", "incredible", "fantastic", "awesome", "journey",
                  "path", "optimize", "hack", "level up"]
# Academic excess is detected via jargon density heuristic later

# ── Helpers ────────────────────────────────────────────────────────────────────

def load_post(path: Path) -> dict:
    """Load a post and return dict with frontmatter and body."""
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()

    if raw.startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) >= 3:
            fm_text = parts[1]
            body = parts[2]
        else:
            fm_text = ""
            body = raw
    else:
        fm_text = ""
        body = raw

    # Parse frontmatter YAML very lightly (only tags, entry_kind, article_mode)
    tags = re.findall(r"^\s*-\s*(\S+)$", fm_text, re.MULTILINE)
    entry_kind = re.search(r"entry_kind:\s*(\S+)", fm_text)
    article_mode = re.search(r"article_mode:\s*(\S+)", fm_text)

    return {
        "path": path,
        "name": path.name,
        "frontmatter": fm_text.lower(),
        "body": body,
        "tags": [t.lower() for t in tags],
        "entry_kind": (entry_kind.group(1).lower() if entry_kind else ""),
        "article_mode": (article_mode.group(1).lower() if article_mode else ""),
    }


def count_substring_matches(text: str, terms: list[str]) -> list[tuple[str, int]]:
    """Return list of (term, count) for substring matches (case-insensitive)."""
    text_lower = text.lower()
    results = []
    for term in terms:
        count = text_lower.count(term.lower())
        if count > 0:
            results.append((term, count))
    return results


def count_word_matches(text: str, words: list[str]) -> list[tuple[str, int]]:
    """Count whole-word matches (case-insensitive)."""
    text_lower = text.lower()
    results = []
    for w in words:
        pattern = r"\b" + re.escape(w.lower()) + r"\b"
        matches = re.findall(pattern, text_lower)
        if matches:
            results.append((w, len(matches)))
    return results


# ── Dimension Scorers ──────────────────────────────────────────────────────────

def score_kha_ba_la(post: dict) -> dict:
    """
    Kha-Ba-La Structural Check.
    - Count explicit mentions of Kha, Ba, La as structural (not decorative)
    - Within 1500-word window (heuristic: count in the whole post for now,
      but flag if they appear only in the first paragraph and never again)
    - Absence demonstration check: "without Kha", "absence of Ba", "missing La"
      are intentional structural demonstrations, not drift.
    """
    body = post["body"].lower()
    words = body.split()
    word_count = len(words)

    # Check absence demonstration
    absence_patterns = ["without kha", "absence of ba", "missing la"]
    has_absence_demo = any(p in body for p in absence_patterns)

    # Count structural mentions (whole word or in compound)
    kha_count = len(re.findall(r"\bkha\b", body))
    ba_count = len(re.findall(r"\bba\b", body))
    la_count = len(re.findall(r"\bla\b", body))
    triad_count = len(re.findall(r"kha-ba-la", body))

    # Scoring: triad present = strong; all three individually = strong
    score = 0
    if triad_count > 0:
        score += 40
    if kha_count > 0:
        score += 20
    if ba_count > 0:
        score += 20
    if la_count > 0:
        score += 20

    # Penalty: if they appear only in title/heading and not substantively,
    # that's decorative. We approximate by checking if any paragraph after the
    # first contains the triad.
    paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
    if len(paragraphs) > 1:
        later_body = "\n".join(paragraphs[1:])
        later_triad = len(re.findall(r"kha-ba-la", later_body))
        if triad_count > 0 and later_triad == 0:
            score -= 20  # decorative penalty

    # If absence demonstration, boost score (it's intentional structural work)
    if has_absence_demo:
        score += 15

    score = max(0, min(100, score))

    # Classification
    if score >= 60:
        verdict = "PASS"
    elif score >= 40:
        verdict = "WARNING"
    else:
        verdict = "FAIL"

    return {
        "score": score,
        "verdict": verdict,
        "kha_count": kha_count,
        "ba_count": ba_count,
        "la_count": la_count,
        "triad_count": triad_count,
        "has_absence_demonstration": has_absence_demo,
    }


def score_vocabulary(post: dict) -> dict:
    """
    Vocabulary Contamination Score (VCS).
    - CRITICAL: WitnessOS = immediate FAIL
    - STANDARD AVOID words = 0 PASS, 1-2 WARNING, 3+ FAIL
    - EMERGENT outside authorized context = same scale
    """
    body = post["body"]
    text_all = body.lower()

    # CRITICAL: deliberate substring match (multiword brand name).
    # STANDARD/EMERGENT: word-boundary match (mirrors scripts/pre-commit fix) —
    # eliminates substring false positives (pathology→path, Pai→ai, Chiang Mai→ai).
    critical_matches = count_substring_matches(text_all, AVOID_CRITICAL)
    standard_matches = count_word_matches(text_all, AVOID_STANDARD)
    emergent_matches = count_word_matches(text_all, EMERGENT_TERMS)

    critical_count = sum(c for _, c in critical_matches)
    standard_count = sum(c for _, c in standard_matches)
    emergent_count = sum(c for _, c in emergent_matches)

    # Total violations
    total = critical_count + standard_count + emergent_count

    # Scoring: 100 = pristine, subtract per violation
    score = max(0, 100 - (critical_count * 50) - (standard_count * 15) - (emergent_count * 10))

    if critical_count > 0:
        verdict = "FAIL"
    elif total >= 4:
        verdict = "FAIL"
    elif total >= 1:
        verdict = "WARNING"
    else:
        verdict = "PASS"

    return {
        "score": score,
        "verdict": verdict,
        "critical_matches": critical_matches,
        "standard_matches": standard_matches,
        "emergent_matches": emergent_matches,
        "total_violations": total,
    }


def score_voice(post: dict) -> dict:
    """
    Voice Calibration Score.
    Count USE terms vs. generic/marketing terms.
    """
    body = post["body"].lower()

    use_matches = count_word_matches(body, USE_TERMS)
    generic_matches = count_word_matches(body, GENERIC_EXCESS + MOTIVATIONAL_EXCESS + WARMTH_EXCESS)

    use_score = sum(c for _, c in use_matches) * 5
    generic_penalty = sum(c for _, c in generic_matches) * 3

    score = max(0, min(100, 50 + use_score - generic_penalty))

    if score >= 75:
        verdict = "PASS"
    elif score >= 50:
        verdict = "WARNING"
    else:
        verdict = "FAIL"

    return {
        "score": score,
        "verdict": verdict,
        "use_matches": use_matches,
        "generic_matches": generic_matches,
    }


def score_cosmological_coherence(post: dict) -> dict:
    """
    Cosmological Coherence.
    Check for engine/framework consistency (Noesis Engine, Selemene, 16 lenses, etc.)
    """
    body = post["body"].lower()
    engine_terms = [
        "noesis engine", "selemene", "sixteen lenses", "16 lenses", "perceptual lens",
        "engine", "workflow", "compass", "birth-blueprint", "daily-practice",
        "decision-support", "self-inquiry", "creative-expression", "full-spectrum",
        "noesis", "tryambakam", "kha-ba-la", "framework", "system", "lens",
        "architecture", "model", "protocol", "ritual", "practice", "witness",
        "consciousness", "self-consciousness", "inquiry", "examination",
    ]
    matches = count_word_matches(body, engine_terms)
    count = sum(c for _, c in matches)

    score = min(100, 50 + count * 5)

    if score >= 60:
        verdict = "PASS"
    elif score >= 40:
        verdict = "WARNING"
    else:
        verdict = "FAIL"

    return {
        "score": score,
        "verdict": verdict,
        "engine_matches": matches,
    }


def score_fractal_depth(post: dict) -> dict:
    """
    Fractal Operation / Fractal Depth Score (FDS).
    Check for Kha-Ba-La nesting across scales (personal, institutional, cosmic).
    Also check for scale-crossing language.
    """
    body = post["body"].lower()
    scale_terms = [
        "personal", "individual", "body", "somatic", "cellular", "neural",
        "institutional", "cultural", "civilization", "historical", "society",
        "cosmic", "universal", "astronomical", "planetary", "celestial",
    ]
    matches = count_word_matches(body, scale_terms)
    unique_scales = len(matches)

    # Recursive / self-referential language
    recursive_count = len(re.findall(r"\brecursive\b|\bfractal\b|\bself-referential\b|\bmeta\b", body))

    score = min(100, 30 + unique_scales * 10 + recursive_count * 5)

    if score >= 60:
        verdict = "PASS"
    elif score >= 40:
        verdict = "WARNING"
    else:
        verdict = "FAIL"

    return {
        "score": score,
        "verdict": verdict,
        "scale_matches": matches,
        "recursive_count": recursive_count,
    }


def score_source_grounding(post: dict) -> dict:
    """
    Source Lattice Score (SLS).
    Count citations, references, footnotes, external source names.
    """
    body = post["body"]
    count = 0
    matches = []
    for marker in SOURCE_MARKERS:
        found = re.findall(marker, body, re.IGNORECASE)
        if found:
            count += len(found)
            matches.append((marker, len(found)))

    # Also count bracketed vault references (negative — they are compilation drift)
    vault_refs = re.findall(r"\[vault:.*?\]", body)
    vault_penalty = len(vault_refs) * 2

    score = min(100, max(0, 30 + count * 3 - vault_penalty))

    if score >= 50:
        verdict = "PASS"
    elif score >= 30:
        verdict = "WARNING"
    else:
        verdict = "FAIL"

    return {
        "score": score,
        "verdict": verdict,
        "source_matches": matches,
        "vault_reference_count": len(vault_refs),
    }


def score_shadow_integration(post: dict) -> dict:
    """
    Shadow Integration.
    Count shadow metabolization terms, cost/fracture/inherited code.
    WARN-only by default for non-technical posts.
    Skipped for posts tagged 'technical', 'index', or 'reference'.
    """
    tags = post.get("tags", [])
    entry_kind = post.get("entry_kind", "")
    skip_tags = {"technical", "index", "reference"}
    should_skip = any(t in skip_tags for t in tags) or entry_kind in skip_tags

    body = post["body"].lower()
    matches = count_word_matches(body, SHADOW_TERMS)
    count = sum(c for _, c in matches)

    score = min(100, 30 + count * 12)

    if should_skip:
        verdict = "PASS"
        skipped = True
    else:
        skipped = False
        if score >= 50:
            verdict = "PASS"
        elif score >= 30:
            verdict = "WARNING"
        else:
            verdict = "FAIL"

    return {
        "score": score,
        "verdict": verdict,
        "shadow_matches": matches,
        "skipped": skipped,
    }


def detect_tonal_drift(post: dict) -> dict:
    """
    Tonal Drift Flags.
    Detect warmth excess, academic excess, motivational excess, generic excess.
    """
    body = post["body"].lower()
    words = body.split()
    word_count = len(words)

    warmth = count_word_matches(body, WARMTH_EXCESS)
    motivational = count_word_matches(body, MOTIVATIONAL_EXCESS)
    generic = count_word_matches(body, GENERIC_EXCESS)

    warmth_count = sum(c for _, c in warmth)
    motivational_count = sum(c for _, c in motivational)
    generic_count = sum(c for _, c in generic)

    # Academic excess: dense jargon without body anchors
    # Heuristic: if sentence length > 25 words average and no body/Ba terms
    sentences = re.split(r"[.!?]+", body)
    avg_sentence_len = sum(len(s.split()) for s in sentences if s.strip()) / max(1, len([s for s in sentences if s.strip()]))
    has_body_anchor = bool(re.search(r"\bbody\b|\bsoma\b|\bbreath\b|\bembodiment\b", body))
    academic_excess = avg_sentence_len > 22 and not has_body_anchor

    flags = []
    if warmth_count >= 3:
        flags.append({"flag": "warmth_excess", "count": warmth_count, "examples": [w for w, _ in warmth]})
    if motivational_count >= 2:
        flags.append({"flag": "motivational_excess", "count": motivational_count, "examples": [w for w, _ in motivational]})
    if generic_count >= 3:
        flags.append({"flag": "generic_excess", "count": generic_count, "examples": [w for w, _ in generic]})
    if academic_excess:
        flags.append({"flag": "academic_excess", "avg_sentence_len": round(avg_sentence_len, 1)})

    return {
        "flags": flags,
        "flag_count": len(flags),
        "warmth_count": warmth_count,
        "motivational_count": motivational_count,
        "generic_count": generic_count,
        "academic_excess": academic_excess,
    }


# ── Composite ──────────────────────────────────────────────────────────────────

def classify_post(dimensions: dict) -> str:
    """
    Composite classification:
    - 3+ FAIL dimensions → FAIL
    - 1-2 FAIL dimensions → WARNING
    - 0 FAIL but 3+ WARNINGs → WARNING
    - Otherwise → PASS
    """
    fails = [k for k, v in dimensions.items() if v.get("verdict") == "FAIL"]
    warns = [k for k, v in dimensions.items() if v.get("verdict") == "WARNING"]

    if len(fails) >= 3:
        return "FAIL"
    if len(fails) >= 1:
        return "WARNING"
    if len(warns) >= 3:
        return "WARNING"
    return "PASS"


def severity_score(dimensions: dict) -> int:
    """Compute a per-post severity score (0-100, lower = worse)."""
    scores = [v.get("score", 0) for v in dimensions.values() if "score" in v]
    if not scores:
        return 0
    return round(sum(scores) / len(scores))


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    post_paths = sorted(POSTS_DIR.glob("*.md"))
    if not post_paths:
        print(f"[ERROR] No posts found in {POSTS_DIR}", file=sys.stderr)
        sys.exit(1)

    print(f"[INFO] Auditing {len(post_paths)} posts …")

    post_results = []
    for path in post_paths:
        post = load_post(path)
        dims = {
            "kha_ba_la": score_kha_ba_la(post),
            "vocabulary": score_vocabulary(post),
            "voice": score_voice(post),
            "cosmological_coherence": score_cosmological_coherence(post),
            "fractal_depth": score_fractal_depth(post),
            "source_grounding": score_source_grounding(post),
            "shadow_integration": score_shadow_integration(post),
        }
        tonal = detect_tonal_drift(post)

        overall = classify_post(dims)
        sev = severity_score(dims)

        post_results.append({
            "post": post["name"],
            "overall": overall,
            "severity_score": sev,
            "dimensions": dims,
            "tonal_drift": tonal,
        })

    # Aggregate
    totals = {"PASS": 0, "WARNING": 0, "FAIL": 0}
    for r in post_results:
        totals[r["overall"]] += 1

    # Contamination signatures
    all_avoid = {}
    all_emergent = {}
    for r in post_results:
        for term, count in r["dimensions"]["vocabulary"]["standard_matches"]:
            all_avoid[term] = all_avoid.get(term, 0) + count
        for term, count in r["dimensions"]["vocabulary"]["emergent_matches"]:
            all_emergent[term] = all_emergent.get(term, 0) + count
        for term, count in r["dimensions"]["vocabulary"]["critical_matches"]:
            all_avoid[term] = all_avoid.get(term, 0) + count

    top_avoid = sorted(all_avoid.items(), key=lambda x: x[1], reverse=True)[:5]
    top_emergent = sorted(all_emergent.items(), key=lambda x: x[1], reverse=True)[:5]

    # Drift patterns (most common tonal flags)
    flag_counts = {}
    for r in post_results:
        for f in r["tonal_drift"]["flags"]:
            flag_counts[f["flag"]] = flag_counts.get(f["flag"], 0) + 1
    top_flags = sorted(flag_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    report = {
        "report_type": "ci_audit",
        "total_posts": len(post_results),
        "pass_count": totals["PASS"],
        "warn_count": totals["WARNING"],
        "fail_count": totals["FAIL"],
        "top_avoid_signatures": [{"term": t, "count": c} for t, c in top_avoid],
        "top_emergent_signatures": [{"term": t, "count": c} for t, c in top_emergent],
        "top_drift_patterns": [{"pattern": p, "count": c} for p, c in top_flags],
        "posts": post_results,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\n[INFO] CI audit report written to: {OUTPUT_FILE}")
    print(f"       PASS: {totals['PASS']}  |  WARNING: {totals['WARNING']}  |  FAIL: {totals['FAIL']}")

    if totals["FAIL"] > 0:
        print(f"\n[ERROR] {totals['FAIL']} post(s) failed the audit. Exiting with code 1.")
        sys.exit(1)
    else:
        print(f"\n[INFO] No FAILs detected. Exiting with code 0.")
        sys.exit(0)


if __name__ == "__main__":
    main()
