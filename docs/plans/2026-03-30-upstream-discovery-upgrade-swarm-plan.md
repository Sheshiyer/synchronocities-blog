# Synchronocities — Upstream Discovery Upgrade Swarm Plan

> Planning artifact for the next upgrade wave after Milestone 1 and Milestone 2. This plan assumes the existing tarot-journey redesign is the baseline and targets the next layer: article-wide discovery UX, indexing, `start.txt`, richer LLM surfaces, and a Downstream Mind pilot experience.

## 1. Discovery Summary

- Planning depth: `deeply detailed`
- Delivery mode: `production`
- Release model: `phased rollout`
- CI/CD expectation: `basic`
- Quality bar:
  - preserve the current tarot-journey visual identity
  - make non-card research posts feel authored, not generic
  - keep the site markdown-first and Astro-native
  - ship real archive discovery, not decorative tags
  - add LLM entry surfaces without flattening the human reading experience
- Team / agent topology:
  - human team shape: `solo`
  - planner / orchestrator: Codex
  - future implementation split: UI/article systems, content/data systems, validation
- Constraints:
  - repo is a single Astro app, not a monorepo
  - source of truth remains `src/content/posts/*.md`
  - current open GitHub issue backlog is `0`
  - Milestone 1 and Milestone 2 are historical baselines, not live planning
  - richer article metadata currently exists outside the repo for at least one pilot article: `/Volumes/madara/2026/twc-vault/01-Projects/Content-Engine/_processing/downstream-mind-2026-03-08.md`

## 2. Context Sources Loaded

- [README.md](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/README.md)
- [docs/plans/2026-03-15-synchronocities-design-overhaul.md](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/docs/plans/2026-03-15-synchronocities-design-overhaul.md)
- [docs/plans/2026-03-26-reading-ux-improvements.md](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/docs/plans/2026-03-26-reading-ux-improvements.md)
- [src/content.config.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/content.config.ts)
- [src/pages/posts/[...slug].astro](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/posts/[...slug].astro)
- [src/pages/journeys.astro](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/journeys.astro)
- [src/pages/llms.txt.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/llms.txt.ts)
- [src/pages/llms-full.txt.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/llms-full.txt.ts)
- [src/lib/cardExperience.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/lib/cardExperience.ts)
- [src/content/posts/the-downstream-mind.md](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/content/posts/the-downstream-mind.md)
- `/Volumes/madara/2026/twc-vault/01-Projects/Content-Engine/_processing/downstream-mind-2026-03-08.md`
- GitHub issue history for `Sheshiyer/synchronocities-blog`

## 3. Assumptions and Constraints

- Assumption A: the current site is already using Astro content collections as its content backend; there is no `astro-wiki` package or alternate CMS inside this repo.
- Assumption B: the next wave should extend, not replace, the tarot-journey homepage and card-post architecture.
- Assumption C: article-specific UI should become data-driven enough to support non-card essays without requiring one-off templates for every post.
- Assumption D: The Downstream Mind is the right pilot because its external source spec already encodes layered Easter eggs, section image placements, and LLM-relevant structure.
- Constraint A: do not break existing routes: `/`, `/journeys`, `/posts/*`, `/card/*`, `/llms.txt`, `/llms-full.txt`, `/robots.txt`, or the sitemap output.
- Constraint B: preserve no-JS usefulness for archive and core reading surfaces where possible.
- Constraint C: imports from Content-Engine processing docs must be auditable and opt-in; they should not silently overwrite published bodies.
- Constraint D: new GitHub execution tracking will need to be recreated from scratch because the live backlog is empty.

## 4. Agent Ownership Model

| Concern | Primary owner | Secondary reviewer | Notes |
|---|---|---|---|
| Planning / orchestration | Codex planner | Human maintainer | Maintains phase graph, issue mapping, and review notes |
| Content schema / metadata systems | Content systems engineer | Codex planner | Owns frontmatter extensions, import mapping, validation |
| UI / article experience systems | Frontend engineer | Codex planner | Owns reusable article shell, rails, search UI, pilot layout |
| Validation / regressions | QA engineer | Codex planner | Owns build, route, accessibility, and content integrity gates |

## 5. Phase Map

### Phase 1 — Audit, Contracts, and Scaffolding

- Goal: convert historical milestone work plus the new request into a frozen execution contract for article experiences, indexing, and LLM entry surfaces.
- Exit criteria:
  - historical gap matrix exists
  - content / article-mode / LLM route contracts are frozen
  - lock zones and validation baseline are defined
- Waves:
  - Wave 1: historical baseline audit
  - Wave 2: contract freeze
  - Wave 3: scaffolding and validation baseline

### Phase 2 — Content Model and Publishing Pipeline

- Goal: extend the markdown content model so article-specific experiences, external source metadata, and richer discovery signals can be represented without replatforming.
- Exit criteria:
  - schema extensions are implemented
  - validation scripts exist
  - pilot content metadata is seeded
  - import bridge is defined and tested
- Waves:
  - Wave 1: schema implementation
  - Wave 2: content seeding and import bridge

### Phase 3 — Discovery, Archive, and Index Surfaces

- Goal: turn the site from a beautiful journey archive into a searchable research library that still respects the journey-led brand.
- Exit criteria:
  - real search, filters, presets, and relationship surfaces exist
  - homepage exposes multiple entry points
  - archive UX works on mobile, keyboard, and no-JS fallbacks
- Waves:
  - Wave 1: archive data and retrieval contracts
  - Wave 2: discovery UI rollout

### Phase 4 — Article Experience Engine and Downstream Mind Pilot

- Goal: create reusable per-article experience primitives and prove them on The Downstream Mind as the flagship non-card essay.
- Exit criteria:
  - reusable non-card article shell exists
  - Easter egg layers and section image choreography are supported
  - Downstream Mind ships as the pilot experience
  - regression and taste review pass
