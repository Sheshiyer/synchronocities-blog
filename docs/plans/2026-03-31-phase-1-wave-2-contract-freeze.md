# Synchronocities Phase 1 Wave 2 Contract Freeze

**Goal:** Freeze the metadata, discovery, and LLM-entry contracts for the upstream discovery upgrade so Phase 2 can implement against a stable target.

**Architecture:** Keep the current Astro + markdown blog as the source of truth, then add an additive metadata layer for non-card article experiences, archive retrieval, and machine-readable discovery. Existing tarot-card behavior stays intact; new non-card behavior is modeled as a parallel article-experience system rather than being forced into `cardExperience`.

**Tech Stack:** Astro content collections, markdown frontmatter, plain-text API routes, build-time normalization utilities, static archive data.

---

## Scope

This document freezes the deliverables for:

- `T009` article-experience taxonomy
- `T010` extended frontmatter contract
- `T011` layered Easter egg contract
- `T012` image choreography contract
- `T013` archive retrieval contract
- `T014` `start.txt` and upgraded LLM route contract
- `T015` external source-import mapping contract
- `T016` validation baseline and shared-file lock zones

## Current Constraints

- Source of truth remains `src/content/posts/*.md`.
- Existing tarot-card rendering is driven by `card`, `getCardPalette()`, and `getCardExperience()` in [src/pages/posts/[...slug].astro](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/posts/[...slug].astro) and [src/lib/cardExperience.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/lib/cardExperience.ts).
- The current content schema in [src/content.config.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/content.config.ts) does not yet support article modes, related concepts, figure placement, or source-import metadata.
- The archive in [src/pages/journeys.astro](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/journeys.astro) has decorative topics but no executable filters, search, or preset model.
- LLM routes in [src/pages/llms.txt.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/llms.txt.ts) and [src/pages/llms-full.txt.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/llms-full.txt.ts) are flat exports rather than intentional discovery surfaces.
- The external Downstream Mind source doc already carries richer metadata, image sequencing, and Easter egg layers than the published repo version: [the-downstream-mind.md](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/content/posts/the-downstream-mind.md), [/Volumes/madara/2026/twc-vault/01-Projects/Content-Engine/_processing/downstream-mind-2026-03-08.md](/Volumes/madara/2026/twc-vault/01-Projects/Content-Engine/_processing/downstream-mind-2026-03-08.md).

## T009 — Article-Experience Taxonomy

### Decision

Freeze a small, reusable mode set. Do not create one-off layout names per essay.

### Mode Set

| Mode | Use for | Reading behavior | Discovery behavior |
|---|---|---|---|
| `card-journey` | Existing tarot-card posts | Keeps current palette, ambient shell, and `cardExperience` logic | Continues to anchor the tarot journey |
| `signal-essay` | Flagship non-card essays with layered reveals, such as The Downstream Mind | Thesis-led longform, concept rail, optional decoder surfaces, strong section choreography | High-value entry article for humans and LLMs |
| `research-essay` | Dense synthesis, explanatory essays, and theory pieces | Strong TOC, source/context metadata, lighter ornament than `signal-essay` | Search, relationship, and foundational-cluster friendly |
| `field-note` | Experiential logs, travel runtime notes, or observational essays without tarot card metadata | Chronology-forward, atmosphere-light, smaller sidecar footprint | Supports journey, date, and place-based browsing |
| `hub` | Map-of-content pages, collections, or navigation essays | Intro summary plus explicit outbound structure | Treated as a first-class entry point in archive and LLM routes |
| `reference` | System indexes, glossary-style pages, protocol/reference documents | Utility-first shell with low visual noise | Prioritized for structured retrieval and machine-readable exports |

### Rules

- Non-card essays must map to one of `signal-essay`, `research-essay`, `field-note`, `hub`, or `reference`.
- `card-journey` remains inferred from `card` until a later migration explicitly changes that.
- The first implementation wave must not add more modes until at least three real posts fail to fit the frozen set cleanly.
- Visual uniqueness comes from metadata and theme tokens inside a shared shell, not from mode proliferation.

## T010 — Extended Frontmatter Contract

### Decision

Add a narrow set of additive frontmatter fields. Preserve existing keys and avoid replacing current metadata.

### Proposed Additions

