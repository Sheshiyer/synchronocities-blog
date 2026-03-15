# Synchronocities Blog — Full Design Overhaul

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform every inside page from generic flat markdown into card-specific immersive reading experiences that match the Three.js depth gallery's visual intensity — unique atmosphere per card, proper typography, reading UX, and journey navigation.

**Architecture:** Astro SSG with React islands, Tailwind CSS v4, GSAP for page animations, card-specific color theming via CSS custom properties injected per-post. Each blog post gets its own visual atmosphere derived from its tarot card's palette (extracted from the card images). The post layout becomes a dynamic template that adapts its hero, background gradient, typography accents, and ambient effects to the specific card.

**Tech Stack:** Astro 6, React 19, Tailwind CSS 4, GSAP 3.14, Three.js 0.183, CSS custom properties, WebP card images

---

## Discovery Summary

- **Planning depth:** Deeply detailed (40-50 tasks)
- **Delivery mode:** Production
- **Team topology:** Solo (Shesh + noesisX)
- **Quality bar:** Visual polish matching the depth gallery, responsive, accessible prose
- **External constraints:** No Tailwind Typography plugin installed, no font files present, prose styles broken

## Critical Gaps Found

1. **No font files** — Panchang and Satoshi are `@font-face` declared but not in `public/fonts/`
2. **No `@tailwindcss/typography`** — `prose prose-invert prose-gold` classes do nothing
3. **No card-specific theming** — every post page identical dark background
4. **No card image on post pages** — tarot art not shown
5. **No ambient background** — flat void-black vs the animated shader blobs on index
6. **No journey navigation** — no prev/next card progression
7. **No reading experience design** — no drop caps, pull quotes, or emphasis styling
8. **Text likely truncated** — prose container may clip content without proper typography

---

## Phase Map

| Phase | Focus | Tasks |
|-------|-------|-------|
| **Phase 1: Foundation** | Fix broken fundamentals (fonts, prose, build) | 1-8 |
| **Phase 2: Card-Specific Theming** | Per-card color injection, backgrounds, gradients | 9-18 |
| **Phase 3: Post Page Redesign** | Hero section, card art, layout, reading UX | 19-30 |
| **Phase 4: Unique Card Experiences** | Per-card ambient effects, animations, atmosphere | 31-38 |
| **Phase 5: Navigation & Polish** | Journey nav, card index pages, transitions, responsive | 39-48 |

---

## Phase 1: Foundation (Wave 1 — Fix What's Broken)

### Swarm 1A: Typography Infrastructure

### Task 1: Install Panchang and Satoshi font files

**Files:**
- Create: `public/fonts/Panchang-Variable.woff2`
- Create: `public/fonts/Satoshi-Variable.woff2`

**Step 1:** Download Panchang Variable from Indian Type Foundry (or use a substitute like Space Grotesk if unavailable). Download Satoshi Variable from Fontshare.

**Step 2:** Place `.woff2` files in `public/fonts/`

**Step 3:** Verify fonts load by running `npm run dev` and checking Network tab

**Step 4:** Commit
```bash
git add public/fonts/
git commit -m "feat: add Panchang and Satoshi variable font files"
```

### Task 2: Add Tailwind Typography plugin for prose styling

**Files:**
- Modify: `package.json`
- Modify: `src/styles/global.css`

**Step 1:** Install `@tailwindcss/typography`
```bash
npm install @tailwindcss/typography
```

**Step 2:** Import in `global.css` at the top:
```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

Note: Tailwind CSS v4 uses `@plugin` syntax instead of config file plugins.

**Step 3:** Verify `prose` classes render correctly on a post page

**Step 4:** Commit

### Task 3: Create custom prose theme matching Synchronocities design tokens

**Files:**
- Modify: `src/styles/global.css`

**Step 1:** Add prose customization after the existing global styles:
```css
/* ── Prose — Synchronocities Reading Experience ── */
.prose-synchronocities {
  --tw-prose-body: var(--color-parchment);
  --tw-prose-headings: var(--color-parchment);
  --tw-prose-links: var(--color-sacred-gold);
  --tw-prose-bold: var(--color-parchment);
  --tw-prose-quotes: var(--color-muted-silver);
  --tw-prose-quote-borders: var(--color-sacred-gold);
  --tw-prose-code: var(--color-coherence-emerald);
  --tw-prose-hr: rgba(197, 160, 23, 0.2);
  font-family: var(--font-body);
  font-size: 1.125rem;
  line-height: 1.8;
  letter-spacing: 0.01em;
}

