# Noesis Writer Skill — Deferred Fix Plan (ISSUE-06)

**Status:** DEFERRED — execution intentionally out of scope for the synchronocities-blog hardening waves.
**Compiled:** 2026-07-21, from the deep review of skill v2.3.1 (SKILL.md 771 lines, CHANGELOG 332 lines, 11 reference files).
**How to use:** trigger from a fresh session in the skill's repo context. Each item is independent; they can be done in any order. Estimated total effort: 1–2 hours.

---

## FIX-01 — `vcs` naming collision in the autoregressive loop pseudocode (BUG)

**File:** `references/autoregressive-loop-pseudocode.md`

Both the **Vocabulary Contamination Score** and the **Voice Calibration Score** are abbreviated "VCS":

1. The `Scores` dataclass declares the field `vcs` **twice** (once for vocabulary contamination, once for voice calibration).
2. `WEIGHTS` has duplicate `"vcs"` keys — in Python the second silently overwrites the first, so **voice calibration would get weight 0** in any literal implementation.
3. `compute_drift` duplicates the `inverted_vcs` lines.
4. `verify_convergence` references an out-of-scope variable `committed_sections`.

**Fix:** rename to unambiguous identifiers, e.g. `vocab_contamination_score` and `voice_calibration_score` (or `vxcs`/`vccs`), dedupe the dataclass fields and WEIGHTS keys, and bind `committed_sections` as a parameter. Harmless while the loop is human-executed, but it will corrupt any literal implementation. Verify against `brand-voice-drift-metrics.md` so the rename stays consistent with the rubric doc.

---

## FIX-02 — Two unreconciled "canonical PASS post" lists

**Files:** `SKILL.md` (body) vs `CHANGELOG.md` (v2.1.0 entry)

- CHANGELOG v2.1.0 names: *The Seven-Day Type Pressure Audit*, *The Sword of Speech*, *Topological Pockets and Lorentz Invariance*, *Ancient Debugging…*
- SKILL.md body names: *Why Insight Isn't Change*, *Repetition Is Architecture*, *Hyperbolic Consciousness*, *The Source Code Has Authors*

**Fix:** pick one canonical set of 4, update the other document, and add a one-line note in CHANGELOG recording the reconciliation. Note the related system dependency: `scripts/semantic-vectorizer.py` in the blog repo hardcodes 4 canonical posts for drift comparison — if the set changes, sync that too (though see ISSUE-03/10: the semantic-vectorizer is slated for replacement by an e5-v5-based checker).

---

## FIX-03 — Blog category vocabulary mismatch: `thoughtseed` vs `studio`

**Files:** `references/platform-formats.md` vs `SKILL.md`

- SKILL.md declares blog categories: `personal | noesis | studio`
- platform-formats.md frontmatter recipes use: `personal | noesis | thoughtseed`

**Fix:** decide which third category is canonical, align both files, and check the blog's own schema (`synchronocities-blog/src/content.config.ts`) for which value it expects, if any.

---

## FIX-04 — Unresolved TODO: 16-rewrite calibration examples

**File:** `SKILL.md` (16-rewrite calibration section)

Points at `COSMO-ALIGN-WORKSPACE/integrations/16-calibration-examples.md` "to be documented by Swarm B" — never delivered.

**Fix:** either produce the document from the 16 post-rewrite calibration extracts already in `references/calibration-extracts.md` (they appear to be the same material, indexed in `calibration-extracts-INDEX.md`), or delete the TODO and point the section at the extracts file directly.

---

## FIX-05 — Housekeeping notes (minor, optional)

1. **Reference count:** docs occasionally say "12 reference files" — there are 11. Cosmetic.
2. **Version pinning:** v1.0.0 → v2.3.1 shipped across 2026-07-15 → 2026-07-18 (four major versions in four days). Recommend consumers pin to v2.3.1 explicitly; consider a stability note in SKILL.md frontmatter.
3. **Voice fingerprint validity window** claims "2025-07-25 through 2026-04-30" — stale; refresh or remove the window.

---

## Out of scope for this plan (deliberately)

- The v2.3 philosophical shift (provenance-enforcement over ideology-enforcement) is **working as intended** — do not "fix".
- The Fool's Wisdom Grounding Gate as v2.2 compatibility layer — correct as designed.
- Any corpus-side remediation (that lives in synchronocities-blog `quality-engine/`, Waves 3–4).
