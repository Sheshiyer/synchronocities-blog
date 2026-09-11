<p align="center">
  <img src="public/cards/tarot-synthesis.webp" width="200" alt="Synchronocities" />
</p>

<h1 align="center">Synchronocities</h1>

<p align="center">
  <em>A 55-day mythic journey through Thailand, told as a depth-scrolling tarot gallery.</em>
</p>

<p align="center">
  <a href="https://synchronocities.tryambakam.space">Live Site</a> &middot;
  <a href="docs/INFRA.md">Infrastructure</a> &middot;
  <a href="https://github.com/Sheshiyer/synchronocities-blog/milestone/1">Milestone 1</a> &middot;
  <a href="https://github.com/Sheshiyer/synchronocities-blog/milestone/2">Milestone 2</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Astro-6.0-BC52EE?style=flat-square&logo=astro" alt="Astro 6" />
  <img src="https://img.shields.io/badge/Three.js-r183-000000?style=flat-square&logo=three.js" alt="Three.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/Tailwind-4.2-06B6D4?style=flat-square&logo=tailwind-css" alt="Tailwind 4" />
  <img src="https://img.shields.io/badge/entries-126-C5A017?style=flat-square" alt="126 Entries" />
  <img src="https://img.shields.io/badge/tarot%20cards-43-2D0050?style=flat-square" alt="43 Card Entries" />
</p>

---

