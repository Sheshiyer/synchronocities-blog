"""Deterministic, token-level mechanical fixes for the weekly audit.

Own module of the WeeklyAudit builder — does NOT live in qe_agents/ (owned by
another agent); imports from qe_agents and scripts/ci-audit.py read-only.

These helpers NEVER rewrite prose. The only permitted mutations are:

  1. Removing ``[vault: ...]`` compilation-drift references (SLS penalty in
     the source_grounding dimension).
  2. Replacing an exact contamination term (ci-audit ``AVOID_CRITICAL`` /
     ``AVOID_STANDARD``) with an allowlisted approved-vocabulary replacement.

Every candidate fix is re-scored in-memory against the relevant ci-audit
dimension BEFORE anything is written; a fix that does not strictly improve
the dimension is discarded. Frontmatter is never touched — only the body.
"""

from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
POSTS_DIR = REPO_ROOT / "src" / "content" / "posts"

# ── Load scripts/ci-audit.py read-only (term lists + scorers are the contract) ─
_spec = importlib.util.spec_from_file_location(
    "ci_audit", REPO_ROOT / "scripts" / "ci-audit.py"
)
ci_audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ci_audit)

VAULT_REF_RE = re.compile(r"\s*\[vault:[^\]]*\]")

# Deterministic mapping for the one CRITICAL contamination term.
CRITICAL_REPLACEMENTS = {"witnessos": "Noesis Engine"}

# Replacement allowlist: approved vocabulary (USE_TERMS) + generic safe terms.
APPROVED_REPLACEMENTS = {t.lower() for t in ci_audit.USE_TERMS} | {
    "noesis engine", "engine", "inquiry", "pattern", "structure",
    "coherence", "examination", "practice",
}

CONTAMINATION_TERMS = {
    t.lower() for t in (ci_audit.AVOID_CRITICAL + ci_audit.AVOID_STANDARD)
}


# ── File helpers ─────────────────────────────────────────────────────────────

def split_frontmatter(raw: str) -> tuple[str, str]:
    """Split a post into (head, body); head includes the --- delimiters."""
    if raw.startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) >= 3:
            return parts[0] + "---" + parts[1] + "---", parts[2]
    return "", raw


def _post_path(slug: str) -> Path:
    if not re.match(r"^[a-z0-9][a-z0-9-]*$", slug):
        raise ValueError(f"bad slug: {slug!r}")
    path = POSTS_DIR / f"{slug}.md"
    if not path.exists():
        raise FileNotFoundError(f"post not found: {slug}")
    return path


def _word_pattern(term: str) -> re.Pattern:
    return re.compile(r"\b" + re.escape(term.strip()) + r"\b", re.IGNORECASE)


# ── Scanners (no writes — used by --dry-run and the fix stage) ───────────────

def scan_mechanical_fixes(report: dict) -> list[dict]:
    """Return deterministic fix candidates implied by an audit report."""
    candidates = []
    for post in report.get("posts", []):
        slug = post.get("post", "").removesuffix(".md")
        if not slug:
            continue
        try:
            raw = _post_path(slug).read_text(encoding="utf-8")
        except (ValueError, FileNotFoundError):
            continue
        _, body = split_frontmatter(raw)

        vault_refs = VAULT_REF_RE.findall(body)
        if vault_refs:
            candidates.append({
                "slug": slug, "kind": "vault_references",
                "occurrences": len(vault_refs),
            })

        body_lower = body.lower()
        for term, replacement in CRITICAL_REPLACEMENTS.items():
            n = len(_word_pattern(term).findall(body))
            if n:
                candidates.append({
                    "slug": slug, "kind": "critical_term",
                    "find": term, "replacement": replacement,
                    "occurrences": n,
                })
        # Standard avoid terms are reported but NOT auto-fixed without the
        # LLM stage (no canonical 1:1 mapping is safe to apply blind).
        std = post.get("dimensions", {}).get("vocabulary", {}).get(
            "standard_matches", [])
        if std:
            candidates.append({
                "slug": slug, "kind": "standard_terms_llm_only",
                "terms": [t for t, _ in std],
                "occurrences": sum(c for _, c in std),
            })
    return candidates


# ── Appliers (write only on verified improvement) ────────────────────────────

def remove_vault_references(slug: str, write: bool = True) -> dict:
    """Strip ``[vault: ...]`` refs from a post body; guarded by SLS re-score."""
    path = _post_path(slug)
    raw = path.read_text(encoding="utf-8")
    head, body = split_frontmatter(raw)
    new_body, n = VAULT_REF_RE.subn("", body)
    if n == 0:
        return {"applied": False, "reason": "no vault references"}
    before = ci_audit.score_source_grounding({"body": body})
    after = ci_audit.score_source_grounding({"body": new_body})
    if after["score"] <= before["score"]:
        return {"applied": False, "reason": "no SLS improvement"}
    if write:
        path.write_text(head + new_body, encoding="utf-8")
    return {"applied": True, "occurrences": n,
            "score_before": before["score"], "score_after": after["score"]}