.prose-synchronocities p {
  margin-bottom: 1.75em;
  max-width: none;
  opacity: 0.92;
}

.prose-synchronocities strong {
  color: var(--color-parchment);
  font-weight: 600;
}

.prose-synchronocities em {
  color: var(--color-sacred-gold);
  font-style: italic;
  opacity: 0.9;
}

.prose-synchronocities blockquote {
  border-left: 2px solid var(--color-sacred-gold);
  padding-left: 1.5em;
  font-style: italic;
  color: var(--color-muted-silver);
  opacity: 0.85;
}

.prose-synchronocities h2, .prose-synchronocities h3 {
  font-family: var(--font-display);
  margin-top: 2.5em;
}
```

**Step 2:** Update `[...slug].astro` to use new prose class instead of `prose prose-invert prose-gold`

**Step 3:** Verify text renders beautifully with proper spacing, font, and color

**Step 4:** Commit

### Task 4: Add drop cap styling for first paragraph of each post

**Files:**
- Modify: `src/styles/global.css`

**Step 1:** Add first-letter styling:
```css
.prose-synchronocities > p:first-of-type::first-letter {
  font-family: var(--font-display);
  font-size: 3.5em;
  float: left;
  line-height: 0.8;
  margin-right: 0.1em;
  margin-top: 0.1em;
  color: var(--card-accent, var(--color-sacred-gold));
  font-weight: 700;
}
```

The `--card-accent` variable will be injected per-card in Phase 2.

**Step 2:** Verify drop cap appears on first paragraph

**Step 3:** Commit

### Swarm 1B: Build Verification

### Task 5: Verify all prose content renders completely (no truncation)

**Files:**
- Modify: `src/pages/posts/[...slug].astro`

**Step 1:** Remove `max-w-[680px]` constraint or ensure it doesn't clip content. Replace with responsive width:
```
max-w-[720px] mx-auto px-6 md:px-8
```

**Step 2:** Ensure no `overflow: hidden` or `line-clamp` on the content container

**Step 3:** Visit each post URL and confirm full text renders

**Step 4:** Commit

### Task 6: Fix BaseLayout to support per-page custom properties

**Files:**
- Modify: `src/layouts/BaseLayout.astro`

**Step 1:** Add optional `cardStyles` prop:
```astro
interface Props {
  title: string;
  description?: string;
  ogImage?: string;
  cardStyles?: string;
}
```

**Step 2:** Inject `cardStyles` as inline `<style>` in `<body>`:
```html
<body class="..." style={cardStyles || ''}>
```

**Step 3:** Commit

### Task 7: Create card color mapping utility

**Files:**
- Create: `src/lib/cardColors.ts`

**Step 1:** Create a utility that maps card numerals to their image-extracted color palettes:
```typescript
export interface CardPalette {
  backgroundColor: string;
  blob1Color: string;
  blob2Color: string;
  accentColor: string;
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
  textureSrc: string;
}