> ### Status — verified 2026-09-12
>
> **Live on Cloudflare.** The site runs on Workers Static Assets at
> **[synchronocities.tryambakam.space](https://synchronocities.tryambakam.space)**; the AI
> backend runs at `synchronocities-ai.tryambakam.space`. The `.com` canonical is not in
> use — `tryambakam.com` is still on GoDaddy nameservers, so no Cloudflare custom domain
> can bind to it.
>
> **Inference is split across two providers.** The NVIDIA NIM tier lost 2 of the 5
> configured models in seven weeks, so embeddings and rerank now run on Nebius
> (`Qwen3-Embedding-8B` @ 1024-d, `Qwen3-30B-A3B-Instruct-2507`) while chat and safety
> stay on NIM. `/search` and `/chat` are working again.
>
> Full verified map, evidence, and re-verification commands: **[`docs/INFRA.md`](docs/INFRA.md)**.
> Agent working context: **[`AGENTS.md`](AGENTS.md)**.

## The Experience

Content lives on the **Z-axis** — not a feed. The homepage is a Three.js depth gallery where each blog post is a floating tarot card plane. Scroll through depth, click to read. No pagination, no sidebar, no archive page.

The archive holds 126 entries. 43 of them carry a tarot card and form the travelogue
spiral; the other 83 are essays, hubs, and references reached through `/research` and
`/maps`. The spiral itself:

```
0   The Fool Before the Leap        Mumbai → Shenzhen
    Deep-Trench Forge               Shenzhen
    Who TF is Shesh                 Bangalore → Bangkok
XVI The Tower Speaks in Richter     Bangkok (Room 44 / Building 555)
    Arrival in Room 3               Bangkok
    Timelessness Dilation           Bangkok
    The Sword of Speech             Bangkok
    Ports of Call                   Bangkok
    The Fool's Satchel              Bangkok
    Bangkok Initiation              Bangkok → Koh Samui
XVII The Star Names You             Koh Samui (Songkran)
XVIII The Moon Refracts Everything  Koh Phangan (Thong Nai Pan)
IX  The Hermit: 72 Hours           Bangkok (Noble 33, Room 95)
XIV Temperance Compresses           Chiang Mai (Blue Dream, Room 23)
    Circle over Inanna              Bangkok (Circle Tower, Room 3902)
XX  Judgement: Re-collection        Pai (Shaya Suandoi, Room 10)
XXI The Seventh Floor               Chiang Mai (Y Residence, Room 707)
    The Earthquake Goodbye          Bangkok (Rhythm Sukhumvit)
XXI The Universe: Four Creatures    Bangkok (return — spiral complete)
    Master Synthesis                Thailand (55-day integration)
```

## What Makes It Different

**Each post is its own world.** Not a template with different colors — genuinely different layouts:

| Layout | Card | Visual Character |
|--------|------|-----------------|
| `cosmic-void` | The Fool | Centered, floating in starfield |
| `earthquake` | The Tower | Left-heavy, urgent, shake animation on load |
| `water-healing` | The Star | Centered, generous whitespace, flowing |
| `crescent` | The Moon | Asymmetric offset, prismatic heading refraction |
| `hermit-minimal` | The Hermit | Ultra-narrow 520px, stripped of all decoration |
| `alchemical` | Art/Temperance | Two-column with Easter egg sidebar |
| `spiral-recursive` | The Aeon | Recursive structure with sidebar |
| `four-quadrant` | The Universe | Wide layout with four-creature sidebar |

**Easter eggs from the actual journey** — room numbers, numerology, breath patterns, and synchronicities hidden in hover-to-reveal sidebars. Room 44, Building 555, Noble 33, Blue Dream 23, Room 707 — all real places with real meaning.

## Architecture

```
src/
├── experience/              # Three.js depth gallery engine
│   ├── Engine.js            # Scene, camera, renderer, texture preloader
│   ├── Experience.js        # Orchestrator (Gallery + Background + Trail + Label)
│   ├── Gallery.js           # Z-axis planes with parallax + breath animation
│   ├── Scroll.js            # Wheel/touch → camera Z + velocity tracking
│   ├── galleryData.ts       # Maps card entries → unique depth planes
│   ├── Background/          # GLSL shader — mood-reactive blob gradients
│   │   └── shaders/         # Vertex + fragment shaders
│   └── Plane/shaders/       # Per-card procedural GLSL
├── content/posts/           # 126 entries — 43 tarot-card, 83 essay/hub/reference
├── components/
│   ├── DepthGallery.tsx     # React island — Three.js canvas wrapper
│   ├── ReadingProgress.tsx  # Scroll-driven reading progress bar
│   ├── ScrollReveal.tsx     # IntersectionObserver paragraph reveal
│   ├── JourneyProgress.tsx  # Journey position indicator
│   ├── CorpusChat.tsx       # SSE chat island → Worker /chat
│   └── ResearchDiscovery.tsx / ArchiveDiscovery.tsx / ConstellationGrid.tsx
├── lib/
│   ├── tarot.ts             # 22 Major Arcana + 4 suits data
│   ├── cardColors.ts        # Per-card color palettes (image-extracted)
│   ├── cardExperience.ts    # Per-card Easter eggs, layout types, quotes
│   └── aiClient.ts          # Worker client (PUBLIC_AI_BASE_URL override)
├── pages/
│   ├── index.astro          # Depth gallery homepage
│   ├── posts/[...slug].astro # Immersive post pages (8 layout types)
│   ├── card/[card].astro    # Card index pages
│   ├── journeys / research / maps / chat .astro
│   └── llms.txt.ts · llms-full.txt.ts · llms-manifest.json.ts · start.txt.ts
├── layouts/BaseLayout.astro # Shell with View Transitions
└── styles/global.css        # Design tokens + 8 card-specific CSS layouts

workers/                     # synchronocities-ai — Cloudflare Worker (NVIDIA NIM router)
quality-engine/              # Nigredo/Albedo/Rubedo content-quality audit engine
scripts/                     # validate-post-metadata · ci-audit · semantic-vectorizer
docs/                        # INFRA.md · VOICE.md · TAGS.md · plans/ · audit artifacts
```

## AI Layer

`workers/` deploys **`synchronocities-ai`**, a Cloudflare Worker fronting NVIDIA NIM:
semantic search, SSE RAG chat, related-posts kNN, LLM rerank, concept clustering, and
content-safety screening. Bindings: Vectorize (`synchronocities-corpus`), R2
(`synchronocities-artifacts`), KV query cache, and a 20 req/min ratelimit on `/chat`.
The frontend reaches it through `src/lib/aiClient.ts`.

See [`workers/README.md`](workers/README.md) for the route and auth tables, and
[`docs/INFRA.md`](docs/INFRA.md) for verified live state (including the current
embedding-model outage).

## Content Model

```yaml
---
title: "The Tower Speaks in Richter Scale"
date: 2025-03-15
card: "XVI"              # Major Arcana numeral (optional)
suit: disks              # wands | cups | swords | disks
phase: 7                 # Hero's Journey phase (1-12)
location: "Bangkok"
revolution: 1            # Spiral revolution number
kosha: "manomaya"        # annamaya | pranamaya | manomaya | vijnanamaya | anandamaya
identity: "Shesh"        # Identity state (Shesh → Pichet → The Witness)
featured_image: "/cards/tarot-16-tower.webp"
excerpt: "..."
tags: ["earthquake", "tower", "rupture"]
---
```

## Stack

| Layer | Tech |
|-------|------|
| Framework | Astro 6 (SSG) |
| Interactive | React 19 + Three.js r183 |
| Shaders | GLSL via vite-plugin-glsl |
| Styling | Tailwind CSS v4 + @tailwindcss/typography |
| Animation | CSS keyframes + GSAP 3 |
| Typography | Panchang (display) + Satoshi (body) |
| Transitions | Astro ClientRouter (View Transitions API) |
| Images | AI-generated (Nano Banana 2) → WebP optimized |

## Development

```bash
npm install
npm run dev              # localhost:4321
npm run build            # prebuild runs validate:posts; static output → dist/ (153 pages)
npm run test             # node --test over tests/*.test.ts
npm run validate:posts   # frontmatter + tag-taxonomy gate
```

> If you see Vite cache errors after changes, run `rm -rf node_modules/.vite` then restart.

### Deploying

```bash
npm run build && wrangler deploy                          # site  → synchronocities.tryambakam.space
cd workers && wrangler deploy --config ./wrangler.toml    # AI    → synchronocities-ai.tryambakam.space
```

The `--config` flag on the second command is required — without it Wrangler resolves the
root `wrangler.jsonc` and redeploys the site instead. Neither unit has a deploy workflow
yet; see [`docs/INFRA.md`](docs/INFRA.md) §5.

## Quality & Semantic QA

The local QA similarity checker (`scripts/semantic-vectorizer.py`) measures each post against the canonical PASS posts and writes `docs/semantic-similarity-report.json`.

> ⚠️ **Currently broken.** `nvidia/nv-embedqa-e5-v5` reached end-of-life on 2026-08-25
> and returns HTTP 410. Every path below that embeds new text fails until a replacement
> model and a full reindex land — see [`docs/INFRA.md`](docs/INFRA.md).

**Single embedding language:** e5-v5 (`nvidia/nv-embedqa-e5-v5`, 1024-d, cosine), served by the `synchronocities-ai` Cloudflare Worker — the same model and text form (title + excerpt + cleaned body[:800]) that embeds the production Vectorize index `synchronocities-corpus`. Local and production scores are directly comparable.

```bash
python scripts/semantic-vectorizer.py   # embeds via the Worker (default)
```

Auth: the Worker's `/test/*` routes are admin-gated — provide `ADMIN_API_KEY` as an env var or in `workers/.env` (gitignored). A fully-offline escape hatch exists behind `--offline` (requires `sentence-transformers`, uses `intfloat/e5-large-v2` — same e5 family), but the Worker path is the default and needs no local model. The old local MiniLM stack (384-d) was removed: it produced scores in a different vector language than the production index.

## Design System

Colors from the Consciousness Color Spectrum (Goethe's Zur Farbenlehre):

| Token | Hex | Role |
|-------|-----|------|
| Void Black | `#070B1D` | Canvas ground |
| Deep Surface | `#0E1428` | Card surfaces |
| Witness Violet | `#2D0050` | Depth, selection |
| Flow Indigo | `#0B50FB` | Water element |
| Sacred Gold | `#C5A017` | Accents, links |
| Coherence Emerald | `#10B5A7` | Earth element |
| Terracotta | `#C65D3B` | Fire element |
| Parchment | `#F0EDE3` | Body text |
| Muted Silver | `#8A9BA8` | Secondary text |

Each card extracts its own palette from its AI-generated tarot illustration. The GLSL background shader blends blob colors per-card as the camera moves through depth.

## The Journey

A Tryambakam Noesis sub-brand documenting a 55-day mythic journey through Thailand (March–May 2025). The tarot's Major Arcana serves as both navigation architecture and narrative framework. Identity evolves across the spiral: **Shesh → Pichet → The Witness**.

---

<p align="center">
  <sub>Part of the <a href="https://tryambakam.com">Tryambakam Noesis</a> ecosystem</sub>
</p>