```ts
article_mode?: 'signal-essay' | 'research-essay' | 'field-note' | 'hub' | 'reference';
series?: string;
entry_kind?: 'essay' | 'hub' | 'reference';
foundational?: boolean;
concepts?: string[];
related_posts?: string[];
hero?: {
  eyebrow?: string;
  subtitle?: string;
  variant?: 'image' | 'text' | 'minimal';
  image?: string;
};
experience?: {
  theme?: 'signal' | 'lab' | 'pilgrim' | 'atlas' | 'codex';
  rail?: 'none' | 'concept' | 'timeline' | 'index';
  density?: 'minimal' | 'standard' | 'immersive';
  decoder?: boolean;
  framework_axes?: Record<string, string>;
};
figures?: FigureSlot[];
easter_eggs?: EasterEggSignal[];
llm?: {
  start_priority?: 'none' | 'supporting' | 'foundational';
  summary?: string;
  cluster?: string;
  canonical_questions?: string[];
};
source_bridge?: {
  processing_doc?: string;
  platform?: string;
  vault_sources?: string[];
  placement_guide?: string;
  imported_at?: string;
  imported_fields?: string[];
  quality_gates?: Record<string, boolean>;
};
```

### Contract Notes

- `featured_image` remains valid and becomes the fallback hero image.
- `article_mode` is optional for legacy posts during migration, but required for any new non-card article experience work.
- `entry_kind` is used by archive and LLM surfaces; `hub` and `reference` are not inferred from title alone.
- `foundational` is the canonical flag for “begin here” and LLM curation.
- `concepts` is the normalized discovery field; raw `tags` remain editorial labels.
- `related_posts` stores explicit editorial relationships and supplements graph-derived relationships.

## T011 — Layered Easter Egg Contract

### Decision

Model Easter eggs as normalized signals with explicit layer semantics instead of article-specific ad hoc structures.

### Signal Shape

```ts
type EasterEggSignal = {
  id: string;
  layer: 'visible' | 'discoverable' | 'decoder';
  kind: 'vocabulary' | 'structural' | 'image' | 'navigation' | 'byline' | 'sequence';
  label: string;
  description: string;
  anchor?: string;
  clue?: string;
  payload?: string | string[];
};
```

### Layer Semantics

- `visible`: acceptable on first read without special tooling or decoding
- `discoverable`: requires attention, pattern recognition, or cross-section noticing
- `decoder`: should not dominate first-read UX; surfaced only in optional decoder UI or machine-readable export

### Rules

- Layer labels are behavioral, not prestige labels.
- The UI can surface `visible` and `discoverable` layers in Phase 4; `decoder` layers remain optional and defer to reader intent.
- Import sources with richer nested layer formats must normalize into the flat signal shape above.

## T012 — Image Choreography Contract

### Decision

Represent image placement as section-aware figure slots so article layouts can be data-driven.

### Figure Slot Shape

```ts
type FigureSlot = {
  id: string;
  anchor: string;
  asset: string;
  alt: string;
  caption?: string;
  placement: 'hero' | 'before-section' | 'after-section' | 'inline-right' | 'full-bleed' | 'closing';
  reveal?: 'always' | 'ambient' | 'decoder';
  optional?: boolean;
};
```

### Rules

- `anchor` targets a stable section slug or semantic position, not a raw paragraph offset.
- `hero` and `closing` are valid placements, but section-bound placements should be preferred for non-card essays.
- Missing non-critical assets must fail gracefully when `optional` is true.
- The placement guide from external source docs is advisory input to `figures[]`, not a second rendering system.

## T013 — Archive Retrieval Contract

### Decision

Move archive retrieval to a normalized build-time record model that powers both filters and future relationship surfaces.

### Normalized Archive Record

```ts
type ArchiveRecord = {
  slug: string;
  title: string;
  date: string;
  excerpt?: string;
  tags: string[];
  concepts: string[];
  articleMode: 'card-journey' | 'signal-essay' | 'research-essay' | 'field-note' | 'hub' | 'reference';
  entryKind: 'essay' | 'hub' | 'reference';
  foundational: boolean;
  series?: string;
  readTimeMinutes?: number;
  card?: string;
  heroImage?: string;
  relationships: string[];
};
```

### Archive Behaviors

- Primary route remains `/journeys`.
- URL state is the contract for executable retrieval:
  - `?q=`
  - `?topic=`
  - `?mode=`
  - `?series=`
  - `?preset=`
- Preset names are frozen as:
  - `newest`
  - `major-arcana`
  - `foundational`
  - `research`
  - `field-notes`
  - `hubs`
  - `pilot-downstream-mind`

### No-JS Contract

- Presets must exist as plain links.
- Topic and mode state must be representable in URL parameters.
- Text search may hydrate client-side, but the page must remain useful without it by exposing preset entry points and grouped content.

## T014 — LLM Route Contract

### Decision

Turn the current flat text exports into a three-layer discovery stack plus one machine-readable manifest.

### Route Set