export const CARD_PALETTES: Record<string, CardPalette> = {
  '0': {
    backgroundColor: '#0D1033', blob1Color: '#3A6BD4', blob2Color: '#6B3FA0',
    accentColor: '#C5A030',
    gradientFrom: '#0D1033', gradientVia: '#1A1560', gradientTo: '#6B3FA0',
    textureSrc: '/cards/tarot-00-fool.webp',
  },
  'IX': {
    backgroundColor: '#1A1E2E', blob1Color: '#4A3F6B', blob2Color: '#2D5B45',
    accentColor: '#8B7DA8',
    gradientFrom: '#1A1E2E', gradientVia: '#2A2D44', gradientTo: '#2D5B45',
    textureSrc: '/cards/tarot-09-hermit.webp',
  },
  'XIV': {
    backgroundColor: '#1A2E1A', blob1Color: '#2D8B5E', blob2Color: '#6B3FA0',
    accentColor: '#C5A030',
    gradientFrom: '#1A2E1A', gradientVia: '#1A3D2A', gradientTo: '#2D8B5E',
    textureSrc: '/cards/tarot-14-art.webp',
  },
  'XVI': {
    backgroundColor: '#1A0E08', blob1Color: '#C65D3B', blob2Color: '#D4A020',
    accentColor: '#C65D3B',
    gradientFrom: '#1A0E08', gradientVia: '#2D1510', gradientTo: '#C65D3B',
    textureSrc: '/cards/tarot-16-tower.webp',
  },
  'XVII': {
    backgroundColor: '#0A1530', blob1Color: '#D4B030', blob2Color: '#1A6B8A',
    accentColor: '#D4B030',
    gradientFrom: '#0A1530', gradientVia: '#0E2040', gradientTo: '#1A6B8A',
    textureSrc: '/cards/tarot-17-star.webp',
  },
  'XVIII': {
    backgroundColor: '#0A0D2E', blob1Color: '#4A3FD4', blob2Color: '#6B3FA0',
    accentColor: '#8AB0D4',
    gradientFrom: '#0A0D2E', gradientVia: '#151840', gradientTo: '#4A3FD4',
    textureSrc: '/cards/tarot-18-moon.webp',
  },
  'XX': {
    backgroundColor: '#0D1428', blob1Color: '#2D8B5E', blob2Color: '#6B3FA0',
    accentColor: '#D4B030',
    gradientFrom: '#0D1428', gradientVia: '#1A2040', gradientTo: '#2D8B5E',
    textureSrc: '/cards/tarot-20-aeon.webp',
  },
  'XXI': {
    backgroundColor: '#0A1A1E', blob1Color: '#1A6B5E', blob2Color: '#C5A030',
    accentColor: '#C5A030',
    gradientFrom: '#0A1A1E', gradientVia: '#102A28', gradientTo: '#1A6B5E',
    textureSrc: '/cards/tarot-21-universe.webp',
  },
};

export function getCardPalette(numeral: string): CardPalette | undefined {
  return CARD_PALETTES[numeral];
}
```

**Step 2:** Commit

### Task 8: Build and verify foundation changes

**Step 1:** Run `npm run build`
**Step 2:** Run `npm run preview` and check a post page
**Step 3:** Commit all foundation work

---

## Phase 2: Card-Specific Theming (Wave 2 — Unique Colors Per Card)

### Swarm 2A: CSS Variable Injection

### Task 9: Inject card CSS custom properties into post page

**Files:**
- Modify: `src/pages/posts/[...slug].astro`

**Step 1:** Import `getCardPalette` and generate inline CSS vars:
```astro
import { getCardPalette } from '../../lib/cardColors';
const palette = post.data.card ? getCardPalette(post.data.card) : null;
const cardVars = palette ? `
  --card-bg: ${palette.backgroundColor};
  --card-blob1: ${palette.blob1Color};
  --card-blob2: ${palette.blob2Color};
  --card-accent: ${palette.accentColor};
  --card-gradient-from: ${palette.gradientFrom};
  --card-gradient-via: ${palette.gradientVia};
  --card-gradient-to: ${palette.gradientTo};
  --card-texture: url(${palette.textureSrc});
` : '';
```

**Step 2:** Apply to the `<article>` wrapper:
```html
<article class="relative min-h-screen" style={cardVars}>
```

**Step 3:** Commit

### Task 10: Add card-specific background gradient to post pages

**Files:**
- Modify: `src/pages/posts/[...slug].astro`

**Step 1:** Add a fixed background gradient layer:
```html
<div
  class="fixed inset-0 -z-10"
  style={palette ? `background: linear-gradient(170deg, ${palette.gradientFrom} 0%, ${palette.gradientVia} 40%, ${palette.gradientTo} 100%);` : `background: var(--color-void-black);`}
/>
```

**Step 2:** Add subtle noise/grain overlay on top of gradient:
```html
<div
  class="fixed inset-0 -z-[5] opacity-[0.03] pointer-events-none"
  style="background-image: url('data:image/svg+xml,...'); background-size: 200px;"
