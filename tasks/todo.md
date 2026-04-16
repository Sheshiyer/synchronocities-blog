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

# Article Intro Rhythm Pass

## Discovery Summary

- Trigger: the user flagged that the spacing between the article H1, description/dek, and quick-view panel still feels off on the shared post intro.
- Requested guidance:
  - `/Users/sheshnarayaniyer/.claude/skills/taste-skill/`
  - `/Users/sheshnarayaniyer/.claude/skills/ui-ux-pro-max/`
- Quality bar:
  - refine the shared article intro rhythm, not a one-off page
  - preserve Astro media behavior and the current article architecture
  - verify the live intro on desktop and mobile after adjustment

## Scope

- [x] Reproduce the spacing issue on a representative article route.
- [x] Identify which shared intro styles control the H1/dek/meta/quick-view rhythm.
- [x] Adjust the shared spacing so the intro stack breathes more cleanly.
- [x] Re-verify desktop and mobile intro spacing in-browser.
- [x] Re-run relevant project checks and record the result.

## Execution Plan

### Phase 1 — Diagnose
- [x] Inspect the live intro stack on `nadi-bioimpedance-protocol`.
- [x] Read the shared post template and supporting CSS for the intro shell and quick-view panel.
- [x] Convert the screenshot complaint into concrete spacing changes.

### Phase 2 — Refine
- [x] Improve the vertical rhythm between headline, dek, metadata, and quick-view panel.
- [x] Keep the quick-view panel visually related to the intro without crowding the copy.
- [x] Make sure the spacing still collapses well on mobile.

### Phase 3 — Verify
- [x] Re-check the representative article on desktop and mobile.
- [x] Run the relevant verification commands.
- [x] Record residual risk.

## Review

- Root cause: the shared article intro still depended on Tailwind spacing utilities for key rhythm between the H1, dek, metadata row, divider, and quick-view stack. On the affected route, those utilities were not producing real vertical separation, so the intro read as one compressed block.
- Structural fix: the intro rhythm is now expressed in shared CSS instead of fragile per-element utility margins. `post-header-main` uses an explicit grid gap, the divider has its own top margin, and the pre-content quick-view wrapper uses explicit spacing and body-top padding.
- Template fix:
  - `src/pages/posts/[...slug].astro` now uses `post-title`, `post-intro-divider`, `post-body-shell`, and `post-prelude-tools` so the shared article intro can be tuned consistently.
- CSS fix:
  - `src/styles/global.css` now defines deterministic spacing for the intro stack and the quick-view section, plus a hermit-specific body-top override so the layout variants keep their intended feel.
- Browser proof on `nadi-bioimpedance-protocol`:
  - desktop (`1365x768`): H1→dek `22px`, dek→meta `22px`, meta→divider `38px`, divider→quick-view stack `52px`
  - mobile (`390x844`): H1→dek `14px`, dek→meta `14px`, divider→quick-view stack `26px`
  - outcome: the title block breathes properly and the quick-view panel now reads as the next section instead of a continuation of the dek.
- Verification:
  - `npm test` ✅
  - `npm run validate:posts` ✅ `0` errors, `71` existing warnings
  - `npm run build` ✅ success, `115` pages built
- Residual risk: the underlying Tailwind spacing token issue still exists in the project, so any future layout relying on spacing utilities alone may drift again. This pass hardens the shared article intro specifically.

---

# Cross-Layout Article Audit

## Discovery Summary

- Trigger: the user asked to find issues like the intro-spacing problem across the posts and layouts, and to fix them using the shared strengths of the Astro framework rather than continuing with one-post patches.
- Requested direction:
  - audit representative posts across active layouts
  - use the shared article shell and Astro-native structure where possible
  - fix recurring layout/system issues instead of local anomalies

## Scope

- [x] Inventory the active article layouts and select representative routes.
- [x] Audit representative posts for recurring intro/body spacing and containment issues.
- [x] Refactor the shared Astro template/CSS where a repeated issue is confirmed.
- [x] Re-verify representative routes on desktop and mobile.
- [x] Re-run project checks and record residual risk.

## Execution Plan

### Phase 1 — Map
- [x] Identify all active layout variants in the current post corpus.
- [x] Choose representative posts that exercise each variant.

### Phase 2 — Audit
- [x] Inspect representative routes in-browser and measure recurring spacing failures.
- [x] Distinguish shared-shell problems from intentional layout variance.

### Phase 3 — Repair + Verify
- [x] Adjust the shared article shell/CSS for repeated issues.
- [x] Re-check representative routes on desktop and mobile.
- [x] Run verification commands and document the outcome.

## Review

