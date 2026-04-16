# Reading UX and Navigation Refinement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve reading comfort, navigation clarity, homepage discoverability, and archive usability without flattening the blog's visual identity.

**Architecture:** Keep the existing Astro + React split. Use Astro for structural page changes, lightweight React islands only where interaction is genuinely needed, and avoid new dependencies unless the existing stack cannot support the behavior. Reduce ambient motion in reading contexts while preserving the more expressive tone on discovery surfaces.

**Tech Stack:** Astro 6, React 19, Tailwind CSS v4, GSAP, Three.js, Astro content collections

---

## Priority Ladder

### P0: Critical fixes before any polish

1. Stabilize the post progress rail and remove duplicate React keys.
2. Stop forced auto-navigation into the next post.
3. Fix mobile post-page first-screen readability.

### P1: Quick wins with high UX return

4. Add explicit homepage onboarding and alternate entry points.
5. Calm long-form reading mode and support reduced motion.
6. Improve inline reading aids: TOC, back-to-top, clearer progress context.
7. Make `Journeys` cards actually informative.

### P2: Medium effort improvements

8. Turn the `Journeys` topic chips into real filters.
9. Add archive presets and search.
10. Add a keyboard and screen-reader equivalent for the depth gallery.

### P3: Structural follow-up

11. Rebalance post-page annotation design so side content helps rather than competes.
12. Rework the next-post transition into an opt-in continuation surface.

---

## Task 1: Stabilize the Journey Progress Rail

**Priority:** P0  
**Impact:** High  
**Effort:** Small

**Files:**
- Modify: `src/pages/posts/[...slug].astro`
- Modify: `src/components/JourneyProgress.tsx`
- Modify: `src/styles/global.css`

**Implementation steps:**
1. In `src/pages/posts/[...slug].astro`, split journey navigation data from the full post list.
2. Build `journeyCards` from canonical tarot-journey posts only, not every post in the collection.
3. In `src/components/JourneyProgress.tsx`, change the wrapper key from `card.numeral` to `card.slug`.
4. Add `label` and `title` fields to each journey item so the component can expose meaningful text.
5. Set each anchor `aria-label` to a readable string such as `Go to The Fool — Deep-Trench Forge: Shenzhen`.
6. In `src/styles/global.css`, add a compact mobile style so the rail does not dominate the top of the viewport.
7. Verify that non-card posts no longer appear as `?` dots in the rail.

**Verification:**
- Run: `npm run build`
- Manual: open one card post and confirm no duplicate-key console errors.
- Manual: verify the rail only shows the canonical journey sequence and remains readable on mobile.

**Why first:** It is both a runtime bug and a UX bug.

---

## Task 2: Remove Forced Next-Post Navigation

**Priority:** P0  
**Impact:** High  
**Effort:** Small

**Files:**
- Modify: `src/components/NextPostReveal.tsx`
- Modify: `src/pages/posts/[...slug].astro`

**Implementation steps:**
1. In `src/components/NextPostReveal.tsx`, remove the `window.location.href` auto-navigation path.
2. Replace the implicit completion trigger with explicit CTAs: `Read Next`, `Back to Spiral`, and `Stay Here`.
3. Shorten the reveal section from `350vh` to a less punishing range.
4. Preserve the atmospheric transition, but make it optional rather than mandatory.
5. Add a visible fallback link that works even if JS is disabled or GSAP misbehaves.

**Verification:**
- Run: `npm run build`
- Manual: finish a post and confirm the page never navigates without a click/tap.
- Manual: verify the next-post surface still feels intentional on desktop and mobile.

**Why first:** Losing reader control is the sharpest reading-flow break on the site.

---

## Task 3: Compress the Mobile Post Hero

**Priority:** P0  
**Impact:** High  
**Effort:** Medium

**Files:**
- Modify: `src/pages/posts/[...slug].astro`
- Modify: `src/styles/global.css`

**Implementation steps:**
1. Reduce mobile hero image height in `src/pages/posts/[...slug].astro`.
2. Scale down the oversized numeral and title stack for screens under `768px`.
3. Move location and room metadata out of the hero image overlay into the main metadata row on mobile.
4. Tighten hero spacing so the first paragraph starts closer to the first viewport.
5. Add a mobile-specific header layout rule in `src/styles/global.css` so the title block stops feeling like a poster and starts feeling like a reading surface.

**Verification:**
- Run: `npm run build`
- Manual: confirm the first viewport shows title, metadata, and the start of reading intent on mobile.
- Manual: confirm desktop layout remains immersive.

**Why first:** Current mobile first-screen density delays the start of reading too much.