/>
```

**Step 3:** Verify each post has a unique gradient background

**Step 4:** Commit

### Task 11: Style the gold divider line using card accent color

**Files:**
- Modify: `src/pages/posts/[...slug].astro`

**Step 1:** Replace the hardcoded gold divider with card-accent-aware:
```html
<div class="mt-8 h-px w-full"
  style={`background: linear-gradient(90deg, transparent 0%, ${palette?.accentColor || 'var(--color-sacred-gold)'} 50%, transparent 100%); opacity: 0.3;`}
/>
```

**Step 2:** Commit

### Task 12: Color the card numeral ghost text with card palette

**Files:**
- Modify: `src/pages/posts/[...slug].astro`

**Step 1:** Update the 68px numeral to use `--card-accent`:
```html
style={`font-family: var(--font-display); color: ${palette?.accentColor || card?.color || 'var(--color-sacred-gold)'};`}
```

**Step 2:** Commit

### Task 13: Style keywords and hero phase labels per card

**Files:**
- Modify: `src/pages/posts/[...slug].astro`

**Step 1:** The thoth name badge uses card accent color
**Step 2:** The keyword uses blob1 color subtly
**Step 3:** Commit

### Swarm 2B: Element-Specific Styling

### Task 14: Create element-based CSS classes (Fire, Water, Air, Earth)

**Files:**
- Modify: `src/styles/global.css`

**Step 1:** Add element-specific utility classes:
```css
/* ── Element Themes ── */
[data-element="Fire"] { --element-glow: rgba(198, 93, 59, 0.15); }
[data-element="Water"] { --element-glow: rgba(11, 80, 251, 0.15); }
[data-element="Air"] { --element-glow: rgba(240, 237, 227, 0.08); }
[data-element="Earth"] { --element-glow: rgba(16, 181, 167, 0.15); }
```

**Step 2:** Apply `data-element` attribute to post article based on card element

**Step 3:** Commit

### Task 15: Style blockquotes per element type

**Files:**
- Modify: `src/styles/global.css`

**Step 1:** Override blockquote border-left color per element:
```css
[data-element="Fire"] .prose-synchronocities blockquote {
  border-left-color: var(--color-terracotta);
}
[data-element="Water"] .prose-synchronocities blockquote {
  border-left-color: var(--color-flow-indigo);
}
/* etc. */
```

**Step 2:** Commit

### Task 16: Style emphasized text (*italic*) per card

**Files:**
- Modify: `src/styles/global.css`

**Step 1:** Make `em` in prose use card accent color:
```css
.prose-synchronocities em {
  color: var(--card-accent, var(--color-sacred-gold));
}
```

**Step 2:** Commit

### Task 17: Style bold text (**strong**) to use card blob1 color

**Files:**
- Modify: `src/styles/global.css`

**Step 1:** Make bold words pop with card-derived color subtly:
```css
.prose-synchronocities strong {
  color: var(--color-parchment);
  text-shadow: 0 0 20px var(--card-blob1, transparent);
}
```

**Step 2:** Commit

### Task 18: Add card-specific selection highlight color

**Files:**
- Modify: `src/styles/global.css`

**Step 1:** Override selection color per card:
```css
article[style*="--card-accent"] ::selection {
  background-color: var(--card-blob2, var(--color-witness-violet));
}
```

**Step 2:** Commit

---

## Phase 3: Post Page Redesign (Wave 3 — Hero & Layout)

### Swarm 3A: Hero Section

### Task 19: Create immersive hero section with card image

**Files:**
- Modify: `src/pages/posts/[...slug].astro`

**Step 1:** Replace the plain header with a full-bleed hero:
```html
<section class="relative h-[70vh] min-h-[500px] flex items-end overflow-hidden">
  <!-- Card image as background -->
  {palette?.textureSrc && (
    <div class="absolute inset-0">
      <img
        src={palette.textureSrc}
        alt={card?.thothName || ''}
        class="w-full h-full object-cover object-center opacity-40"
        style="mask-image: linear-gradient(to bottom, black 40%, transparent 100%);"
      />
    </div>
  )}
  <!-- Gradient overlay -->
  <div class="absolute inset-0"
    style={`background: linear-gradient(to top, ${palette?.backgroundColor || 'var(--color-void-black)'} 0%, transparent 60%);`}
  />
  <!-- Hero content -->
  <div class="relative z-10 px-8 pb-12 max-w-[780px] mx-auto w-full">
    ...numeral, thothName, title, metadata...
  </div>
