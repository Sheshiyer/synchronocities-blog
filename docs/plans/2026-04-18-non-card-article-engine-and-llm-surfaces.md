# Non-Card Article Engine And LLM Surfaces Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reopen live GitHub execution tracking, make non-card article metadata drive real article rendering, ship the Downstream Mind pilot from its existing metadata, finish the LLM entry layer, and then clean up the remaining tarot-navigation residue.

**Architecture:** Keep the current tarot journey system intact, but branch the post renderer into two source-of-truth modes: tarot card experiences and normalized non-card article experiences. Centralize article theme and LLM-output generation in shared library helpers so routes, tests, and the post template all consume the same normalized model instead of duplicating logic.

**Tech Stack:** Astro 6, Astro content collections, React islands, TypeScript, Node test runner, GitHub issues/milestones via `gh api` plus GitHub connector.

---

### Task 1: Reopen GitHub execution tracking

**Files:**
- Modify: GitHub milestones and issue backlog for `Sheshiyer/synchronocities-blog`
- Modify: [tasks/todo.md](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/tasks/todo.md)

**Steps:**
1. Close stale milestones `#1`, `#2`, and `#3` so they stop reading as active work.
2. Create a new milestone for the active execution wave.
3. Create one live issue per queue item:
   - GitHub hygiene / tracking
   - non-card article rendering modes
   - Downstream Mind pilot
   - LLM entry layer
   - tarot residue cleanup
4. Record the new milestone and issue numbers in `tasks/todo.md`.

### Task 2: Make non-card metadata drive article rendering

**Files:**
- Modify: [src/pages/posts/[...slug].astro](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/posts/%5B...slug%5D.astro)
- Modify: [src/lib/articleExperience.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/lib/articleExperience.ts)
- Modify: [src/styles/global.css](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/styles/global.css)
- Create: `src/components/non-card/*` helpers only if the page template becomes too dense
- Test: update or extend [tests/article-experience.test.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/tests/article-experience.test.ts)

**Steps:**
1. Add a non-card theme/token registry keyed by `signal`, `lab`, `pilgrim`, `atlas`, and `codex`.
2. In the post route, derive a unified shell model from `normalizePostEntry(post)`.
3. Keep tarot posts on the existing `cardExperience` path.
4. Add real non-card render branches for:
   - `signal-essay`
   - `research-essay`
   - `field-note`
   - `hub`
   - `reference`
5. Make rails, hero copy, and supporting metadata consume `hero`, `experience`, `concepts`, `related_posts`, `easter_eggs`, and `source_bridge`.
6. Add or update tests for the shared model logic that backs these modes.

### Task 3: Ship the Downstream Mind pilot from existing metadata

**Files:**
- Modify: [src/pages/posts/[...slug].astro](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/posts/%5B...slug%5D.astro)
- Modify: [src/styles/global.css](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/styles/global.css)
- Source content: [src/content/posts/the-downstream-mind.md](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/content/posts/the-downstream-mind.md)
- Test: extend [tests/article-experience.test.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/tests/article-experience.test.ts) if new shared helpers are introduced

**Steps:**
1. Use the pilot’s `hero.eyebrow`, `hero.subtitle`, `experience.framework_axes`, `figures`, `easter_eggs`, `llm`, and `source_bridge` data in the actual rendered article.
2. Promote the hero figure and closing figure into first-class surfaces.
3. Expose the section figures and decoder metadata as deliberate article modules instead of leaving them trapped in frontmatter.
4. Preserve readability: the pilot should feel authored, not overloaded.

### Task 4: Finish the LLM entry layer

**Files:**
- Create: `src/lib/llmDiscovery.ts`
- Modify: [src/pages/llms.txt.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/llms.txt.ts)
- Modify: [src/pages/llms-full.txt.ts](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/llms-full.txt.ts)
- Create: `src/pages/start.txt.ts`
- Create: `src/pages/llms-manifest.json.ts`
- Test: create `tests/llm-discovery.test.ts`

**Steps:**
1. Centralize route generation in a shared helper using normalized post metadata.
2. Add `/start.txt` as the high-signal curated entry surface.
3. Upgrade `/llms.txt` into a guided discovery index instead of a flat list.
4. Upgrade `/llms-full.txt` to include normalized metadata and relationship hints.
5. Add `/llms-manifest.json` as the machine-readable canonical export.
6. Add tests that prove foundational selection, clustering, and metadata serialization.

### Task 5: Clean up tarot residue after the new wave lands

**Files:**
- Modify: [src/pages/posts/[...slug].astro](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/pages/posts/%5B...slug%5D.astro)
- Modify: `src/pages/index.astro` and/or `src/components/DepthGallery.tsx` if the return-to-spiral state is implemented
- Modify: [src/styles/global.css](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/src/styles/global.css)

**Steps:**
1. Replace next-only continuation with real previous/next footer navigation when the new article shell work is stable.
2. Implement `/?card={numeral}` spiral return-state behavior only after verifying it does not break the current gallery-first homepage.
3. Keep any remaining card-specific layout cleanup explicitly secondary to the non-card and LLM work.

### Task 6: Verification and closeout

**Files:**
- Modify: [tasks/todo.md](/Volumes/madara/2026/twc-vault/01-Projects/synchronocities-blog/tasks/todo.md)

**Steps:**
1. Run `npm test`.
2. Run `npm run validate:posts`.
3. Run `npm run build`.
4. Verify the key routes manually if the renderer changed materially:
   - `/posts/the-downstream-mind`
   - one non-card research essay
   - one hub/reference page
   - `/journeys`
   - `/research`
   - `/llms.txt`
   - `/llms-full.txt`
   - `/start.txt`
   - `/llms-manifest.json`
5. Record the results in `tasks/todo.md` with residual risks.