- Waves:
  - Wave 1: reusable experience primitives
  - Wave 2: Downstream Mind pilot implementation

### Phase 5 — LLM Entry Surfaces, Hardening, and GitHub Rollout

- Goal: add a curated `start.txt`, improve machine-readable discovery routes, and reopen the GitHub execution system for ongoing upgrades.
- Exit criteria:
  - `start.txt` ships
  - `llms.txt` and `llms-full.txt` are upgraded
  - validation and rollout docs exist
  - fresh milestone / issue structure is ready
- Waves:
  - Wave 1: LLM route upgrades
  - Wave 2: operational rollout and issue sync

## 6. Detailed Phase 1 Wave / Swarm Layout

### Wave 1 — Historical Baseline Audit

#### Swarm A — Backlog-to-code audit

- Goal: prove what Milestone 1 and Milestone 2 already shipped, what remains partial, and what is now obsolete.
- Owner: planner / product
- Inputs: GitHub issue history, existing plan docs, current source files
- Outputs: shipped-vs-missing matrix
- Validation: matrix cross-checks milestone issues, repo docs, and current file behavior

#### Swarm B — Content and source-doc audit

- Goal: inventory post types, current metadata fidelity, and richer external source docs that are not yet modeled in the repo.
- Owner: content systems
- Inputs: `src/content/posts`, `src/content.config.ts`, Content-Engine processing docs
- Outputs: content inventory plus pilot candidates
- Validation: inventory includes card posts, non-card essays, hubs/indexes, and external metadata deltas

### Wave 2 — Contract Freeze

#### Swarm A — Article-mode and metadata contract

- Goal: define the schema for article modes, Easter egg layers, image placements, and import mappings.
- Owner: content systems
- Inputs: gap matrix, pilot article source docs
- Outputs: frozen metadata contract
- Validation: contract maps cleanly to Astro content collections and can express The Downstream Mind source spec

#### Swarm B — Discovery, archive, and LLM route contract

- Goal: define how search, filters, relationships, `start.txt`, and upgraded LLM routes should behave.
- Owner: planner / frontend
- Inputs: current `journeys`, `llms.txt`, `llms-full.txt`, request scope
- Outputs: discovery and LLM surface contract
- Validation: every requested surface has explicit route, audience, and validation rules

### Wave 3 — Scaffolding and Validation Baseline

#### Swarm A — GitHub re-entry scaffold

- Goal: decide how to reopen GitHub planning without duplicating historical milestone issues.
- Owner: planner
- Inputs: phase graph, labels, milestone history
- Outputs: milestone / label / issue mapping draft
- Validation: mapping cleanly separates historical work from the new upgrade program

#### Swarm B — Validation and lock-zone baseline

- Goal: freeze shared-file lock zones and define proof requirements before implementation starts.
- Owner: QA / planner
- Inputs: current touched files, contracts, verification playbook
- Outputs: validation baseline and lock-zone map
- Validation: every future wave has explicit task-level and wave-level evidence requirements

## 7. Full Task List

### Phase 1 — Audit, Contracts, and Scaffolding