</section>
```

**Step 2:** Style the numeral as a massive ghost watermark (120px+) behind the title

**Step 3:** Commit

### Task 20: Add scroll-triggered fade-in for hero content

**Files:**
- Create: `src/components/PostHero.tsx` (React island for animation)

**Step 1:** Create a React component that uses GSAP for entrance animation:
- Title fades up from below
- Numeral scales from 0.8 to 1
- Metadata fades in with stagger

**Step 2:** Wire as `client:load` component in `[...slug].astro`

**Step 3:** Commit

### Task 21: Add parallax scroll effect on hero card image

**Files:**
- Modify: `src/components/PostHero.tsx`

**Step 1:** Use GSAP ScrollTrigger (or simple scroll listener) to move the card image at 0.5x scroll speed for parallax depth

**Step 2:** Commit

### Swarm 3B: Reading Experience

### Task 22: Redesign post content container with better reading width

**Files:**
- Modify: `src/pages/posts/[...slug].astro`

**Step 1:** Use optimal reading width (65-75 characters):
```html
<div class="px-6 md:px-8 pb-20 max-w-[720px] mx-auto prose-synchronocities">
```

**Step 2:** Commit

### Task 23: Add subtle side decoration (vertical line or dots)

**Files:**
- Modify: `src/styles/global.css`

**Step 1:** Add a thin vertical line on the left margin using card accent color:
```css
.prose-synchronocities {
  border-left: 1px solid var(--card-accent, transparent);
  border-left-opacity: 0.08;
  padding-left: 2rem;
}
```

Or use a dot pattern that echoes the tarot's mystical aesthetic.

**Step 2:** Commit

### Task 24: Style horizontal rules (---) as card-themed dividers

**Files:**
- Modify: `src/styles/global.css`

**Step 1:** Replace default `<hr>` with a centered ornamental divider:
```css
.prose-synchronocities hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--card-accent, var(--color-sacred-gold)), transparent);
  opacity: 0.2;
  margin: 3em auto;
  max-width: 200px;
}
```

**Step 2:** Commit

### Task 25: Add reading progress indicator

**Files:**
- Create: `src/components/ReadingProgress.tsx`

**Step 1:** Create a thin progress bar at the top of the viewport that fills as you scroll, colored with `--card-accent`

**Step 2:** Wire as `client:load` in `[...slug].astro`

**Step 3:** Commit

### Task 26: Style code/pre blocks with card-themed backgrounds

**Files:**
- Modify: `src/styles/global.css`

**Step 1:**
```css
.prose-synchronocities code {
  background: rgba(14, 20, 40, 0.6);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-size: 0.85em;
  color: var(--color-coherence-emerald);
}
```

**Step 2:** Commit

### Swarm 3C: Metadata & Identity Display

### Task 27: Create kosha indicator badge with gradient

**Files:**
- Modify: `src/pages/posts/[...slug].astro`

**Step 1:** Display kosha (body layer) as a styled badge:
```
annamaya → Physical (Earth tones)
pranamaya → Vital (Blue-green)
manomaya → Mental (Indigo)
vijnanamaya → Wisdom (Purple-gold)
anandamaya → Bliss (Gold-white)
```

Each with its own gradient background color.

**Step 2:** Commit

### Task 28: Display identity transition (Shesh → Pichet → The Witness)

**Files:**
- Modify: `src/pages/posts/[...slug].astro`

**Step 1:** Show identity as a subtle label near the kosha badge, with different opacity/style per identity to show the progression

**Step 2:** Commit

### Task 29: Add location breadcrumb with journey trail

**Files:**
- Modify: `src/pages/posts/[...slug].astro`

**Step 1:** Display location (Mumbai → Bangkok → Chiang Mai → etc.) with a subtle line connecting to the journey trail concept

**Step 2:** Commit

### Task 30: Style tags as tarot-themed tokens

**Files:**
- Modify: `src/pages/posts/[...slug].astro`

**Step 1:** Replace plain gray tag pills with glass-morphic tokens using card accent:
```css
background: rgba(var(--card-blob1-rgb), 0.08);
border: 1px solid rgba(var(--card-accent-rgb), 0.15);
backdrop-filter: blur(4px);
```

**Step 2:** Commit

---

## Phase 4: Unique Card Experiences (Wave 4 — Card-Specific Atmosphere)

### Swarm 4A: Ambient Effects

### Task 31: Create CSS ambient glow effect behind card image in hero

**Files:**
- Modify: `src/styles/global.css`

**Step 1:** Add a radial glow that uses the card's blob colors:
```css
.card-hero-glow::after {
  content: '';
  position: absolute;
  width: 60%;
  height: 60%;
  top: 20%;
  left: 20%;
  background: radial-gradient(ellipse, var(--card-blob1) 0%, transparent 70%);
  opacity: 0.15;
  filter: blur(60px);
  animation: glow-drift 8s ease-in-out infinite alternate;
  pointer-events: none;
}
```

**Step 2:** Commit

### Task 32: Add element-specific ambient particle/texture effect

**Files:**
- Create: `src/components/AmbientEffect.tsx`

**Step 1:** Create subtle CSS-only ambient effects per element:
- **Fire (Tower):** Subtle ember particles floating up (CSS animation)
- **Water (Moon, Star):** Gentle wave-like horizontal drift
- **Air (Fool, Aeon):** Floating dust motes
- **Earth (Hermit, Art, Universe):** Very subtle ground texture

Use CSS `@keyframes` and pseudo-elements — no heavy JS.

**Step 2:** Commit

### Task 33: The Fool — starfield/cosmic dust hero background

**Files:**
- Modify: Post-specific styling via card palette

**Step 1:** For card "0", add a CSS starfield effect (small white dots with varying opacity on the gradient background). The Fool leaps into the cosmic void.

**Step 2:** Commit

### Task 34: The Tower — subtle screen shake on first load

**Files:**
- Modify: `src/components/PostHero.tsx`

**Step 1:** For card "XVI", add a tiny CSS shake animation that plays once on page load (2-3 frames, very subtle) echoing the earthquake theme.

**Step 2:** Commit

### Task 35: The Moon — refraction/prismatic accent on headings

**Files:**
- Modify: `src/styles/global.css`

**Step 1:** For card "XVIII", add a subtle chromatic split on heading text using `text-shadow` with slight RGB offset — echoing the refraction theme.

**Step 2:** Commit

### Task 36: The Star — gentle golden pulse glow on drop cap

**Files:**
- Modify: `src/styles/global.css`

**Step 1:** For card "XVII", the drop cap letter has a slow breathing golden glow animation.

**Step 2:** Commit

### Task 37: The Universe — mandala-like ornamental border

**Files:**
- Modify: Post layout for card "XXI"

**Step 1:** Add a subtle circular ornamental SVG border or frame around the hero section, echoing the mandala in the Universe card image.

**Step 2:** Commit

### Task 38: The Hermit — reduced UI, minimal ornamentation

**Files:**
- Modify: Post layout for card "IX"

**Step 1:** For the Hermit, REMOVE extra decorations. The Hermit's design language is absence — no glow, no particles, muted colors, maximum whitespace. The stillness IS the design.

**Step 2:** Commit

---

## Phase 5: Navigation & Polish (Wave 5 — Journey Flow)

### Swarm 5A: Journey Navigation

### Task 39: Add previous/next card navigation at post footer

**Files:**
- Modify: `src/pages/posts/[...slug].astro`

**Step 1:** Create navigation links to previous and next posts in the spiral order:
```
← The Fool (0)          The Hermit (IX) →
   Ordinary World          Approach to Innermost Cave
