# Article Interior Layout Refinement

## Discovery Summary

- Planning depth: `standard`
- Delivery mode: `shared layout refinement`
- Trigger: the user reported that article interior pages were visually broken, with poor left/right spacing and content reading as if it starts from the edges.
- Quality bar:
  - use the requested design guidance from `ui-ux-pro-max`
  - use the requested design guidance from `design-taste-frontend` (`taste-skill`)
  - improve the shared article shell, not a one-off page
  - verify representative desktop and mobile article routes in-browser
  - run `npm test`
  - run `npm run validate:posts`
  - run `npm run build`

## Activated Skills

- `ui-ux-pro-max` → enforce stronger composition, spacing rhythm, and container discipline.
- `design-taste-frontend` → reject edge-hugging layouts, hero-first poster treatment, and weak editorial hierarchy.

## Scope

- [x] Inspect the shared article page shell and identify why spacing feels unconstrained.
- [x] Rework the intro/header so copy leads and media supports, instead of media dominating the page.
- [x] Enforce explicit horizontal gutters and centered max-width containment for article interiors.
- [x] Verify that the improved shell works across multiple layouts and viewport sizes.
- [x] Re-run project verification gates and record the outcome below.

## Execution Plan

### Phase 1 — Diagnose
- [x] Review the shared post template and article CSS.
- [x] Check current article behavior on desktop and mobile.
- [x] Translate the user's complaint into concrete layout failures.

### Phase 2 — Refine
- [x] Refactor the shared intro to a text-first editorial composition.
- [x] Tighten the main reading shell so prose, pull quotes, TOC, and rail sit inside explicit page gutters.
- [x] Keep layout-specific atmospherics, but remove the feeling that content is pressed against the viewport.

### Phase 3 — Verify
- [x] Re-check representative article routes on desktop and mobile.
- [x] Run `npm test`.
- [x] Run `npm run validate:posts`.
- [x] Run `npm run build`.
- [x] Record the result and residual risk.

## Review

- Root issue: the shared article experience relied too heavily on ambient full-bleed hero treatment and not enough on explicit editorial containment, so titles, media, and reading chrome felt visually unmoored.
- Structural fix: the article shell now uses explicit centered containers for intro, reading body, and related content, with `max-width: 1200px` at the page-shell level and narrower reading measures inside that shell.
- Intro fix: the shared header in `src/pages/posts/[...slug].astro` now follows a copy-first pattern with a bounded headline/dek/meta block on the left and a restrained supporting aside on the right instead of letting the hero dominate first impression.
- Reading fix: `src/styles/global.css` now defines a dedicated intro grid, reading shell, pull-quote width, rail width, and contextual card spacing so left and right gutters stay consistent across article layouts.
- Hermit handling: `hermit-minimal` now stays text-first and suppresses the intro hero aside, which keeps its whitespace intentional rather than empty.
- Browser proof:
  - desktop: `deep-trench-forge-shenzhen`
  - desktop: `the-hermit-72-hours`
  - mobile: `deep-trench-forge-shenzhen`
  - mobile: `the-tower-speaks-in-richter-scale`
  - outcome: the pages now keep content off the edges, preserve readable gutters, and present the title/dek before supporting media.
- Verification:
  - `npm test` ✅
  - `npm run validate:posts` ✅ `0` errors, `71` existing warnings
  - `npm run build` ✅ success, `115` pages built

---

# Homepage Regression Recovery

## Discovery Summary

- Trigger: after the `main` push, the user reported that the overall homepage UI was broken and shared a screenshot of the landing composition collapsing into a visually incoherent overlay.
- Primary suspicion: the new split-entry shell in `src/pages/index.astro` is competing with the existing `DepthGallery` canvas instead of composing with it.
- Quality bar:
  - fix the regression at the source, not with a cosmetic band-aid
  - preserve Astro and the current media handling model
  - verify the homepage on real desktop and mobile viewports
  - rerun the relevant project checks before closing

## Scope

- [x] Reproduce the broken homepage locally and confirm the failure mode.
- [x] Identify the exact layout interaction causing the visual collapse.
- [x] Refactor the homepage shell so the entry UI sits inside intentional gutters and a coherent visual hierarchy.
- [x] Re-verify desktop and mobile homepage rendering in-browser.
- [x] Run project verification and capture residual risk.