- Representative audit set:
  - tarot layouts: `deep-trench-forge-shenzhen`, `the-tower-speaks-in-richter-scale`, `the-star-names-you`, `the-moon-refracts-everything`, `the-hermit-72-hours`, `temperance-compresses-to-essence`, `judgement-recollection-in-pai`, `the-universe-four-creatures-assemble`
  - non-card modes: `hyperbolic-consciousness`, `pattern-cross-reference-system`, `bangkok-initiation-samui-invitation`, `consciousness-architecture-hub`, `lorenz-kundli-system-index`
- Root cause: the shared post template still depended on utility `margin`/`padding` classes for key shell geometry, but the repo-wide reset in `src/styles/global.css` zeroes `margin` and `padding` after Tailwind is imported. That left post gutters, nav padding, section spacing, and some rail/mobile-module spacing partially stripped across layouts.
- Structural fix:
  - moved article-shell gutters, intro spacing, nav padding, title sizing, meta-row layout, rail stack spacing, closing-line spacing, and mobile easter-egg spacing into explicit shared post CSS
  - removed the most important spacing-sensitive utility classes from `src/pages/posts/[...slug].astro` and replaced them with named article-shell classes
- Browser proof:
  - before fix on mobile representative routes: title/content/media often started at `0px` left gutter
  - after fix on the full representative set:
    - mobile title/content/media gutters: `20px`
    - desktop intro/title left edge: `185px`
    - desktop reading column left edge: `257px` on railed tarot layouts, `397px` on solo non-card layouts
    - desktop rail gap: `64px` on railed tarot layouts
- Verification:
  - `npm test` ✅
  - `npm run validate:posts` ✅ `0` errors, `71` existing legacy warnings
  - `npm run build` ✅ success, `115` pages built
- Residual risk: the underlying reset-order problem still exists project-wide, so any other surface that relies on utility `margin`/`padding` may still drift. The shared post system is now hardened against that by using explicit article CSS instead of utility spacing.

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


---

# Global CSS Cascade Repair

## Discovery Summary

- Trigger: the user asked to eliminate the remaining repo-wide risk, not just harden the post system.
- Root problem hypothesis:
  - `src/styles/global.css` imports Tailwind first, then defines an unlayered universal reset and default element rules
  - unlayered author rules outrank Tailwind's layered utilities, so utility `margin`/`padding` can fail globally
- Quality bar:
  - fix the cascade at the root, not just page-by-page
  - preserve the established design tokens and site look
  - verify representative non-post surfaces in-browser after the change
  - rerun `npm test`, `npm run validate:posts`, and `npm run build`

## Scope

- [x] Move the global reset/default element rules into the correct Tailwind base layer.
- [x] Keep component-level site styling intact while restoring utility spacing globally.
- [x] Re-verify representative pages that rely on utility spacing outside the post system.
- [x] Re-run project verification and record the outcome.

## Execution Plan

### Phase 1 — Isolate
- [x] Confirm which `global.css` rules are globally shadowing utility spacing.
- [x] Decide the minimal layer refactor that restores correct cascade behavior.

### Phase 2 — Repair
- [x] Refactor the global reset and element defaults into a base-layer block.
- [x] Leave component/system-specific classes deterministic and avoid unnecessary visual churn.

### Phase 3 — Verify
- [x] Re-check representative pages in-browser.
- [x] Run verification commands.
- [x] Record residual risk.

## Review

- Root cause confirmed: `src/styles/global.css` imported Tailwind and then declared an unlayered universal reset plus default element rules. Because unlayered author CSS outranks Tailwind's layered utilities, shared `margin` and `padding` utilities could be zeroed out across the site.
- System fix: moved the reset and default element rules into `@layer base`, restoring the intended Tailwind cascade without rewriting the project's existing component-class styling.
- Intentional scope control: only the global reset/default element block was re-layered. Shared post-shell hardening from the previous pass remains in place, but the repo no longer depends on that workaround for utility spacing to function.
- Browser proof:
  - homepage `/`
  - desktop (`1440x960`): header gutters `48px`; computed header padding `20px 20px 12px 12px`; nav gap `20px`
  - mobile (`390x844`): header gutters `16px`; computed header padding `16px 16px 12px 12px`; nav inner left padding `12px`
  - tarot detail `/card/0`
  - desktop (`1440x960`): nav padding `32px`; header/main horizontal padding `32px`; negative title offset restored; meta row gap `16px`
  - mobile (`390x844`): nav padding `24px`; header/main horizontal padding `24px`; title offset and meta spacing restored
- Verification:
  - `npm test` ✅
  - `npm run validate:posts` ✅ `0` errors, `71` existing warnings
  - `npm run build` ✅ success, `115` pages built
- Residual risk: the repo-wide utility-spacing failure is fixed at the cascade level. Remaining layout variation risk is now normal page-level design work, not the previous systemic reset-order bug.