```

Use card accent colors for each direction's link.

**Step 2:** Commit

### Task 40: Create journey progress indicator

**Files:**
- Create: `src/components/JourneyProgress.tsx`

**Step 1:** A horizontal bar showing 8 dots (one per card in the journey). Current card dot is highlighted with its accent color. Others are muted. Shows position in the spiral.

**Step 2:** Place at the top of the post page, below the nav bar.

**Step 3:** Commit

### Task 41: Add "Return to Spiral" button that scrolls to current card position

**Files:**
- Modify: `src/pages/posts/[...slug].astro`

**Step 1:** Update the "Return to Spiral" link to include a hash/query param so the depth gallery scrolls to this card's position on return:
```
href={`/?card=${post.data.card}`}
```

**Step 2:** Handle the query param in `DepthGallery.tsx` to auto-scroll to the right depth.

**Step 3:** Commit

### Swarm 5B: Card Index Page Redesign

### Task 42: Redesign card index page (`/card/[card]`) with card atmosphere

**Files:**
- Modify: `src/pages/card/[card].astro`

**Step 1:** Apply the same card-specific gradient background and color theming from the post pages.

**Step 2:** Add the card image as a hero element.

**Step 3:** Commit

### Task 43: Add card description/meaning to card index page

**Files:**
- Modify: `src/pages/card/[card].astro`
- Modify: `src/lib/tarot.ts`

**Step 1:** Add a `description` field to the tarot data with a 1-2 sentence meaning for each card.

**Step 2:** Display below the card name on the index page.

**Step 3:** Commit

### Swarm 5C: Responsive & Animation Polish

### Task 44: Mobile-optimize the post hero section

**Files:**
- Modify: `src/pages/posts/[...slug].astro`
- Modify: `src/styles/global.css`

**Step 1:** On mobile (< 768px):
- Hero height reduced to 50vh
- Numeral size reduced
- Padding adjusted
- Card image positioning tuned

**Step 2:** Commit

### Task 45: Mobile-optimize the reading experience

**Files:**
- Modify: `src/styles/global.css`

**Step 1:** On mobile:
- Font size slightly smaller (1rem vs 1.125rem)
- Padding reduced
- Drop cap size reduced
- Side decoration hidden

**Step 2:** Commit

### Task 46: Add page transition animation between gallery and post

**Files:**
- Create: `src/components/PageTransition.tsx` or use Astro View Transitions

**Step 1:** Add `<ViewTransitions />` to BaseLayout for smooth page transitions.

**Step 2:** Add `transition:name` attributes to shared elements (title, numeral) for morphing transitions.

**Step 3:** Commit

### Task 47: Add scroll-triggered reveal animations for content paragraphs

**Files:**
- Create: `src/components/ScrollReveal.tsx`

**Step 1:** Paragraphs in the prose container fade in as they scroll into view. Subtle — just opacity 0→1 and translateY 10px→0.

**Step 2:** Use Intersection Observer (lightweight, no GSAP dependency needed).

**Step 3:** Commit

### Task 48: Final build verification and visual QA

**Step 1:** Run `npm run build` — verify zero errors
**Step 2:** Run `npm run preview`
**Step 3:** Visit every post page — verify:
- Card-specific gradient background renders
- Card image shows in hero
- Text fully renders (no truncation)
- Drop cap appears with card accent color
- Fonts load correctly
- Mobile responsive
- Prev/next navigation works
- Journey progress indicator shows correct position

**Step 4:** Commit all remaining changes

---

## Dependency Rationale

```
Task 1-2 → Task 3 (fonts/typography must exist before prose styling)
Task 3 → Task 4 (prose must work before drop cap)
Task 7 → Task 9 (color utility must exist before injection)
Task 9 → Tasks 10-18 (CSS vars must be injected before used)
Task 9 → Tasks 19-21 (hero needs card colors)
Tasks 19-30 → Tasks 31-38 (layout must exist before card-specific effects)
Tasks 1-30 → Tasks 39-48 (core experience before navigation/polish)
```

## Verification Strategy

Each task ends with visual verification:
- `npm run build` passes
- Browser inspection of affected pages
- Mobile viewport check for responsive tasks
- Font loading confirmed via Network tab

## Risks & Fallback

| Risk | Mitigation |
|------|-----------|
| Fonts unavailable (Panchang/Satoshi) | Use fallback: Space Grotesk + Inter |
| GSAP too heavy for simple animations | Fallback to CSS-only animations |
| Card-specific effects too jarring | Each effect has `opacity` control, can be dialed to 0 |
| View Transitions API support | Progressive enhancement — works without it |