## Execution Plan

### Phase 1 — Diagnose
- [x] Inspect the current homepage shell against the existing depth gallery behavior.
- [x] Compare current homepage markup to the pre-regression version if needed.
- [x] Translate the screenshot into concrete layout failures.

### Phase 2 — Repair
- [x] Remove or reduce the conflicting composition layer that is making the page feel broken.
- [x] Restore a clear relationship between the depth gallery and the start-here entry controls.
- [x] Tighten desktop and mobile spacing so nothing feels edge-hugging or visually accidental.

### Phase 3 — Verify
- [x] Re-check the homepage on desktop and mobile.
- [x] Run the relevant project verification commands.
- [x] Record the result and any follow-on design risk.

## Review

- Root cause: the new homepage onboarding shell in `src/pages/index.astro` added two large editorial cards on top of the existing `DepthGallery` canvas, which displaced the gallery as the primary interface and made the landing page read as a broken overlay instead of a coherent entry point.
- Structural fix: the homepage now returns to the gallery-first composition. The large split onboarding shell was removed entirely, and the gallery's native label overlay is restored.
- Navigation fix: discovery routes are still preserved through a lighter floating header that links directly to `Depth`, `Journeys`, `Research`, and `Maps` without obscuring the gallery.
- Spacing fix: the header now uses explicit centered floating-bar geometry instead of relying on the previous full-width overlay treatment, which restores clear left/right gutters on both desktop and mobile.
- Browser proof:
  - desktop homepage at `1440x960`
  - mobile homepage at `390x844`
  - outcome: no oversized entry cards remain, the gallery is visually dominant again, and the only foreground chrome is the bounded route header plus the original label rail.
- Verification:
  - `npm test` ✅
  - `npm run validate:posts` ✅ `0` errors, `71` existing warnings
  - `npm run build` ✅ success, `115` pages built
- Residual risk: the homepage is intentionally conservative now. If the project still wants a richer non-tarot discovery layer on the front page, that should be designed as a lighter secondary system that does not compete with the gallery canvas.
- Residual risk: some layout variants still intentionally use dramatic typography and atmosphere. If the user wants a denser or more magazine-like system across every tarot layout, that should be a follow-on design pass rather than another shell hotfix.

## Follow-on Pass — Desktop Proportion + Astro Media

### Goal

- [x] Tighten the desktop article shell again so left/right breathing room is more obviously intentional.
- [x] Preserve Astro-native media handling where it is practical, instead of drifting toward ad hoc image behavior.

### Constraints

- [x] Keep the current markdown/frontmatter model intact for now.
- [x] Use Astro image primitives where a safe local-asset path exists.
- [x] Do not force a risky migration of all `featured_image` references in this pass.

### Plan

- [x] Narrow the shared intro and reading shell on desktop and increase page-edge padding.
- [x] Bring the tarot hero textures into `src/assets` and resolve them through Astro assets.
- [x] Render article hero media through Astro `Picture` when an optimized asset exists, with a clean fallback for existing public-path images.
- [x] Re-run browser verification and project checks.

### Follow-on Review

- Desktop shell refinement: the shared article shell now uses a narrower intro and reading width, plus larger `lg/xl` horizontal padding, so the prose no longer reads like it begins at the viewport edges.
- Astro media refinement: the tarot article textures now live in `src/assets/cards` and are resolved through a dedicated registry in `src/lib/cardImageAssets.ts`, letting the article hero use Astro `Picture` for responsive image generation.
- Content-model safety: frontmatter-driven `featured_image` strings still work without schema migration; article heroes fall back cleanly to the existing public-path `<img>` behavior where no optimized Astro asset exists.
- Build-path correction: the Astro `Picture` fallback was explicitly set to `webp` so the build does not emit bloated PNG fallbacks for already-compressed tarot textures.
- Browser proof:
  - desktop: `deep-trench-forge-shenzhen`
  - mobile: `the-tower-speaks-in-richter-scale`
  - outcome: spacing is more editorial on desktop, while mobile still collapses to a single-column intro with the hero image fully contained.
- Verification:
  - `npm test` ✅
  - `npm run validate:posts` ✅ `0` errors, `71` existing warnings
  - `npm run build` ✅ success, `115` pages built
