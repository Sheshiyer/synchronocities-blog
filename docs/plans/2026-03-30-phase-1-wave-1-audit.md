# Synchronocities Phase 1 Wave 1 Audit

Date: 2026-03-30

This audit completes the first execution wave of the upstream discovery upgrade plan. It answers eight questions:

1. What from Milestone 1 and Milestone 2 still exists in source?
2. What is the live GitHub backlog state now?
3. Which routes and components currently own reading, archive, and LLM surfaces?
4. What content types actually exist in `src/content/posts`?
5. How much of the site gets a bespoke article mode today?
6. What LLM entry surfaces already exist, and what is missing?
7. What richer metadata exists outside the repo for the Downstream Mind pilot?
8. What gaps remain between the user request and current implementation?

## T001 — Historical Milestone To Code Audit

### Summary

- Milestone 1 (`Design Overhaul: Immersive Post Pages`) contained 48 issues.
- Milestone 2 (`Unique Immersive Layouts: One Experience Per Card`) contained 10 issues.
- Milestone 1 source audit result:
  - `35` shipped
  - `7` partial
  - `1` missing
  - `5` obsolete delivery checkpoints or superseded ideas
- Milestone 2 source audit result:
  - `5` shipped
  - `5` partial
  - `0` missing
  - `0` obsolete

### Milestone 1 Matrix

