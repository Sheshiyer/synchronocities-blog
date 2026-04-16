# Phase 3 Wave 1 Archive IA Note

Date: 2026-04-02

This note freezes the archive information architecture for the first discovery-data batch. It does not redesign the UI yet. It defines the data model and grouping rules that Wave 2 UI work must consume.

## Archive Positioning

The site is no longer a tarot-only archive. The archive now has to hold two truths at once:

1. The tarot journey remains the signature narrative entry path.
2. The broader corpus is a markdown-first research library spanning essays, hubs, field notes, and references.

The archive therefore needs a dual structure:

- **Journey-first entry path** for card-native posts and travel continuity.
- **Library-first retrieval path** for everything else.

Wave 1 should establish that dual structure in data, not force a visual redesign prematurely.

## Primary Archive Groups

### 1. Major Arcana

- Purpose: preserve the original journey arc as a coherent browse path.
- Inclusion rule: any post with `card`.
- Sort rule: tarot numeral order, then post date.

### 2. Maps & Indexes

- Purpose: expose hub and reference pages as explicit entry points instead of burying them in the general list.
- Inclusion rule: `entryKind === 'hub' || entryKind === 'reference'`.
- Examples:
  - `consciousness-architecture-hub`
  - `lorenz-kundli-system-index`

### 3. Research Library

- Purpose: hold non-card essays, field notes, and future pilot experiences in one searchable pool.
- Inclusion rule: every published post without `card`.
- Sort rule: reverse chronological by default, with presets providing alternate views.

## Topic Model

Topic facets should be generated from normalized metadata rather than raw frontmatter loops.

- Preferred source: `concepts`
- Fallback source: `tags`
- Archive topic counts should use the union of both so legacy posts remain visible until migration catches up.

This keeps the current site usable while still rewarding seeded posts with cleaner discovery metadata.

## Preset Contract

Wave 1 freezes the following deterministic preset meanings:

| Preset ID | Label | Rule |
|---|---|---|
| `newest` | Newest | 12 most recent published records |
| `major-arcana` | Travel Arc | all card-native journey entries |
| `foundational` | Foundational | `foundational === true` |
| `research` | Research | `signal-essay`, `research-essay`, and `reference` records |
| `field-notes` | Field Notes | `articleMode === 'field-note'` |
| `hubs` | Maps & Indexes | `entryKind === 'hub' || entryKind === 'reference'` |
| `pilot-downstream-mind` | Pilot Essays | The Downstream Mind plus its seeded adjacent nodes |

The `pilot-downstream-mind` preset is intentionally curated. It is the proving set for the article-experience engine and downstream discovery surfaces.

## Relationship Model

Wave 1 relationship data should score connections from:

- explicit `related_posts`
- shared `series`
- shared `llm.cluster`
- shared `concepts`
- shared `tags`
- shared `articleMode`

Explicit editorial links outrank inferred links. Series and cluster affinity outrank raw tag overlap. This keeps the graph useful for future related-post surfaces instead of turning it into a noisy “same-tag” list.

## Consequences For Wave 2

Once this IA is frozen:

- `/journeys` can move from decorative tags to executable filters and presets without redefining the data model.
- homepage discovery work can point to the same preset definitions instead of inventing a separate curation system.
- future LLM routes can consume the same archive records and graph edges rather than rebuilding metadata logic again.