- `T001` Title: map Milestone 1 and Milestone 2 issues to shipped code. Area: `product`. Owner role: `Planner`. Phase: `P1`. Wave: `W1`. Swarm: `baseline-audit`. Est hours: `2`. Dependencies: `[]`. Deliverable: historical issue-to-code audit matrix. Acceptance: every historical milestone task is labeled shipped, partial, obsolete, or missing. Validation: cross-check matrix against GitHub issue history, repo docs, and current source files.
- `T002` Title: summarize current live GitHub backlog state. Area: `product`. Owner role: `Planner`. Phase: `P1`. Wave: `W1`. Swarm: `baseline-audit`. Est hours: `1`. Dependencies: `["T001"]`. Deliverable: one-page backlog snapshot. Acceptance: snapshot records open issue count, milestone state, and follow-up need. Validation: verify with `gh issue list` output for the repo.
- `T003` Title: inventory routes and components affecting reading, archive, and LLM surfaces. Area: `product`. Owner role: `Planner`. Phase: `P1`. Wave: `W1`. Swarm: `baseline-audit`. Est hours: `2`. Dependencies: `[]`. Deliverable: route/component inventory. Acceptance: all routes and primary components tied to discovery or article rendering are listed. Validation: compare inventory against `src/pages`, `src/components`, and `src/layouts`.
- `T004` Title: inventory published content types and counts. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P1`. Wave: `W1`. Swarm: `content-audit`. Est hours: `2`. Dependencies: `[]`. Deliverable: content inventory by card post, non-card essay, hub/index, and hidden draft. Acceptance: inventory distinguishes tarot journey posts from general research essays. Validation: derive counts from `src/content/posts` and `src/content.config.ts`.
- `T005` Title: audit current article-mode coverage and default layout fallbacks. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P1`. Wave: `W1`. Swarm: `content-audit`. Est hours: `2`. Dependencies: `["T003","T004"]`. Deliverable: mode coverage audit. Acceptance: audit shows which posts receive bespoke experiences and which fall back to the generic post shell. Validation: verify against `src/pages/posts/[...slug].astro` and `src/lib/cardExperience.ts`.
- `T006` Title: audit current LLM text routes and missing entry surfaces. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P1`. Wave: `W1`. Swarm: `content-audit`. Est hours: `2`. Dependencies: `["T003"]`. Deliverable: LLM surface gap note. Acceptance: note explicitly names existing routes and missing `start.txt` or equivalent curated surface. Validation: inspect `src/pages/llms.txt.ts`, `src/pages/llms-full.txt.ts`, and route inventory.
- `T007` Title: inventory richer source metadata from external processing docs. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P1`. Wave: `W1`. Swarm: `content-audit`. Est hours: `3`. Dependencies: `["T004"]`. Deliverable: external metadata delta log. Acceptance: log shows which source-doc fields exist outside the repo and would improve article experiences. Validation: compare pilot processing docs with their published repo versions.
- `T008` Title: produce a gap matrix for the requested upgrade scope. Area: `product`. Owner role: `Planner`. Phase: `P1`. Wave: `W1`. Swarm: `baseline-audit`. Est hours: `3`. Dependencies: `["T001","T002","T003","T004","T005","T006","T007"]`. Deliverable: prioritized gap matrix. Acceptance: matrix connects user request to current code, historical plans, and missing capabilities. Validation: review matrix against all Phase 1 audit artifacts.
- `T009` Title: define the article-experience taxonomy. Area: `product`. Owner role: `Planner`. Phase: `P1`. Wave: `W2`. Swarm: `metadata-contract`. Est hours: `2`. Dependencies: `["T008"]`. Deliverable: article-mode taxonomy. Acceptance: taxonomy names reusable modes for non-card essays without exploding into one-off layouts. Validation: validate taxonomy against current posts and the pilot article needs.
- `T010` Title: define the extended frontmatter contract for article experiences. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P1`. Wave: `W2`. Swarm: `metadata-contract`. Est hours: `3`. Dependencies: `["T008","T009"]`. Deliverable: frontmatter schema proposal. Acceptance: proposal covers experience keys, images, related concepts, glossary hooks, and source linkage. Validation: ensure every field can be represented in Astro content collections.
- `T011` Title: define the layered Easter egg data contract. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P1`. Wave: `W2`. Swarm: `metadata-contract`. Est hours: `2`. Dependencies: `["T008","T010"]`. Deliverable: Easter egg layer schema. Acceptance: schema can represent overt, subtle, hidden, and decoder-level signals. Validation: map schema against The Downstream Mind source spec layers.
- `T012` Title: define the image placement and section choreography contract. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P1`. Wave: `W2`. Swarm: `metadata-contract`. Est hours: `2`. Dependencies: `["T007","T010"]`. Deliverable: image choreography contract. Acceptance: contract supports section-level image placement without hardcoding a single article. Validation: verify the contract can express the Downstream Mind placement guide.
- `T013` Title: define the archive facet and retrieval contract. Area: `product`. Owner role: `Planner`. Phase: `P1`. Wave: `W2`. Swarm: `discovery-contract`. Est hours: `3`. Dependencies: `["T008"]`. Deliverable: archive retrieval contract. Acceptance: contract defines search fields, facet behavior, preset behavior, and related-post logic. Validation: validate against `journeys.astro` and the user’s indexing request.
- `T014` Title: define the `start.txt` and upgraded LLM route contract. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P1`. Wave: `W2`. Swarm: `discovery-contract`. Est hours: `2`. Dependencies: `["T006","T008"]`. Deliverable: LLM surface contract. Acceptance: contract distinguishes concise entry route, full corpus route, and machine-readable manifests. Validation: review against current `llms.txt` and `llms-full.txt` behavior.
- `T015` Title: define the external source-import mapping contract. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P1`. Wave: `W2`. Swarm: `metadata-contract`. Est hours: `3`. Dependencies: `["T007","T010","T011","T012"]`. Deliverable: import mapping specification. Acceptance: spec maps external processing fields to repo-native metadata without overwriting body content silently. Validation: test the mapping concept against The Downstream Mind source file.
- `T016` Title: freeze validation baseline and shared-file lock zones. Area: `qa`. Owner role: `QA Engineer`. Phase: `P1`. Wave: `W3`. Swarm: `validation-baseline`. Est hours: `2`. Dependencies: `["T009","T010","T011","T012","T013","T014","T015"]`. Deliverable: validation baseline note. Acceptance: all critical lock zones and proof requirements are documented before implementation. Validation: baseline references build, route, manual, and content-validation gates.

### Phase 2 — Content Model and Publishing Pipeline

- `T017` Title: extend Astro content schema with optional article-experience fields. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P2`. Wave: `W1`. Swarm: `schema-implementation`. Est hours: `3`. Dependencies: `["T010","T011","T012","T015"]`. Deliverable: updated content schema. Acceptance: schema parses the new metadata fields without breaking existing posts. Validation: run content build and schema validation against all posts.
- `T018` Title: create a typed article experience registry for non-card essays. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P2`. Wave: `W1`. Swarm: `schema-implementation`. Est hours: `3`. Dependencies: `["T009"]`. Deliverable: article experience registry module. Acceptance: registry can assign reusable experience modes to essays independent of tarot cards. Validation: import the registry in a build-safe dry run.
- `T019` Title: build content normalization helpers for article metadata. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P2`. Wave: `W1`. Swarm: `schema-implementation`. Est hours: `3`. Dependencies: `["T017","T018"]`. Deliverable: metadata normalization utility. Acceptance: normalization removes boilerplate from page components and scripts. Validation: validate normalized output on multiple existing post types.
- `T020` Title: add read-time, heading, and section extraction utilities. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P2`. Wave: `W1`. Swarm: `schema-implementation`. Est hours: `3`. Dependencies: `["T017","T019"]`. Deliverable: extracted reading metadata utility. Acceptance: utilities expose read-time and section structure for archive and page surfaces. Validation: verify extracted values on long and short posts.
- `T021` Title: add source path and ingest metadata helpers. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P2`. Wave: `W1`. Swarm: `schema-implementation`. Est hours: `2`. Dependencies: `["T015","T017","T019"]`. Deliverable: source-link helper layer. Acceptance: external source references are stored consistently and safely. Validation: run sample normalization against an imported processing doc path.
- `T022` Title: add validation script for mode-specific required fields. Area: `qa`. Owner role: `QA Engineer`. Phase: `P2`. Wave: `W1`. Swarm: `schema-implementation`. Est hours: `3`. Dependencies: `["T017","T018","T019"]`. Deliverable: article metadata validation script. Acceptance: script fails missing required fields by mode but permits legacy posts with clear warnings. Validation: run script against the full content collection.
- `T023` Title: wire metadata validation into the build workflow. Area: `infra`. Owner role: `QA Engineer`. Phase: `P2`. Wave: `W1`. Swarm: `schema-implementation`. Est hours: `2`. Dependencies: `["T022"]`. Deliverable: build-integrated validation step. Acceptance: validation runs as part of the normal local verification path. Validation: prove build fails on a deliberate metadata contract violation.
- `T024` Title: document migration rules for existing markdown posts. Area: `product`. Owner role: `Planner`. Phase: `P2`. Wave: `W1`. Swarm: `schema-implementation`. Est hours: `2`. Dependencies: `["T017","T022","T023"]`. Deliverable: migration guidance note. Acceptance: note explains required, optional, and deferred metadata for existing content. Validation: review the guidance against at least three post archetypes.
- `T025` Title: choose pilot non-card essays for the new experience system. Area: `product`. Owner role: `Planner`. Phase: `P2`. Wave: `W2`. Swarm: `content-seeding`. Est hours: `2`. Dependencies: `["T008","T024"]`. Deliverable: pilot shortlist. Acceptance: shortlist includes The Downstream Mind plus supporting essays with different structural needs. Validation: confirm the selected posts cover multiple content archetypes.
- `T026` Title: enrich The Downstream Mind frontmatter from its processing source doc. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P2`. Wave: `W2`. Swarm: `content-seeding`. Est hours: `3`. Dependencies: `["T015","T025"]`. Deliverable: enriched pilot metadata. Acceptance: published post gains experience metadata without breaking current render behavior. Validation: compare enriched metadata against the processing source spec.
- `T027` Title: seed article experience metadata for supporting non-card posts. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P2`. Wave: `W2`. Swarm: `content-seeding`. Est hours: `4`. Dependencies: `["T018","T024","T025"]`. Deliverable: metadata-enriched supporting essays. Acceptance: at least three supporting essays receive reusable experience metadata. Validation: run validation script and manual metadata review.
- `T028` Title: seed image placement metadata for pilot articles. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P2`. Wave: `W2`. Swarm: `content-seeding`. Est hours: `3`. Dependencies: `["T012","T026","T027"]`. Deliverable: image placement data on pilot posts. Acceptance: image placement metadata is stored in a reusable structure. Validation: inspect normalized article data for expected section image slots.
- `T029` Title: seed layered Easter egg metadata for pilot articles. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P2`. Wave: `W2`. Swarm: `content-seeding`. Est hours: `3`. Dependencies: `["T011","T026","T027"]`. Deliverable: layered Easter egg data on pilot posts. Acceptance: metadata distinguishes visible, discoverable, and decoder-only layers. Validation: validate pilot metadata against the agreed Easter egg schema.
- `T030` Title: seed related concepts, glossary hooks, and source references. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P2`. Wave: `W2`. Swarm: `content-seeding`. Est hours: `3`. Dependencies: `["T013","T026","T027"]`. Deliverable: concept-link data for pilot posts. Acceptance: pilot posts expose terms and relationship hooks usable by archive and page surfaces. Validation: inspect generated relationship records for the pilot set.
- `T031` Title: build an opt-in import script from Content-Engine processing docs. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P2`. Wave: `W2`. Swarm: `content-seeding`. Est hours: `5`. Dependencies: `["T021","T024","T026","T027"]`. Deliverable: import / sync stub generator. Acceptance: script can read a processing doc and propose repo-native metadata updates without touching post bodies by default. Validation: dry-run the script on The Downstream Mind source doc and inspect diff output.
- `T032` Title: verify migration safety across the entire content collection. Area: `qa`. Owner role: `QA Engineer`. Phase: `P2`. Wave: `W2`. Swarm: `content-seeding`. Est hours: `3`. Dependencies: `["T023","T026","T027","T028","T029","T030","T031"]`. Deliverable: migration safety report. Acceptance: report identifies legacy-safe paths, pilot-ready paths, and blockers. Validation: run build, validation scripts, and targeted spot checks across all posts.

