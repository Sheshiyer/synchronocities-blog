# Editorial Voice Tiers

Posts on Synchronocities span four registers — from short personal field notes to large-scope research essays to schema-level reference indexes. This document defines the tiers, sets word-count expectations, and explains how each renders.

The tier is declared via `entry_kind` and (for non-card posts) `article_mode` in frontmatter.

## The Five Tiers

| Tier | `entry_kind` | `article_mode` | Word range | Voice |
|---|---|---|---|---|
| **Signal Essay** | `essay` | `signal-essay` | 2000–6000 | Argumentative; lays out a structured claim with evidence and consequence |
| **Field Note** | `essay` | `field-note` | 400–1500 | Personal/observational; first-person; dated; lived |
| **Framework** | `essay` | `research-essay` | 1500–3500 | Explanatory; structural; diagrams welcome; introduces a model |
| **Hub** | `hub` | `hub` | 600–1500 | Routing copy + annotated index of essays it organizes |
| **Reference** | `reference` | `reference` | 600–2000 | Catalog/index format; minimal narrative; high information density |

Plus the legacy default (`entry_kind` undeclared / inferred) which the validator currently flags with the *legacy non-card post still uses the fallback contract* warning. Posts in this state should be migrated to one of the five tiers above.

## Choosing the right tier

Run through these questions in order. Stop at the first match.

1. **Is this a per-card travelogue entry with a `card:` numeral set?** → `card-journey` (inferred from `card`, no `article_mode`)
2. **Is the body a routing index that lists/annotates other posts?** → `hub` (sets `entry_kind: hub`, `article_mode: hub`)
3. **Is the body a catalog/research-program index without much prose?** → `reference` (sets `entry_kind: reference`, `article_mode: reference`)
4. **Does the post argue a thesis with claims/evidence/consequence and run >2000 words?** → `signal-essay`
5. **Is the body a personal observation, dated, first-person, <1500 words?** → `field-note`
6. **Does the body explain a model/framework with structure, diagrams, or numbered components?** → `research-essay`

## What each tier requires in frontmatter

### Signal Essay (`signal-essay`)
- `concepts` — at least 4 entries (the canonical concepts the essay develops)
- `llm.cluster` — required for discovery grouping
- `llm.summary` — the 1-paragraph abstract
- `llm.canonical_questions` — 3–5 questions the essay answers
- `hero.eyebrow` + `hero.subtitle` — sets the visual register
- `experience.theme` + `experience.rail` + `experience.density` — visual styling

### Field Note (`field-note`)
- `concepts` — at least 1 entry
- `llm.cluster` — required
- Other LLM fields optional
- `hero.eyebrow: "Field Note"` recommended
- `experience.density: "standard"` recommended
- May set `location` and `kosha` for travelogue context

### Framework (`research-essay`)
- `concepts` — at least 4 entries
- `llm.cluster` — required
- `llm.canonical_questions` recommended
- Often pinned: `pinned: true` + `pin_rank: <int>`

### Hub (`hub`)
- `entry_kind: hub` (required by validator)
- `concepts` — list the major sub-domains
- `related_posts` — the essays this hub organizes (bidirectional linking expected)
- `experience.theme: "atlas"` recommended

### Reference (`reference`)
- `entry_kind: reference` (required by validator)
- Minimal `experience.density: "minimal"` for catalog feel
- High information density acceptable

## Voice register per tier

Across all tiers, the voice baseline is:
- **Anatomist who sees fractals** — clinical-visionary balance
- **PubMed × Alex Grey** — clinical terminology rendered with visionary artistry
- **Direct, no hedging** — claim the structural pattern; don't soften
- **Three tones**: grounded, direct, respectful-challenging (per the [voice-and-tone guide](../01-Projects/tryambakam-noesis/brand-docs-final/tryambakam-noesis-aleph/03-voice-and-tone.md) in the vault)

Tier-specific calibration:

- **Signal Essay** — strongest argumentative drive. Each section names a claim and pays it off. Open with the thesis, not the setup. Cite authors/works (not "the vault").
- **Field Note** — closer to lived prose. First-person OK. Dates, locations, somatic details welcome. Less argument, more observation.
- **Framework** — pedagogical-structural. Numbered components, diagrams, code snippets where they earn their place. Voice is "here is how this works."
- **Hub** — cool curator's voice. Each section header introduces a sub-domain; each paragraph annotates one related-post.
- **Reference** — almost no voice. Information density wins.

## Migrating legacy posts

The validator currently flags ~70 posts with the *legacy non-card post still uses the fallback contract* warning. Those posts have no `article_mode` and partial article-experience metadata. Migration steps:

1. Decide the tier (use the question tree above).
2. Add `entry_kind` and `article_mode`.
3. Backfill `concepts` (at least 4 for essay tiers).
4. Add `llm.cluster` (one of: `consciousness-architecture`, `lorenz-kundli`, `enneagram`, `tarot`, `travelogue`, `sonic`, `geometry`).
5. Add `llm.summary` and `llm.canonical_questions` (priority for high-traffic posts).
6. Re-run `npm run validate:posts`.

This is `audit:content` issue [#162](https://github.com/Sheshiyer/synchronocities-blog/issues/162). Migrate ~25 priority posts first; the remainder can backfill as they're touched.

## How tiers render

The route layer reads `article_mode` and `entry_kind` to pick the article shell:

- `card-journey` posts → custom card-themed layout in `pages/posts/[...slug].astro`
- All other modes → `NonCardArticleShell.astro` with mode-specific styling
- `hub` and `reference` get `experience.theme: "atlas"` or `"codex"` respectively for distinct visual treatments

The tiers also drive nav surfacing:
- Signal essays + frameworks → `/research` numbered library index
- Field notes + card-journey → `/journeys` chronological travelogue
- Hubs + references → `/maps` atlas register
- All → searchable via the global Research search

## Why tiers matter

- **Reader expectation**: knowing whether a post is a 600-word field note or a 4000-word signal essay sets the right mental model before they click in.
- **Discovery**: filter by tier in the Research library to surface "all signal essays" or "all field notes."
- **LLM retrieval**: `canonical_questions` per tier improves the question-to-post match.
- **Style consistency**: the Anatomist voice has the same DNA across tiers but calibrates per register; the doc captures this so future posts stay in voice.

## History

- 2026-05-01 — first written. Closes [#168](https://github.com/Sheshiyer/synchronocities-blog/issues/168).