---

## Task 4: Add Explicit Homepage Onboarding

**Priority:** P1  
**Impact:** High  
**Effort:** Medium

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/components/DepthGallery.tsx`
- Create: `src/components/HomeStartPanel.astro`
- Modify: `src/styles/global.css`

**Implementation steps:**
1. Create `src/components/HomeStartPanel.astro` for a lightweight overlay panel.
2. In `src/pages/index.astro`, mount the panel above the gallery without hiding the artwork.
3. Add three primary actions: `Start the Journey`, `Browse All Writings`, `Latest Entry`.
4. Keep the panel dismissible after interaction so regular readers still get the pure gallery mode.
5. Add one sentence that explains the interaction model in plain language.
6. In `src/components/DepthGallery.tsx`, keep click-to-open behavior, but stop relying on that as the only discoverable path.

**Verification:**
- Run: `npm run build`
- Manual: confirm a first-time visitor can understand what the homepage does without guesswork.
- Manual: confirm the overlay does not crowd the desktop composition or break mobile.

**Why now:** This is the simplest change with the biggest discovery payoff.

---

## Task 5: Calm Reading Mode and Add Reduced-Motion Support

**Priority:** P1  
**Impact:** High  
**Effort:** Medium

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/components/ScrollReveal.tsx`
- Modify: `src/components/NextPostReveal.tsx`
- Modify: `src/components/ReadingProgress.tsx`

**Implementation steps:**
1. Add `@media (prefers-reduced-motion: reduce)` rules that disable decorative keyframes and GSAP-heavy flourish.
2. In `src/components/ScrollReveal.tsx`, short-circuit reveal behavior when reduced motion is requested.
3. Tone down paragraph reveal defaults even for normal motion, especially on long-form post pages.
4. Reduce visual noise behind the prose column by softening texture and ambient animation in reading contexts.
5. Keep the homepage and archive pages more expressive than post pages.

**Verification:**
- Run: `npm run build`
- Manual: test with reduced motion enabled and confirm paragraphs appear immediately.
- Manual: compare desktop reading comfort before and after on a long post.

**Why now:** The site has strong atmosphere; this step protects the actual reading experience.

---

## Task 6: Add Real Reading Aids

**Priority:** P1  
**Impact:** High  
**Effort:** Medium

**Files:**
- Modify: `src/pages/posts/[...slug].astro`
- Modify: `src/components/ReadingProgress.tsx`
- Create: `src/components/PostTOC.tsx`
- Create: `src/components/BackToTop.tsx`
- Modify: `src/styles/global.css`

**Implementation steps:**
1. Create `src/components/PostTOC.tsx` that extracts `h2` and `h3` anchors from rendered content.
2. Place the TOC above or beside the prose depending on breakpoint.
3. Create `src/components/BackToTop.tsx` with `Back to top` and `Back to journey` actions.
4. Extend `src/components/ReadingProgress.tsx` to optionally show `x min left` or current section context.
5. Add styles that keep these aids helpful, not dashboard-like.

**Verification:**
- Run: `npm run build`
- Manual: confirm a long post is skimmable by heading.
- Manual: confirm the utility controls do not obscure copy on mobile.

**Why now:** These changes improve comprehension without changing the writing.

---

## Task 7: Repair Journeys Card Information Design

**Priority:** P1  
**Impact:** Medium  
**Effort:** Small

**Files:**
- Modify: `src/pages/journeys.astro`

**Implementation steps:**
1. Populate the `Major Arcana` card excerpt block with the actual `post.data.excerpt`.
2. Rename `All Writings` to a label that reflects what is actually listed.
3. Persist one useful metadata label in each writing row instead of hiding it on hover.
4. Improve row scanning by showing category/tag or read-time directly in the row.
5. Keep hover polish as enhancement, not the only way to see structure.

**Verification:**
- Run: `npm run build`
- Manual: verify cards reveal meaningful summaries.
- Manual: verify archive rows stay informative on touch devices.

**Why now:** This is low-cost cleanup with obvious user benefit.

---

## Task 8: Turn Topics into Real Filters

**Priority:** P2  
**Impact:** Medium  
**Effort:** Medium

**Files:**
- Modify: `src/pages/journeys.astro`
- Create: `src/components/JourneyFilters.tsx`

**Implementation steps:**
1. Create `src/components/JourneyFilters.tsx` as a small client island.
2. Pass topic counts and post metadata into the island from `src/pages/journeys.astro`.
3. Make chips clickable so they filter both `Major Arcana` and `All Writings` sections.
4. Add a clear reset action.
5. Preserve server-rendered content so the page remains useful without JS.