| Issue | Title | Status | Current evidence |
|---|---|---|---|
| `#1` | Install Panchang and Satoshi font files | `shipped` | Font files exist in `public/fonts/`; loaded in `src/styles/global.css`; preloaded in `src/layouts/BaseLayout.astro`. |
| `#2` | Add Tailwind Typography plugin | `shipped` | `@tailwindcss/typography` is present in `package.json` and imported via `@plugin` in `src/styles/global.css`. |
| `#3` | Create custom prose theme | `shipped` | `.prose-synchronocities` and its typography rules live in `src/styles/global.css`. |
| `#4` | Add drop cap styling | `shipped` | First-letter styling exists in `.prose-synchronocities > p:first-of-type::first-letter`. |
| `#5` | Verify prose content renders completely | `shipped` | The post body now renders inside `#post-reading` without clamp logic in `src/pages/posts/[...slug].astro`. |
| `#6` | Add `cardStyles` prop to `BaseLayout` | `shipped` | `cardStyles` is defined and applied in `src/layouts/BaseLayout.astro`. |
| `#7` | Create card color mapping utility | `shipped` | `src/lib/cardColors.ts` is imported by post and card routes. |
| `#8` | Build verification for Phase 1 | `obsolete` | This was a delivery checkpoint, not a persistent source artifact. |
| `#9` | Inject card CSS custom properties into post pages | `shipped` | `cardVars` is built and applied on the `<article>` element in `src/pages/posts/[...slug].astro`. |
| `#10` | Add card-specific background gradient | `shipped` | `bgGradient` is derived from `getCardPalette()` and rendered as a fixed background layer. |
| `#11` | Style divider line using card accent color | `shipped` | Divider color is derived from `palette?.accentColor` and used in header/body separators. |
| `#12` | Color numeral ghost text with card palette | `shipped` | The hero numeral uses `palette?.accentColor` in the post header. |
| `#13` | Style keywords and hero phase labels per card | `shipped` | Card keyword and hero phase labels are rendered in accent-aware metadata rows. |
| `#14` | Create element-based CSS classes | `shipped` | `data-element` is set on posts and element-specific prose/ambient rules exist in `src/styles/global.css`. |
| `#15` | Style blockquotes per element type | `shipped` | Fire/Water/Air/Earth blockquote overrides exist in `src/styles/global.css`. |
| `#16` | Style emphasized text per card | `shipped` | `.prose-synchronocities em` consumes `--card-accent`. |
| `#17` | Style bold text with card blob glow | `shipped` | `.prose-synchronocities strong` applies `text-shadow` from `--card-blob1`. |
| `#18` | Card-specific selection highlight | `shipped` | `[style*="--card-accent"] ::selection` exists in `src/styles/global.css`. |
| `#19` | Create immersive hero section with card image | `shipped` | Full-bleed hero image, overlap title block, and gradient mask are in `src/pages/posts/[...slug].astro`. |
| `#20` | GSAP fade-in for hero content | `obsolete` | The requested `PostHero.tsx` island is not present; later reading UX work favored calmer reading surfaces over more hero animation. |
| `#21` | Add hero parallax scroll | `obsolete` | No post-hero parallax logic exists; later UX planning explicitly reduced motion on reading surfaces. |
| `#22` | Redesign content container with reading width | `shipped` | `.post-content-area` plus layout-specific prose widths are defined in `src/styles/global.css`. |
| `#23` | Add subtle side decoration | `obsolete` | The dedicated decorative rail did not survive; the current design uses TOC/back-to-top and synchronicity sidebars instead. |
| `#24` | Style horizontal rules as card-themed dividers | `shipped` | `.prose-synchronocities hr` is card-accent driven in `src/styles/global.css`. |
| `#25` | Add reading progress indicator | `shipped` | `src/components/ReadingProgress.tsx` is mounted in the post route. |
| `#26` | Style code/pre blocks with card-themed backgrounds | `shipped` | `code` and `pre` styles are defined in `src/styles/global.css`. |
| `#27` | Create kosha indicator badge with gradient | `partial` | `kosha` data is shown in the metadata row, but only as colored text, not a true badge treatment. |
| `#28` | Display identity transition styling | `partial` | `identity` is surfaced in the metadata row, but not as a dedicated transition treatment. |
| `#29` | Add location breadcrumb with journey trail | `partial` | `location` is displayed, but there is no breadcrumb or trail visualization. |
| `#30` | Style tags as glassmorphic tarot tokens | `partial` | Tags exist in archive and next-post surfaces, but the post page does not render a dedicated tarot-token tag row. |
| `#31` | Ambient glow behind hero image | `shipped` | Radial glow layers are rendered behind the hero and ambient effects container. |
| `#32` | Element-specific ambient particle effects | `partial` | Fire and Water receive ambient behavior, but the effect set is incomplete across all elemental modes. |
| `#33` | Fool starfield hero background | `shipped` | `data-card="0"` starfield/twinkle rules exist in `src/styles/global.css`. |
| `#34` | Tower subtle screen shake | `shipped` | `tower-shake` is applied to `data-card="XVI"`. |
| `#35` | Moon prismatic refraction on headings | `shipped` | `data-card="XVIII"` heading refraction rules exist. |
| `#36` | Star golden pulse glow on drop cap | `shipped` | `data-card="XVII"` animates the first-letter drop cap. |
| `#37` | Universe mandala border | `shipped` | `data-card="XXI"` renders a rotating mandala-like hero ring. |
| `#38` | Hermit reduced UI / minimal ornamentation | `shipped` | `hermit-minimal` layout and effect suppression are implemented. |
| `#39` | Add prev/next card navigation at footer | `partial` | `NextPostReveal` handles next-post continuation only; `prevPost` is computed but not rendered. |
| `#40` | Create journey progress indicator | `shipped` | `JourneyProgress` is wired into the post template and styled in `src/styles/global.css`. |
| `#41` | Return to Spiral scrolls to current card position | `missing` | The `/?card={numeral}` behavior is not implemented in `src/pages/index.astro` or `src/components/DepthGallery.tsx`. |
| `#42` | Redesign card index page with card atmosphere | `shipped` | `src/pages/card/[card].astro` renders gradient hero, card image, accent styling, and card-specific listing. |
| `#43` | Add card description to card index page | `partial` | The page shows keyword and hero phase, but no `description` field exists in `src/lib/tarot.ts`. |
| `#44` | Mobile-optimize post hero section | `shipped` | Mobile-specific hero sizing and metadata placement exist in `src/pages/posts/[...slug].astro`. |
| `#45` | Mobile-optimize reading experience | `shipped` | Responsive prose sizing, mobile TOC/back-to-top, and reduced-motion behavior exist. |
| `#46` | Add page transition animation | `shipped` | `ClientRouter` plus `::view-transition-*` rules are present. |
| `#47` | Scroll-triggered reveal animations | `shipped` | `ScrollReveal` is mounted on posts and uses `IntersectionObserver`. |
| `#48` | Final build verification and visual QA | `obsolete` | This was a milestone checkpoint, not a durable source artifact. |