| Route | Role | Contract |
|---|---|---|
| `/start.txt` | High-signal orientation entry point | Short guide to the site, core clusters, and 5-8 recommended entry articles or hubs |
| `/llms.txt` | Concise discovery index | Clustered list of articles with foundational markers, not a single flat stream |
| `/llms-full.txt` | Full corpus export | Full text plus normalized metadata, section outline, and relationship hints |
| `/llms-manifest.json` | Machine-readable discovery manifest | Structured metadata records and relationship edges for tooling |

### Curation Rules

- `foundational: true` and `llm.start_priority` drive `/start.txt`.
- `hub` and `reference` entries can appear ahead of essays when they genuinely improve onboarding.
- `/llms-full.txt` must remain comprehensive, but it should use normalized metadata labels rather than only legacy frontmatter fields.
- `/llms-manifest.json` is the canonical machine target once implemented; plain-text routes stay optimized for readability.

## T015 — External Source-Import Mapping Contract

### Decision

Imports from Content-Engine processing docs are opt-in, frontmatter-first, and auditable. They do not overwrite the published body by default.

### Mapping

| External field | Repo target | Rule |
|---|---|---|
| `title` | `title` | Manual review required if repo title differs |
| `subtitle` | `hero.subtitle` | Additive |
| `platform` | `source_bridge.platform` | Additive |
| `status` | `draft` | Map draft-like states only; do not silently publish |
| `tags` | `tags` | Merge, then dedupe |
| `vault_sources` | `source_bridge.vault_sources` | Additive |
| `kha_ba_la_mapping` | `experience.framework_axes` or equivalent nested metadata | Normalize into explicit structural fields |
| `images.header` | `featured_image` and/or `hero.image` | Prefer repo-relative asset path after asset sync |
| `images.section_*` | `figures[]` | Normalize into figure slots |
| `images.placement_guide` | `source_bridge.placement_guide` | Track provenance |
| `quality_gates_passed` | `source_bridge.quality_gates` | Additive provenance only |
| `easter_eggs.*` | `easter_eggs[]` | Normalize into layered signals |
| `word_count` | ignore as canonical metadata | Derive from content at build time when needed |

### Importer Rules

- Default mode is dry-run patch generation.
- Repo-authored frontmatter wins unless the user explicitly requests override behavior.
- Body content remains manual by default.
- Every import records:
  - source path
  - import timestamp
  - imported field list
- Any unmapped source fields must be surfaced in dry-run output instead of being silently dropped.

## T016 — Validation Baseline and Lock Zones

### Verification Baseline

Future implementation waves must be able to prove:

1. schema changes parse the full post collection
2. current tarot-card posts still build and render
3. archive routes still work as static output
4. text routes remain internally consistent
5. pilot metadata imports are auditable

### Required Proof Commands

- `npm run build`
- `npm run astro -- check` once schema expansion begins
- targeted route smoke checks after implementation:
  - `/journeys`
  - `/posts/the-downstream-mind`
  - `/llms.txt`
  - `/llms-full.txt`
  - `/start.txt` when added

### Shared-File Lock Zones

These files are contract-sensitive and should not receive speculative implementation edits before the corresponding tasks land:

- [src/content.config.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/content.config.ts)
  - lock reason: schema changes cascade into all content
- [src/lib/cardExperience.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/lib/cardExperience.ts)
  - lock reason: card-specific baseline must remain stable while non-card registry is designed separately
- [src/pages/posts/[...slug].astro](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/posts/[...slug].astro)
  - lock reason: current reading shell is the regression baseline
- [src/pages/journeys.astro](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/journeys.astro)
  - lock reason: archive contract should be frozen before UI rollout
- [src/pages/llms.txt.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/llms.txt.ts)
  - lock reason: concise LLM route will be upgraded intentionally, not opportunistically
- [src/pages/llms-full.txt.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/llms-full.txt.ts)
  - lock reason: full corpus export must remain a stable baseline for diffing future route upgrades
- [src/content/posts/*.md](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/content/posts)
  - lock reason: pilot metadata seeding starts only after the schema is accepted

## Execution Consequences

- Phase 2 can now implement schema work against a fixed mode set and field vocabulary.
- Phase 3 can treat archive retrieval as normalized data work instead of inventing filters at the component layer.
- Phase 4 can build a non-card article shell around `signal-essay` first, using The Downstream Mind as the pilot.
- Phase 5 can ship `start.txt` and richer LLM routes without reopening naming or data-model debates.

## Deferred Items

- No route implementations are landed in this document.
- No schema edits are landed in this document.
- No GitHub issue recreation is landed in this document.

Those belong to later execution tasks once this contract is accepted.