### Phase 3 — Discovery, Archive, and Index Surfaces

- `T033` Title: redesign the archive information architecture. Area: `product`. Owner role: `Planner`. Phase: `P3`. Wave: `W1`. Swarm: `archive-contract`. Est hours: `3`. Dependencies: `["T013","T032"]`. Deliverable: updated archive IA spec. Acceptance: spec balances the tarot journey with the broader research library. Validation: review IA against `journeys.astro`, homepage goals, and pilot content set.
- `T034` Title: build a unified archive record shape from normalized metadata. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P3`. Wave: `W1`. Swarm: `archive-contract`. Est hours: `3`. Dependencies: `["T019","T020","T030","T033"]`. Deliverable: archive record builder. Acceptance: archive records include title, excerpt, type, tags, read-time, relationships, and experience mode. Validation: inspect generated records across pilot and legacy posts.
- `T035` Title: add topic facet generation and counts. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P3`. Wave: `W1`. Swarm: `archive-contract`. Est hours: `2`. Dependencies: `["T034"]`. Deliverable: facet generator. Acceptance: topic counts are generated from normalized metadata rather than ad hoc loops. Validation: compare facet output against a manual sample count.
- `T036` Title: add text-search index generation. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P3`. Wave: `W1`. Swarm: `archive-contract`. Est hours: `3`. Dependencies: `["T034"]`. Deliverable: lightweight search index. Acceptance: search targets title, excerpt, tags, and concept metadata without server-side search infrastructure. Validation: run a test query set against the generated index.
- `T037` Title: define archive presets and collections. Area: `product`. Owner role: `Planner`. Phase: `P3`. Wave: `W1`. Swarm: `archive-contract`. Est hours: `2`. Dependencies: `["T033","T034"]`. Deliverable: preset definition set. Acceptance: presets such as `Newest`, `Travel Arc`, `Foundational`, `Research`, and `Pilot Essays` are clearly defined. Validation: map every preset to deterministic archive rules.
- `T038` Title: generate the relationship graph for tags, concepts, series, and shared structures. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P3`. Wave: `W1`. Swarm: `archive-contract`. Est hours: `4`. Dependencies: `["T030","T034"]`. Deliverable: relationship graph data. Acceptance: graph supports related-post surfaces and machine-readable outputs. Validation: inspect graph edges for The Downstream Mind and at least three adjacent essays.
- `T039` Title: implement clickable topic filters on the Journeys page. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P3`. Wave: `W2`. Swarm: `discovery-ui`. Est hours: `4`. Dependencies: `["T035"]`. Deliverable: interactive topic filters. Acceptance: topic chips visibly filter archive results and communicate active state. Validation: manual desktop/mobile test plus no-break build proof.
- `T040` Title: implement archive text search with graceful fallback. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P3`. Wave: `W2`. Swarm: `discovery-ui`. Est hours: `4`. Dependencies: `["T036"]`. Deliverable: text search UI. Acceptance: search works against build-time data and remains understandable when JS is unavailable. Validation: run a defined query set manually and verify fallback copy.
- `T041` Title: implement preset controls and composed filtering. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P3`. Wave: `W2`. Swarm: `discovery-ui`. Est hours: `4`. Dependencies: `["T037","T039","T040"]`. Deliverable: preset-driven archive UI. Acceptance: presets combine cleanly with search and topic filters. Validation: test preset + search + topic combinations on representative cases.
- `T042` Title: make archive rows informative without hover-only disclosure. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P3`. Wave: `W2`. Swarm: `discovery-ui`. Est hours: `3`. Dependencies: `["T033","T034"]`. Deliverable: improved archive row design. Acceptance: rows expose useful metadata on touch devices and keyboard focus. Validation: manual responsive review on mobile and desktop.
- `T043` Title: add hub/index cards for series and map-of-content posts. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P3`. Wave: `W2`. Swarm: `discovery-ui`. Est hours: `4`. Dependencies: `["T038","T041"]`. Deliverable: hub/index discovery surfaces. Acceptance: index-style posts become explicit entry points rather than just more articles. Validation: verify hubs appear where intended and link correctly.
- `T044` Title: add related-post and cross-series modules on article pages. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P3`. Wave: `W2`. Swarm: `discovery-ui`. Est hours: `4`. Dependencies: `["T038"]`. Deliverable: relationship modules on posts. Acceptance: posts can surface adjacent essays, hubs, or journey entries based on shared metadata. Validation: inspect relation output on pilot and legacy posts.
- `T045` Title: add alternate homepage entry points beyond the depth gallery. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P3`. Wave: `W2`. Swarm: `discovery-ui`. Est hours: `4`. Dependencies: `["T033","T037"]`. Deliverable: homepage discovery panel. Acceptance: a first-time visitor can start the journey, browse research, or open the pilot article intentionally. Validation: manual QA on desktop and mobile with the panel visible and dismissible.
- `T046` Title: add semantic HTML list fallbacks for homepage discovery. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P3`. Wave: `W2`. Swarm: `discovery-ui`. Est hours: `3`. Dependencies: `["T045"]`. Deliverable: semantic discovery list fallback. Acceptance: homepage remains navigable even if the depth gallery is unavailable. Validation: disable JS and verify route access through semantic links.
- `T047` Title: extend sitemap and crawl hints for the new discovery routes. Area: `infra`. Owner role: `Frontend Engineer`. Phase: `P3`. Wave: `W2`. Swarm: `discovery-ui`. Est hours: `2`. Dependencies: `["T043","T045","T046"]`. Deliverable: crawl-aware discovery route output. Acceptance: new discovery routes appear in sitemap and robots guidance where appropriate. Validation: inspect build output and generated sitemap URLs.
- `T048` Title: validate archive, search, and discovery surfaces across devices and input modes. Area: `qa`. Owner role: `QA Engineer`. Phase: `P3`. Wave: `W2`. Swarm: `discovery-ui`. Est hours: `4`. Dependencies: `["T039","T040","T041","T042","T043","T044","T045","T046","T047"]`. Deliverable: discovery QA report. Acceptance: search, filters, presets, and entry points pass desktop, mobile, keyboard, and no-JS checks. Validation: attach build proof plus manual QA evidence.