### Milestone 2 Matrix

| Issue | Title | Status | Current evidence |
|---|---|---|---|
| `#49` | Full-width layout system with card-specific rendering | `shipped` | `experience?.layout` drives multiple layout branches and matching CSS layout systems. |
| `#50` | Fool cosmic void layout | `shipped` | `cardExperience.ts` maps card `0` to `cosmic-void`; CSS supports centered/floating treatment and starfield effects. |
| `#51` | Tower earthquake layout | `partial` | Shake animation, room/easter-egg data, and layout exist, but the issue’s split-screen crack/timeline treatment is not visible in current source. |
| `#52` | Star water healing layout | `shipped` | `water-healing` layout plus star pulse and centered prose treatment exist. |
| `#53` | Moon crescent geometry layout | `shipped` | `crescent` layout and prismatic heading accent are implemented. |
| `#54` | Hermit ultra-minimal layout | `shipped` | `hermit-minimal` is implemented with reduced width and stripped effects. |
| `#55` | Temperance alchemical dual-stream layout | `partial` | `alchemical` layout and Easter egg data exist, but the two-stream merging structure is not explicit in the template. |
| `#56` | Aeon spiral/recursive layout | `partial` | `spiral-recursive` layout exists, but the recursive content structure is light compared with the original issue body. |
| `#57` | Universe four-quadrant mandala layout | `partial` | Universe-specific data and mandala atmosphere exist, but the full four-creature quadrant structure is not explicit in the route template. |
| `#58` | Easter egg system | `partial` | Hover/reveal and room-number metadata exist for card posts, but the richer interactive numerology and hidden metadata system is not generalized. |

### Historical Reading

The historical redesign work was real and substantial. It permanently changed the site from generic markdown pages into an Astro post shell with tarot-aware theming, multiple card layouts, ambient effects, TOC/progress aids, and card index pages. The unresolved residue is concentrated in three areas:

- motion-heavy hero ideas that were later softened or dropped
- footer/navigation ideas that only partially survived
- richer card-specific structural layouts that were simplified into a reusable post shell plus sidebars

## T002 — Live GitHub Backlog Snapshot

### Current state

- Open issues: `8`
- Open milestones with active work: `1`
- Active milestone: `Upstream Discovery Foundation` (`milestone/3`)
- Open work is entirely Phase 1 Wave 1 audit backlog:
  - `#128` T001
  - `#135` T002
  - `#133` T003
  - `#132` T004
  - `#134` T005
  - `#131` T006
  - `#129` T007
  - `#130` T008

### Interpretation

- The repo had no live backlog before this wave.
- Historical milestones 1 and 2 are closed baselines, not current execution plans.
- Milestone 3 successfully re-established a working upgrade backlog, but only for audit and contract freeze work so far.

## T003 — Route And Component Inventory

### Route inventory

| Route | File | Current role | Current limits |
|---|---|---|---|
| `/` | `src/pages/index.astro` | Depth-gallery landing page powered by `DepthGallery` | No explicit onboarding panel, no keyboard-first alternative, no article discovery tools. |
| `/journeys` | `src/pages/journeys.astro` | Archive page split into `Major Arcana`, `Topics`, and `All Writings` | Topic chips are decorative only; no search, no presets, no real filters. |
| `/posts/[...slug]` | `src/pages/posts/[...slug].astro` | Main article renderer with card-aware shell | Bespoke experience logic only exists for mapped card posts; non-card essays fall back to generic layout. |
| `/card/[card]` | `src/pages/card/[card].astro` | Card index / aggregation page | Good atmospheric shell, but card descriptions remain lightweight. |
| `/llms.txt` | `src/pages/llms.txt.ts` | Concise LLM-oriented article directory | No `start.txt`, no curated entry path, no machine-readable manifest. |
| `/llms-full.txt` | `src/pages/llms-full.txt.ts` | Full raw markdown export for all published posts | Raw-body dump only; no richer metadata, section manifests, or pilot-specific structure. |

### Primary component inventory

