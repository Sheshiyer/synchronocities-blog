# Phase 2 Wave 2 Content Seeding Note

Date: 2026-04-02

This note closes the planning gap between the schema foundation work and the first real content seeding pass. It covers both the migration rules for legacy markdown posts and the pilot shortlist for the first seeded rollout.

## Pilot Set

The first seeded rollout should cover every non-card archetype frozen in the Wave 2 contract:

| Slug | Mode | Entry kind | Why it is in the pilot |
|---|---|---|---|
| `the-downstream-mind` | `signal-essay` | `essay` | Flagship pilot with external processing doc, image choreography, Easter egg layers, and strong LLM-entry value |
| `consciousness-architecture-hub` | `hub` | `hub` | Proves hub routing, foundational entry logic, and cluster-level relationships |
| `lorenz-kundli-system-index` | `reference` | `reference` | Proves utility-first reference metadata without forcing a card shell |
| `pattern-cross-reference-system` | `research-essay` | `essay` | Proves the lighter non-card research path with concepts and relationships |
| `bangkok-initiation-samui-invitation` | `field-note` | `essay` | Proves chronology-forward travel writing can participate in the new system without losing its tone |

## Migration Rules

### 1. Tarot card posts stay on the legacy contract

- If a post has `card`, do not add `article_mode`.
- Card posts continue to infer `card-journey` from `card`.
- Existing card-specific rendering remains the regression baseline during this phase.

### 2. Seeded non-card posts must become explicit

- Any non-card post that receives article-experience metadata must declare `article_mode`.
- `hub` posts must also declare `entry_kind: hub`.
- `reference` posts must also declare `entry_kind: reference`.
- Seeded non-card posts must define:
  - `concepts`
  - `llm.cluster`
- Foundational seeded posts must set `llm.start_priority` explicitly.

### 3. Use additive metadata only

- Do not rewrite article bodies as part of the migration.
- Prefer `hero.subtitle`, `concepts`, `related_posts`, `experience`, `llm`, and `source_bridge` over template-specific hacks.
- `featured_image` remains valid. Add `hero.image` only when a repo-relative asset is ready and intentionally meant to override the current hero.

### 4. Imported provenance must remain auditable

- External processing docs must flow through dry-run patch generation first.
- Imported fields must record:
  - source path
  - import timestamp
  - imported field list
- Unmapped fields must be surfaced, not silently dropped.

### 5. Image choreography must point at live headings

- `figures[].anchor` must target stable section slugs derived from the current markdown headings.
- `hero` and `closing` placements are valid exceptions.
- Repo-relative assets are preferred. Missing assets should only be tolerated when the figure is explicitly optional.

### 6. Easter egg data should preserve subtlety

- Normalize imported layers into flat `easter_eggs[]` signals.
- `visible` should reward first-read attention.
- `discoverable` should reward careful rereading.
- `decoder` should remain opt-in and should not flatten the first-pass reading experience.

## Rollout Order

1. Land validation and importer tooling.
2. Seed the pilot set above.
3. Run metadata validation, tests, and build verification.
4. Use the seeded pilot set as the baseline for Phase 3 archive work and Phase 4 article-shell work.