### Phase 4 — Article Experience Engine and Downstream Mind Pilot

- `T049` Title: define the reusable article experience shell API. Area: `product`. Owner role: `Planner`. Phase: `P4`. Wave: `W1`. Swarm: `experience-primitives`. Est hours: `3`. Dependencies: `["T009","T018","T033"]`. Deliverable: article shell API spec. Acceptance: shell API defines hero, sidecar, navigation, figure slots, callouts, and decoder surfaces. Validation: review API against both pilot and supporting essays.
- `T050` Title: implement the `ArticleShell` abstraction for non-card essays. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P4`. Wave: `W1`. Swarm: `experience-primitives`. Est hours: `5`. Dependencies: `["T049"]`. Deliverable: reusable non-card article shell. Acceptance: non-card essays can render through a configurable shell instead of the generic fallback alone. Validation: render at least one pilot and one supporting essay through the shell.
- `T051` Title: implement concept rail and sidecar primitives. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P4`. Wave: `W1`. Swarm: `experience-primitives`. Est hours: `4`. Dependencies: `["T050"]`. Deliverable: concept rail component set. Acceptance: shell supports sidecar patterns for concepts, clues, and relation surfaces without card-specific assumptions. Validation: manual component QA in at least two article modes.
- `T052` Title: implement layered Easter egg disclosure primitives. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P4`. Wave: `W1`. Swarm: `experience-primitives`. Est hours: `4`. Dependencies: `["T011","T050"]`. Deliverable: Easter egg disclosure components. Acceptance: the UI can reveal visible, discoverable, and decoder-only layers with controlled subtlety. Validation: manual pilot-data render and accessibility review.
- `T053` Title: implement section image choreography primitives. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P4`. Wave: `W1`. Swarm: `experience-primitives`. Est hours: `4`. Dependencies: `["T012","T050"]`. Deliverable: section figure choreography system. Acceptance: articles can place images at section boundaries using metadata rather than hardcoded JSX. Validation: render mocked section image data and verify placements.
- `T054` Title: implement glossary and decoder callout primitives. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P4`. Wave: `W1`. Swarm: `experience-primitives`. Est hours: `3`. Dependencies: `["T030","T050"]`. Deliverable: glossary / decoder components. Acceptance: article pages can expose concepts without collapsing into tooltip spam or over-explanation. Validation: inspect behavior with keyboard focus and long-form prose.
- `T055` Title: implement theme token application by article mode. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P4`. Wave: `W1`. Swarm: `experience-primitives`. Est hours: `3`. Dependencies: `["T009","T050"]`. Deliverable: mode-driven theming layer. Acceptance: non-card essays can carry distinct atmospheres without one-off CSS files per post. Validation: render multiple modes and inspect applied CSS variables.
- `T056` Title: implement section anchors and internal depth navigation for essays. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P4`. Wave: `W1`. Swarm: `experience-primitives`. Est hours: `3`. Dependencies: `["T020","T050"]`. Deliverable: section navigation primitive. Acceptance: essays can surface section-aware navigation, not just generic progress bars. Validation: manual check with long posts and heading extraction.
- `T057` Title: define the Downstream Mind pilot brief from the source doc. Area: `product`. Owner role: `Planner`. Phase: `P4`. Wave: `W2`. Swarm: `downstream-pilot`. Est hours: `3`. Dependencies: `["T026","T029","T030","T049"]`. Deliverable: pilot brief. Acceptance: brief translates the source doc into explicit UI goals, not vague inspiration. Validation: review brief against the processing doc fields and layer notes.
- `T058` Title: implement the Downstream Mind custom article mode. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P4`. Wave: `W2`. Swarm: `downstream-pilot`. Est hours: `6`. Dependencies: `["T050","T055","T057"]`. Deliverable: pilot article mode. Acceptance: The Downstream Mind renders through a dedicated non-card experience mode that still uses shared primitives. Validation: compare rendered pilot against the brief and verify no regression on other posts.
- `T059` Title: implement upstream / downstream directional navigation treatment. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P4`. Wave: `W2`. Swarm: `downstream-pilot`. Est hours: `4`. Dependencies: `["T051","T056","T057","T058"]`. Deliverable: directional navigation surface. Acceptance: the pilot article uses discovery direction as interface logic instead of generic prev/next affordances alone. Validation: manual pilot walkthrough on desktop and mobile.
- `T060` Title: implement section image placements from the source placement guide. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P4`. Wave: `W2`. Swarm: `downstream-pilot`. Est hours: `4`. Dependencies: `["T028","T053","T058"]`. Deliverable: image-driven pilot article. Acceptance: pilot images appear at the intended sections with graceful fallback when assets are unavailable. Validation: compare render order against placement metadata.
- `T061` Title: implement layer-1 and layer-2 Easter egg affordances in the pilot. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P4`. Wave: `W2`. Swarm: `downstream-pilot`. Est hours: `4`. Dependencies: `["T029","T052","T057","T058"]`. Deliverable: overt and subtle Easter egg surfaces. Acceptance: the pilot visibly rewards attention without explaining the whole mechanism immediately. Validation: manual review against the source-doc layer definitions.
- `T062` Title: implement optional decoder surfaces for deeper pilot layers. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P4`. Wave: `W2`. Swarm: `downstream-pilot`. Est hours: `4`. Dependencies: `["T029","T052","T054","T058"]`. Deliverable: decoder / second-pass surface. Acceptance: deeper layers can be surfaced deliberately without flattening the first-read experience. Validation: manual review of both hidden and revealed states.
- `T063` Title: connect The Downstream Mind to related research nodes and site entry points. Area: `frontend`. Owner role: `Frontend Engineer`. Phase: `P4`. Wave: `W2`. Swarm: `downstream-pilot`. Est hours: `3`. Dependencies: `["T038","T044","T058"]`. Deliverable: relationship bridge surfaces. Acceptance: pilot article becomes a gateway into the wider site, not an isolated essay. Validation: inspect relation links and start-flow connections on the rendered page.
- `T064` Title: run taste review and regression pass for the pilot experience. Area: `qa`. Owner role: `QA Engineer`. Phase: `P4`. Wave: `W2`. Swarm: `downstream-pilot`. Est hours: `4`. Dependencies: `["T058","T059","T060","T061","T062","T063"]`. Deliverable: pilot review report. Acceptance: report covers prose readability, subtlety of Easter eggs, responsiveness, and regressions against existing posts. Validation: attach build proof and manual review notes.