| Component | Role | Wired into |
|---|---|---|
| `src/components/DepthGallery.tsx` | Three.js click-to-open discovery canvas | `/` |
| `src/components/JourneysAnimator.tsx` | GSAP archive motion layer | `/journeys` |
| `src/components/JourneyProgress.tsx` | Canonical journey rail | `/posts/[...slug]` |
| `src/components/ReadingProgress.tsx` | Top reading progress + section/minutes context | `/posts/[...slug]` |
| `src/components/ScrollReveal.tsx` | Paragraph reveal for long-form reading | `/posts/[...slug]` |
| `src/components/PostTOC.tsx` | Heading-based table of contents | `/posts/[...slug]` |
| `src/components/BackToTop.tsx` | Utility actions (`Back to top`, `Back to journey`) | `/posts/[...slug]` |
| `src/components/NextPostReveal.tsx` | Opt-in continuation surface | `/posts/[...slug]` |

### Dormant / currently unwired discovery components

- `src/components/SpiralTimeline.tsx`
- `src/components/ConstellationGrid.tsx`

These appear to be alternate discovery primitives that are present in source but not mounted by any current route.

## T004 — Published Content Inventory

### Counts

| Category | Count | Notes |
|---|---:|---|
| Tarot card posts | `12` | Eight mapped card numerals, with repeated numerals for multi-entry journey arcs. |
| Non-card essays | `73` | Standard essays and research posts that are not hubs or indexes. |
| Hub / index essays | `3` | `consciousness-architecture-hub`, `lorenz-kundli-pattern-hub`, `lorenz-kundli-system-index`. |
| Draft posts | `0` | `draft` exists in schema but is unused right now. |
| Hidden posts | `0` | `hidden` exists in schema but is unused right now. |
| Total posts | `88` | Matches `src/content/posts`. |

### Card coverage by numeral

| Card numeral | Post count | Current mapped layout |
|---|---:|---|
| `0` | `2` | `cosmic-void` |
| `IX` | `1` | `hermit-minimal` |
| `XIV` | `2` | `alchemical` |
| `XVI` | `1` | `earthquake` |
| `XVII` | `1` | `water-healing` |
| `XVIII` | `1` | `crescent` |
| `XX` | `1` | `spiral-recursive` |
| `XXI` | `3` | `four-quadrant` |

### Structural reading

- The repo is not a 20-post tarot-only blog anymore.
- It is now a large markdown-first research library with a tarot-origin visual shell.
- The current discovery and article systems still primarily think in terms of tarot journey posts, while the content set is now dominated by non-card essays.

## T005 — Article-Mode Coverage And Fallbacks

### Current behavior

- `src/pages/posts/[...slug].astro` computes:
  - `card` from `post.data.card`
  - `palette` from `getCardPalette(post.data.card)`
  - `experience` from `getCardExperience(post.data.card)`
- The page chooses `layout = experience?.layout || 'cosmic-void'`.

### Effective coverage

| Population | Count | Behavior |
|---|---:|---|
| Card-tagged posts with mapped experience | `12` | Receive palette, pull quote, room/easter-egg sidebars, breath/sensory metadata, and one of eight layout modes. |
| Non-card essays | `76` | Receive hero image fallback and generic post shell; no article-specific metadata system, no article experience registry, no easter-egg schema. |
| Future card posts outside the mapped registry | `0` today | Would fall back to `cosmic-void` because `experience` would be `null`. |

### Implication

The site already solved “one experience per mapped tarot card,” but it has not solved “one authored experience per article archetype.” That is the exact gap the user is asking to close.

## T006 — LLM Surface Audit

### Existing surfaces

| Route | Purpose | Current output |
|---|---|---|
| `/llms.txt` | Concise directory | Site summary, topic bullets, article links, excerpts, sitemap/archive/home links. |
| `/llms-full.txt` | Full corpus dump | Per-post URL/date/summary/tags/card/kosha metadata plus raw markdown body. |

### Missing surfaces

- No `/start.txt` route exists.
- No machine-readable manifest route exists.
- No curated “begin here” document exists for LLMs or humans.
- No route distinguishes foundational essays from the full corpus.
- No route exposes richer metadata such as article mode, hub/index role, image choreography, or easter-egg layers.

### Structural reading

Current LLM support is useful, but it is still only a two-tier export model:

