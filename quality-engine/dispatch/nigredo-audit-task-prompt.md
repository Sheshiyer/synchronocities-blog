# CommandCode Nigredo Audit Task

Substitute the assigned filename for `<POST>` everywhere below.

You own exactly one new audit file in this repository:

- Source, read-only: `src/content/posts/<POST>`
- Output: `quality-engine/audits/nigredo/<POST>-nigredo-audit.md`
- Canonical gate: `/Volumes/madara/2026/twc-vault/.agents/skills/noesis-writer-skill/references/fools-wisdom-grounding-gate.md`

This is Stage 1 Nigredo only. Read the canonical gate and assigned source post completely before judging. Do not edit, stage, commit, rename, or delete the source post or any other file. Do not create scratch files. Use `apply_patch` to create only your owned output file.

Extract every genuine scientific claim/reference and every genuine mathematical concept. The science verdicts are exactly:

- `ALIGNED`
- `GROUNDED-OBSERVATIONAL`
- `AUTHORITY-BORROWED`
- `CONTESTED-AS-FACT`
- `FABRICATED`
- `INVERTED`

The math verdicts are exactly:

- `INTEGRATED`
- `DECORATIVE`
- `WRONG`

Use `Y` or `N` for load-bearing. Apply the gate's confidence rule, house-cosmology rule, honest-metaphor safe harbor, history rule, and load-bearing removal test. Safe harbor is a framing rule, not a verdict: do not invent `SAFE-HARBOR`, `HISTORICAL`, `PASS`, or any other verdict. An accurate historical reference that belongs in the science inventory should use `ALIGNED`, with its historical status explained in the Note. A declared analogy that contains no actual science claim or mathematical structure is not itself a science/math reference and should not become an inventory row. If an analogy does contain a real claim or structure, classify that underlying content with the exact taxonomy.

Write this exact shape:

```markdown
# Nigredo Audit — <POST>
**Date:** 2026-07-18
**Gate:** Fool's Wisdom Grounding Gate v2.2.0
**Post:** src/content/posts/<POST>

## Dross Inventory
| Line | Quote (≤15 words) | Type (science/math) | Verdict | Load-bearing (Y/N) | Note |
|------|-------------------|---------------------|---------|--------------------|------|
| L... | "..." | science | ALIGNED | N | ... |

## Summary
- Science references: N (ALIGNED n, GROUNDED-OBSERVATIONAL n, AUTHORITY-BORROWED n, CONTESTED-AS-FACT n, FABRICATED n, INVERTED n)
- Math references: N (INTEGRATED n, DECORATIVE n, WRONG n)
- Dross findings (failing verdicts): N total (M load-bearing)
- **Nigredo verdict:** CLEAN | MINOR DROSS | MAJOR DROSS

## One-Line Note
...
```

If there are zero genuine science and math references, replace the inventory table with the exact sentence `No science or math references found in this post.`

Arithmetic is commit-blocking:

- Science total must equal all six science category counts.
- Math total must equal all three math category counts.
- Dross total must equal `AUTHORITY-BORROWED + CONTESTED-AS-FACT + FABRICATED + INVERTED + DECORATIVE + WRONG`.
- Load-bearing total counts only failing rows marked `Y`.
- `MAJOR DROSS` means any `FABRICATED`, at least three failing findings, or at least two load-bearing failures.
- `MINOR DROSS` means one or two failing findings without a major trigger.
- `CLEAN` means zero failing findings.

Before finishing, reread the output and manually verify the exact source/output paths, required headings, exact summary labels and category order, all subtotal arithmetic, dross arithmetic, and verdict threshold. Report only the created audit path and its summary counts.