### Phase 5 — LLM Entry Surfaces, Hardening, and GitHub Rollout

- `T065` Title: define the `start.txt` audience and narrative contract. Area: `product`. Owner role: `Planner`. Phase: `P5`. Wave: `W1`. Swarm: `llm-surfaces`. Est hours: `2`. Dependencies: `["T014","T033","T057"]`. Deliverable: `start.txt` brief. Acceptance: brief clarifies whether `start.txt` is for humans, LLMs, or both, and what discovery role it plays. Validation: review brief against current text routes and site entry goals.
- `T066` Title: implement the `/start.txt` route. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P5`. Wave: `W1`. Swarm: `llm-surfaces`. Est hours: `3`. Dependencies: `["T065"]`. Deliverable: live `start.txt` route. Acceptance: route provides a concise orientation map into the site’s core journeys, research clusters, and entry articles. Validation: route builds successfully and renders intended plain-text output.
- `T067` Title: refine `/llms.txt` into a more intentional discovery index. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P5`. Wave: `W1`. Swarm: `llm-surfaces`. Est hours: `3`. Dependencies: `["T014","T034","T066"]`. Deliverable: upgraded `llms.txt`. Acceptance: the concise LLM route exposes stronger grouping and starting points than the current flat list. Validation: compare new output against current output for clarity and completeness.
- `T068` Title: extend `/llms-full.txt` with structured series and concept metadata. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P5`. Wave: `W1`. Swarm: `llm-surfaces`. Est hours: `3`. Dependencies: `["T014","T034","T030","T067"]`. Deliverable: upgraded `llms-full.txt`. Acceptance: full text output includes series, relationships, and source-aware metadata where appropriate. Validation: inspect output on pilot and supporting essays.
- `T069` Title: add a machine-readable article manifest route. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P5`. Wave: `W1`. Swarm: `llm-surfaces`. Est hours: `3`. Dependencies: `["T014","T034","T038"]`. Deliverable: machine-readable manifest route. Acceptance: route exposes normalized article metadata in a form better suited to tooling than plain text. Validation: inspect JSON or text manifest against normalized records.
- `T070` Title: add a reference graph output for machine consumption. Area: `data`. Owner role: `Content Systems Engineer`. Phase: `P5`. Wave: `W1`. Swarm: `llm-surfaces`. Est hours: `3`. Dependencies: `["T038","T069"]`. Deliverable: machine-readable reference graph. Acceptance: graph output exposes meaningful relationships among essays, hubs, and journey posts. Validation: inspect graph edges and ensure they match visible site relationships.
- `T071` Title: add validation checks for LLM route freshness and completeness. Area: `qa`. Owner role: `QA Engineer`. Phase: `P5`. Wave: `W1`. Swarm: `llm-surfaces`. Est hours: `2`. Dependencies: `["T066","T067","T068","T069","T070"]`. Deliverable: LLM route validation checks. Acceptance: checks prove the routes include expected entries and do not silently drift out of sync. Validation: run checks against a known article set and inspect failures.
- `T072` Title: QA crawl of text routes, robots, and canonical discovery outputs. Area: `qa`. Owner role: `QA Engineer`. Phase: `P5`. Wave: `W1`. Swarm: `llm-surfaces`. Est hours: `3`. Dependencies: `["T047","T071"]`. Deliverable: crawl QA report. Acceptance: crawl report covers text routes, sitemap output, robots hints, and canonical discovery links. Validation: attach route status results plus manual spot checks.
- `T073` Title: define the new GitHub milestone structure for the upgrade program. Area: `product`. Owner role: `Planner`. Phase: `P5`. Wave: `W2`. Swarm: `github-rollout`. Est hours: `2`. Dependencies: `["T016","T032","T048","T064"]`. Deliverable: milestone structure note. Acceptance: historical milestone work remains distinct from the new upgrade milestones. Validation: review naming and scope boundaries against the phase map.
- `T074` Title: draft issue labels and dependency mapping rules for the new plan. Area: `product`. Owner role: `Planner`. Phase: `P5`. Wave: `W2`. Swarm: `github-rollout`. Est hours: `2`. Dependencies: `["T073"]`. Deliverable: label and issue mapping set. Acceptance: labels cover phase, wave, swarm, area, and status without colliding with historical labels. Validation: verify mapping against the GitHub sync playbook.
- `T075` Title: create the first executable wave issue batch spec. Area: `product`. Owner role: `Planner`. Phase: `P5`. Wave: `W2`. Swarm: `github-rollout`. Est hours: `3`. Dependencies: `["T074"]`. Deliverable: issue batch draft for Wave 1. Acceptance: first issue batch corresponds to the contract-and-audit wave, not the whole plan at once. Validation: confirm tasks, dependencies, and labels line up with the phase graph.
- `T076` Title: add authoring docs for the markdown-first article experience workflow. Area: `product`. Owner role: `Planner`. Phase: `P5`. Wave: `W2`. Swarm: `github-rollout`. Est hours: `3`. Dependencies: `["T024","T050","T066"]`. Deliverable: authoring workflow doc. Acceptance: doc explains how to create or upgrade posts with the new metadata and experience system. Validation: review the doc against the live schema and pilot workflow.
- `T077` Title: add docs for the external Content-Engine to repo publishing bridge. Area: `product`. Owner role: `Planner`. Phase: `P5`. Wave: `W2`. Swarm: `github-rollout`. Est hours: `3`. Dependencies: `["T031","T076"]`. Deliverable: publishing bridge doc. Acceptance: doc explains how to use external processing docs without losing repo-native control. Validation: walkthrough the documented flow with the pilot article source file.
- `T078` Title: add a smoke-test checklist for article experience rollout. Area: `qa`. Owner role: `QA Engineer`. Phase: `P5`. Wave: `W2`. Swarm: `github-rollout`. Est hours: `2`. Dependencies: `["T048","T064","T072"]`. Deliverable: rollout smoke checklist. Acceptance: checklist covers archive routes, article modes, text routes, responsive behavior, and regressions. Validation: apply the checklist to the pilot branch.
- `T079` Title: run full build, performance, accessibility, and regression gates on the upgrade branch. Area: `qa`. Owner role: `QA Engineer`. Phase: `P5`. Wave: `W2`. Swarm: `github-rollout`. Est hours: `4`. Dependencies: `["T023","T048","T064","T072","T078"]`. Deliverable: final verification bundle. Acceptance: bundle proves the upgraded branch is ready for phased landing. Validation: attach build output, route checks, and the agreed manual QA evidence.
- `T080` Title: produce the wave-close review and ship / no-ship recommendation. Area: `product`. Owner role: `Planner`. Phase: `P5`. Wave: `W2`. Swarm: `github-rollout`. Est hours: `2`. Dependencies: `["T073","T074","T075","T076","T077","T078","T079"]`. Deliverable: final review memo. Acceptance: memo states what shipped, what remains gated, and whether to open the next milestone wave. Validation: review memo against all completed evidence artifacts.