**Verification:**
- Run: `npm run build`
- Manual: confirm clicking a chip visibly reduces the archive and communicates the active filter.

**Why later:** Useful, but not as urgent as fixing core reading flow.

---

## Task 9: Add Archive Search and Presets

**Priority:** P2  
**Impact:** Medium  
**Effort:** Medium

**Files:**
- Modify: `src/pages/journeys.astro`
- Modify: `src/components/JourneyFilters.tsx`

**Implementation steps:**
1. Add a text search field scoped to title, tag, and excerpt.
2. Add presets such as `Newest`, `Travel Arc`, `Foundational`, and `Research`.
3. Keep the UI lightweight and editorial, not SaaS-like.
4. Ensure search and filters compose cleanly.
5. Add an empty state that explains why no entries matched.

**Verification:**
- Run: `npm run build`
- Manual: confirm search and preset combinations behave predictably.

**Why later:** Powerful for archive retrieval, but secondary to first-read experience.

---

## Task 10: Add a Keyboard and Screen-Reader Alternative for the Homepage

**Priority:** P2  
**Impact:** Medium  
**Effort:** Medium

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/components/DepthGallery.tsx`
- Create: `src/components/HomePostList.astro`

**Implementation steps:**
1. Create `src/components/HomePostList.astro` as a semantic list of visible journey entries.
2. Make it visually subtle on desktop and fully readable on mobile.
3. Ensure the canvas can be bypassed by keyboard users.
4. Add a clear focus path into the first post link.
5. Keep the gallery as the visual hero, not the only interaction model.

**Verification:**
- Run: `npm run build`
- Manual: tab through the homepage without using a mouse.
- Manual: confirm the hidden or secondary list still fits the visual system.

**Why later:** Important, but can land after discoverability and post-flow fixes.

---

## Task 11: Rebalance Post Annotation Design

**Priority:** P3  
**Impact:** Medium  
**Effort:** Medium

**Files:**
- Modify: `src/pages/posts/[...slug].astro`
- Modify: `src/styles/global.css`

**Implementation steps:**
1. Reduce the contrast gap between main copy and sidebar notes so annotations feel intentional, not ghosted.
2. Promote one or two `Synchronicities` notes into inline callouts in the prose flow.
3. Keep the sidebar for depth, but let mobile readers encounter the best context before the end of the article.
4. Tighten the note hierarchy so labels, numbers, and meanings scan faster.

**Verification:**
- Run: `npm run build`
- Manual: confirm annotations add context without competing with the body text.

**Why last:** It is taste-heavy and should happen after core usability fixes.

---

## Task 12: Rework the Next-Post Surface as an Opt-In Continuation Card

**Priority:** P3  
**Impact:** Medium  
**Effort:** Medium

**Files:**
- Modify: `src/components/NextPostReveal.tsx`
- Modify: `src/styles/global.css`

**Implementation steps:**
1. Redesign the existing transition as a contained continuation card rather than a pinned takeover.
2. Keep the aesthetic bridge between posts, but shorten it and make the CTA explicit.
3. Add a secondary path to `Journeys` so readers can branch out instead of being pushed linearly.
4. Ensure the component feels lighter on mobile than on desktop.

**Verification:**
- Run: `npm run build`
- Manual: verify the component invites progression without trapping the reader in a cinematic funnel.

**Why last:** This is refinement once control and readability are already restored.

---

## Recommended Delivery Order

### Wave 1: Safety and control

1. Task 1: Stabilize the Journey Progress Rail
2. Task 2: Remove Forced Next-Post Navigation
3. Task 3: Compress the Mobile Post Hero

### Wave 2: Reading comfort

4. Task 5: Calm Reading Mode and Add Reduced-Motion Support
5. Task 6: Add Real Reading Aids
6. Task 11: Rebalance Post Annotation Design

### Wave 3: Discovery and archive clarity

7. Task 4: Add Explicit Homepage Onboarding
8. Task 7: Repair Journeys Card Information Design
9. Task 10: Add a Keyboard and Screen-Reader Alternative for the Homepage

### Wave 4: Retrieval and archive power

10. Task 8: Turn Topics into Real Filters
11. Task 9: Add Archive Search and Presets
12. Task 12: Rework the Next-Post Surface as an Opt-In Continuation Card

---

## Recommended Scope Cut If You Want a Fast First Pass

If you want the highest return in one compact sprint, ship only:

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 7

That set fixes the clearest friction without disturbing the visual identity.

---

Plan complete and saved to `docs/plans/2026-03-26-reading-ux-improvements.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