- a link directory
- a raw corpus dump

It does not yet provide a high-signal guided entry layer.

## T007 — External Metadata Delta For The Downstream Mind

### Published repo post

`src/content/posts/the-downstream-mind.md` currently stores only:

- `title`
- `date`
- `revolution`
- `draft`
- `excerpt`
- `featured_image`
- `tags`

### External processing draft

`/Volumes/madara/2026/twc-vault/01-Projects/Content-Engine/_processing/downstream-mind-2026-03-08.md` also stores:

- `subtitle`
- `platform`
- `author`
- `status`
- expanded tag set
- `vault_sources`
- `kha_ba_la_mapping`
- `word_count`
- image set and placement guide
- `quality_gates_passed`
- seven explicit easter-egg layers
- section-acrostic metadata
- Major Arcana section mapping
- image serial code metadata
- abstract case-study / byline signal metadata
- first-sentence quine metadata

### Delta table

| Dimension | External draft | Published repo post | Gap |
|---|---|---|---|
| Subtitle and byline | Present as structured metadata | Present only as body copy, not structured frontmatter | Missing article-display schema |
| Source provenance | `platform`, `status`, `vault_sources`, quality gates | None | Missing import provenance contract |
| Symbolic structure | `kha_ba_la_mapping`, Arcana layer mapping, quine metadata | None | Missing article-experience metadata model |
| Images | Header + section images + closing image + placement guide | Single `featured_image` | Missing section-level image choreography |
| Easter eggs | Seven explicit machine-readable layers | Concepts appear in prose, but not in metadata | Missing easter-egg layer schema |
| Date normalization | External draft is `2026-03-08` | Published post is `2025-06-10` | Needs source-vs-publish date policy |

### Interpretation

The Downstream Mind is already the right pilot article because it contains the missing contract in miniature:

- layered easter eggs
- explicit symbolic mappings
- multiple image placements
- provenance and validation metadata
- a strong need for article-specific presentation

## T008 — Prioritized Gap Matrix

| Requested capability | Current state | Evidence | Priority |
|---|---|---|---|
| Preserve markdown-first Astro blog workflow | `present` | `astro:content` collections and `src/content/posts/*.md` are the live source of truth | `baseline` |
| Astro wiki backend / markdown push workflow inside this repo | `not present in repo` | No `astro-wiki` package or import bridge exists; the repo is plain Astro + content collections | `high` |
| Existing upgrade plan for current scope | `partial` | Historical plans exist for immersive card pages and reading UX, but not for article-wide indexing + `start.txt` + source-import metadata | `high` |
| Per-article UI for non-card essays | `partial` | Card posts have bespoke modes; non-card essays fall through generic shell | `critical` |
| Generalized easter-egg system | `partial` | Card-only easter-egg sidebars exist; no reusable schema for essays | `critical` |
| Archive filters | `missing` | Topic chips on `/journeys` are static spans | `critical` |
| Archive search and presets | `missing` | No search field, no preset state, no empty-state logic | `critical` |
| Homepage onboarding / alternate entry points | `planned historically, not shipped` | Reading UX plan proposed `HomeStartPanel`; source does not contain it | `medium` |
| Keyboard / screen-reader alternative to canvas-first home | `planned historically, not shipped` | Depth gallery remains click-to-open canvas flow | `medium` |
| `start.txt` LLM entry route | `missing` | Only `/llms.txt` and `/llms-full.txt` exist | `critical` |
| Curated LLM manifest / structured discovery | `missing` | No machine-readable route or foundational-entry surface | `high` |
| Downstream Mind pilot using richer external metadata | `partial` | Article exists, but external processing metadata is not represented in schema or UI | `critical` |
| Source-import bridge from external processing docs | `missing` | No mapping utility or import normalization layer exists in repo | `high` |

## Readout

The repo already completed the tarot-post redesign. It did not yet complete the next layer that the user is actually asking for:

- article-class experiences beyond tarot cards
- real discovery and retrieval surfaces
- a curated LLM starting surface
- a structured import bridge from richer external markdown processing docs

That means the new upgrade plan is justified. It is not duplicating Milestone 1 or Milestone 2. It is building the missing article-discovery layer on top of them.