## 8. Dependency Rationale

- Phase 1 must happen before any parallel implementation because the requested scope spans shared files and concepts:
  - `src/content.config.ts`
  - `src/pages/posts/[...slug].astro`
  - `src/pages/journeys.astro`
  - `src/pages/llms.txt.ts`
  - `src/pages/llms-full.txt.ts`
- Contract surfaces that must freeze before broad parallel work:
  - article-mode taxonomy
  - extended frontmatter schema
  - Easter egg layer structure
  - section image placement data model
  - archive facet and search behavior
  - `start.txt` and machine-readable route responsibilities
- Phase 2 can partially parallelize schema work and pilot metadata seeding, but only after Phase 1 freezes the schema.
- Phase 3 discovery surfaces can run in parallel with Phase 4 primitive work once the content model is stable, because they rely on the same normalized metadata but touch different UI zones.
- Phase 4 must keep bespoke pilot work behind shared primitives; otherwise the site will accumulate one-off article templates that cannot scale.
- Phase 5 must trail the pilot and archive work because `start.txt`, upgraded `llms.txt`, and machine-readable manifests need the stabilized discovery graph and article metadata.
- GitHub issue recreation should start only after the execution plan is approved, otherwise the repo will get a second historical backlog without a validated contract.

## 9. Verification Strategy

