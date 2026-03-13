# Synchronocities

A non-linear depth gallery blog built on the Thoth tarot as navigation architecture. Content lives on Z-axis planes — scroll through depth, not down a feed.

Part of the [Tryambakam Noesis](https://tryambakam.com) ecosystem.

## Architecture

**Astro 6** static shell + **React** island for the interactive depth gallery. Blog posts are markdown files with tarot-mapped frontmatter. The homepage is a Three.js depth gallery — no traditional blog layout.

```
src/
├── experience/          # Three.js depth gallery engine
│   ├── Engine.js        # Scene, camera, renderer, animation loop
│   ├── Experience.js    # Orchestrator (Gallery + Background + Trail + CardLabel)
│   ├── Gallery.js       # Z-axis stacked planes with parallax + breath animation
│   ├── Scroll.js        # Wheel/touch → camera Z movement + velocity tracking
│   ├── Trail.js         # CatmullRom spline trail with tapered tube geometry
│   ├── TrailController.js
│   ├── TrailHeadParticles.js
│   ├── CardLabel.js     # DOM overlay — tarot numeral, name, keyword, hero phase
│   ├── galleryData.ts   # Maps blog posts → depth planes with TN brand colors
│   └── Background/      # GLSL shader — mood-reactive blob animation
├── content/posts/       # Markdown blog posts with tarot frontmatter
├── components/
│   └── DepthGallery.tsx # React wrapper (client:only island)
├── pages/
│   ├── index.astro      # Depth gallery homepage
│   ├── posts/[...slug].astro
│   └── card/[card].astro
├── lib/tarot.ts         # 22 Major Arcana data + 4 suits
└── styles/global.css    # TN design tokens + card label styles
```

## Content Model

Posts use tarot-mapped frontmatter:

```yaml
---
title: "The Tower Speaks in Richter Scale"
date: 2025-03-15
card: XVI           # Major Arcana position (0-XXI)
phase: 1            # Hero's Journey phase (1-12)
location: "Bangkok"
kosha: "manomaya"   # Consciousness layer
identity: "Shesh"   # Identity state at time of writing
tags: ["earthquake", "tower", "rupture"]
excerpt: "..."
---
```

Cards map to the Hero's Journey. Each card position on the depth gallery carries its own color palette from the Consciousness Color Spectrum (Goethe's Zur Farbenlehre → Kha-Ba-La framework).

## Stack

| Layer | Tech |
|-------|------|
| Framework | Astro 6 |
| Interactive UI | React 19 + Three.js r183 |
| Shaders | GLSL via vite-plugin-glsl |
| Styling | Tailwind CSS v4 |
| Animation | GSAP 3 |
| Typography | Panchang (display) + Satoshi (body) + SF Mono (code) |

## Development

```bash
npm install
npm run dev       # localhost:4321
npm run build     # static output → dist/
```

## Design System

Colors from Tryambakam Noesis brand:

- **Void Black** `#070B1D` — canvas ground
- **Sacred Gold** `#C5A017` — trail, accents, constellation grid
- **Witness Violet** `#2D0050` — depth, emissive glow
- **Flow Indigo** `#0B50FB` — consciousness spectrum endpoint
- **Muted Silver** `#8A9BA8` — secondary text

The GLSL background shader blends blob colors per-card as the camera moves through depth. Each tarot position carries its own `backgroundColor`, `blob1Color`, `blob2Color` derived from the Kha arc gradient.

## Current Content

8 posts spanning the first revolution of the Hero's Journey:

| Card | Name | Post |
|------|------|------|
| 0 | The Fool | The Fool Before the Leap |
| IX | The Hermit | 72 Hours of Silence |
| XIV | Art | Temperance Compresses to Essence |
| XVI | The Tower | The Tower Speaks in Richter Scale |
| XVII | The Star | The Star Names You |
| XVIII | The Moon | The Moon Refracts Everything |
| XX | The Aeon | Recollection in PAI |
| XXI | The Universe | Four Creatures Assemble |

## License

MIT