def apply_term_replacement(slug: str, find: str, replacement: str,
                           write: bool = True) -> dict:
    """Replace an exact contamination term with an allowlisted replacement.

    Both ``find`` and ``replacement`` are validated against the ci-audit
    vocabulary contract; the change is written only if the VCS strictly
    improves. Whole-word, case-insensitive; body only.
    """
    find_l = find.strip().lower()
    repl_l = replacement.strip().lower()
    if find_l not in CONTAMINATION_TERMS:
        return {"applied": False,
                "reason": f"{find!r} is not a known contamination term"}
    if repl_l and repl_l not in APPROVED_REPLACEMENTS:
        return {"applied": False,
                "reason": f"{replacement!r} is not an approved replacement"}

    path = _post_path(slug)
    raw = path.read_text(encoding="utf-8")
    head, body = split_frontmatter(raw)
    pattern = _word_pattern(find)
    occurrences = len(pattern.findall(body))
    if occurrences == 0:
        return {"applied": False, "reason": "term not present in body"}

    new_body = pattern.sub(replacement.strip(), body)
    before = ci_audit.score_vocabulary({"body": body})
    after = ci_audit.score_vocabulary({"body": new_body})
    improved = (after["total_violations"] < before["total_violations"]
                or after["score"] > before["score"])
    if not improved:
        return {"applied": False, "reason": "no VCS improvement"}
    if write:
        path.write_text(head + new_body, encoding="utf-8")
    return {"applied": True, "occurrences": occurrences,
            "violations_before": before["total_violations"],
            "violations_after": after["total_violations"],
            "score_before": before["score"], "score_after": after["score"]}


def apply_deterministic_fixes(report: dict, write: bool = True) -> list[dict]:
    """Apply the always-safe fixes (vault refs + CRITICAL term). Returns a
    fix log; one entry per attempted fix with its outcome."""
    log = []
    for cand in scan_mechanical_fixes(report):
        if cand["kind"] == "vault_references":
            res = remove_vault_references(cand["slug"], write=write)
            log.append({"stage": "deterministic", **cand, "result": res})
        elif cand["kind"] == "critical_term":
            res = apply_term_replacement(
                cand["slug"], cand["find"], cand["replacement"], write=write)
            log.append({"stage": "deterministic", **cand, "result": res})
    return log


# ── AgentScope tool wrappers (schema derived from signature + docstring) ─────

def describe_post_violations(slug: str) -> str:
    """List the exact contamination terms and vault references in a post.

    Args:
        slug: Post slug, e.g. "vortex-based-mathematics".

    Returns:
        JSON string: {"standard_matches": [[term, count], ...],
        "critical_matches": [...], "vault_reference_count": int,
        "approved_replacements": [term, ...]}.
    """
    try:
        raw = _post_path(slug).read_text(encoding="utf-8")
    except (ValueError, FileNotFoundError) as e:
        return json.dumps({"error": str(e)})
    _, body = split_frontmatter(raw)
    v = ci_audit.score_vocabulary({"body": body})
    out = {
        "critical_matches": v["critical_matches"],
        "standard_matches": v["standard_matches"],
        "vault_reference_count": len(VAULT_REF_RE.findall(body)),
        "approved_replacements": sorted(APPROVED_REPLACEMENTS),
    }
    return json.dumps(out, ensure_ascii=False)


def apply_term_fix_tool(slug: str, find: str, replacement: str) -> str:
    """Replace one exact contamination term in a post with an approved
    vocabulary term. This is the ONLY permitted edit: whole-word, literal,
    no prose rewriting. The change is rejected unless the vocabulary score
    strictly improves.

    Args:
        slug: Post slug, e.g. "vortex-based-mathematics".
        find: Exact term from the contamination list shown by
            describe_post_violations (e.g. "healing").
        replacement: A term from the approved_replacements list, or an
            empty string to delete the term.

    Returns:
        JSON string describing whether the fix was applied and the
        before/after vocabulary scores.
    """
    try:
        return json.dumps(apply_term_replacement(slug, find, replacement),
                          ensure_ascii=False)
    except (ValueError, FileNotFoundError) as e:
        return json.dumps({"applied": False, "reason": str(e)})


def remove_vault_refs_tool(slug: str) -> str:
    """Remove all ``[vault: ...]`` compilation-drift references from a post
    body (they penalize source grounding). No other text is changed.

    Args:
        slug: Post slug, e.g. "vortex-based-mathematics".

    Returns:
        JSON string describing whether the fix was applied and the
        before/after source-grounding scores.
    """
    try:
        return json.dumps(remove_vault_references(slug), ensure_ascii=False)
    except (ValueError, FileNotFoundError) as e:
        return json.dumps({"applied": False, "reason": str(e)})