- Task-level proof:
  - schema and content tasks: validation script output plus build proof
  - archive and article UI tasks: responsive manual QA plus screenshot / route proof
  - LLM route tasks: plain-text output inspection plus completeness checks
  - planning / documentation tasks: artifact review against source docs and issue history
- Wave-level gates:
  - Wave 1: audit artifacts exist and identify missing scope cleanly
  - Wave 2: contracts are frozen and no unresolved schema ambiguity remains
  - Phase 2 close: schema validation passes across the full content collection
  - Phase 3 close: discovery surfaces work on desktop, mobile, keyboard, and no-JS fallbacks
  - Phase 4 close: The Downstream Mind pilot is tasteful, legible, and non-regressive
  - Phase 5 close: `start.txt`, `llms.txt`, `llms-full.txt`, manifest, sitemap, and docs all pass smoke checks
- Regression expectations:
  - existing tarot-journey card posts keep their current bespoke experience behavior
  - `journeys` remains usable during archive upgrades
  - text routes remain stable even as metadata expands
  - new article modes do not break legacy posts without experience metadata

## 10. GitHub Sync Strategy

- Do not reopen or mutate Milestone 1 or Milestone 2. Treat them as historical records.
- Create new milestones only after plan approval:
  - Milestone 3: `Upstream Discovery Foundation`
  - Milestone 4: `Archive And Article Engine`
  - Milestone 5: `LLM Entry Surfaces And Hardening`
- Recommended label families:
  - `phase:p1` to `phase:p5`
  - `wave:p1w1` etc.
  - `swarm:baseline-audit`, `swarm:content-audit`, `swarm:metadata-contract`, `swarm:discovery-ui`, `swarm:downstream-pilot`, `swarm:github-rollout`
  - `area:frontend`, `area:data`, `area:qa`, `area:product`, `area:infra`
  - `status:planned`, `status:ready`, `status:in-progress`, `status:in-review`, `status:done`, `status:blocked`
- Issue creation policy:
  - start with Phase 1 Wave 1 only
  - keep one issue per task
  - encode dependencies in the issue body if native dependency tooling is unavailable
  - reserve shared-file lock zones for serialized tasks
- PR linkage expectations:
  - every PR references its owning task ID
  - wave-close PRs summarize completed tasks, unresolved risk, and validation evidence
- Dispatch policy for future agent work:
  - parallelize only after contracts are frozen
  - never launch overlapping workers into `src/pages/posts/[...slug].astro` or `src/content.config.ts` without a scoped integration plan

## 11. Risks and Fallback Plan

- Risk: the article experience system becomes a pile of bespoke one-offs.
  - Trigger: pilot implementation requires repeated article-specific conditionals in the main post page.
  - Fallback: constrain custom behavior behind a strict mode registry and reusable primitives only.
- Risk: external processing docs drift from repo-native content reality.
  - Trigger: import script needs to rewrite published markdown bodies or repeatedly disagrees with live frontmatter.
  - Fallback: limit the bridge to metadata proposal generation and keep body edits manual.
- Risk: archive discovery features add too much client complexity.
  - Trigger: search / filter implementation requires heavyweight hydration or hurts mobile responsiveness.
  - Fallback: move more logic to build-time generated records and keep the UI island minimal.
- Risk: LLM routes expose too much of the Easter egg system too explicitly.
  - Trigger: `start.txt` or `llms.txt` begins to feel like a spoiler layer instead of a discovery map.
  - Fallback: split human invitation language from machine corpus indexing and keep decoder material optional.
- Risk: the Downstream Mind pilot becomes so custom that supporting essays cannot reuse the system.
  - Trigger: pilot code introduces article-specific layout branches beyond the agreed mode API.
  - Fallback: cut the pilot back to shared primitives and ship only the reusable subset first.

## 12. Recommendation

- Approve this plan as the new execution baseline.
- Recreate GitHub tracking starting with Phase 1 Wave 1 only.
- Treat The Downstream Mind as the proving ground for the broader article-experience engine.
- Keep the site Astro-native and markdown-first; add structure through schema, normalization, and reusable render primitives rather than a new CMS.
