# Fieldwork — second pass and upgrade sequence

October 7, 2026. This is a review of the current private prototype and a concrete implementation proposal. No feature below is accepted as implemented merely because it appears here.

## Product direction

Keep the inhabited miniature and the Cambium/Temperance reference lock. Make a meaningful session possible: arrive, discover what needs attention, open a piece of work, develop its source-backed mission, choose a day, return with an inspectable result. The world should communicate purpose and state through places, paths and opened objects. A persistent table of metrics would undermine the brief.

The owner needs two independent views of the same item: its creative development and its public authority. Moving a mission forward never supplies permission to post.

## Current findings

These findings come from the October 7 source files and current IAB accessibility snapshot. The first pass established rendering, selection, exact draft review and local date persistence; it did not establish the following product capabilities.

| Finding | Evidence | Consequence | Priority |
|---|---|---|---|
| Calendar dates and weekday labels are literal October 7–13 | `world.js`: `dates` and `renderTrail` | The daily world cannot advance beyond its demonstration week | P0 |
| Proposal state is only record ID → date | `save`, assign/remove handlers | No mission steps, notes, effort, dependencies or usable handoff | P0 |
| Source fetch throws before initialization without a recovery surface | First top-level fetch | An unavailable or malformed snapshot can prevent the index as well as 3D from working | P0 |
| Journal close clears selection without returning focus | `closeJournal`; close-directory handler | Keyboard users can lose their position during repeated review | P0 |
| Draft fingerprint exists in data but is not displayed; audience text is hardcoded | Draft journal branch; `review_sha256` and `audience` fields | The review surface cannot yet bind a decision to all exact item fields | P0 before approval integration |
| Label collision policy hides records; opening snapshot exposes only four product buttons | Frame collision loop and current accessibility snapshot | Clean overview trades away landmark discoverability | P1 |
| Connections reveals all edges with one material style | `line` and Connections handler | Individual edge meaning and the selected item's neighbors are difficult to inspect | P1 |
| Source search omits account, body, blockers and domains; results stop at sixty | `renderIndex` | Relevant records require guessed names; no next-page navigation | P1 |
| Rendering and DOM label projection continue during Stillness | `frame` | Stillness stops ambient rings, but is not a measured idle-performance mode | P1 |
| Board data is aggregated; product/repository edges are narrow exact matches | Snapshot schema and graph construction | It cannot represent issue-level work or infer deployment bindings | P1 integration |
| Seven social drafts are represented; native Substack draft/Note records are absent | Snapshot draft schema/counts | The full editorial flow still needs a reconciled Substack adapter | P1 integration |

## First implementation slice: mission journal and daily expedition

This should lead the build. It directly improves daily usefulness and supplies the model that richer geometry and integrations can consume.

1. Replace literal dates with a Europe/Paris calendar window. Offer previous/next week and return to today. Preserve existing v1 assignments exactly, including dates outside the visible week; never silently move an old assignment to today.
2. Introduce a versioned proposal model. A mission carries an immutable source record reference, brand, intended output, editable working notes, proposed date, effort estimate, source blockers, ordered steps, and development stage. Suggested stages: explore, develop, prepare review, await human decision, delivered receipt, return. “Delivered” requires a real receipt; local steps cannot fabricate it.
3. Expand the journal into opened pages: **Work**, **Sources**, **Media**, **Plan**, **Review history**. Preserve exact draft content separately from editable planning notes. Edits to a draft create a revision, rather than overwrite the reviewed original.
4. Provide clear empty, saved, failed-save, invalid-import and stale-source states. Include undo for reversible local changes and a previewed import/export flow with schema validation and explicit conflict choices.
5. Restore focus to the invoking landmark or Find result. Provide keyboard day navigation and readable planning controls outside a long media scroll. Keep the narrow-screen journal usable as an opened field book.

Acceptance: a user can take one source-held idea and one social draft through planning, add notes, move dates across two weeks, reload, export, and restore the same IDs and revisions. Source holds and publication authority remain intact throughout. Invalid state cannot blank the world or silently erase plans.

## Second slice: the world becomes easier to explore

- Make district captions selectable entry points. A district opens a focused camera composition and its accessible contents. Home restores the overview; a location breadcrumb and back action restore the previous place.
- Use three levels of detail: territory silhouettes at overview; named product landmarks in district view; related work and inspectable source objects in close view. Find stays available at every level. Selected and focused items must stay visible despite caption collisions.
- Differentiate products by authored purpose: routing workshop, media atelier, seed archive, practice observatory and manuscript stacks. Use the existing films and source assets as the input. Avoid twelve identical capped pillars with renamed captions.
- Give work states a restrained physical language: source-held seed under a cloche, proposed work with a trail marker, awaiting-review envelope at the dock, delivered item with a receipt attached. Every state also has text; color and geometry are never the only signal.
- Filter paths by explicit relationship type and selected neighborhood. Clicking a path opens its source, relationship type, observed date and uncertainty. Unknown bindings stay unknown.
- Add a visible text-view switch, touch camera buttons and predictable zoom boundaries. A walking avatar is optional after district navigation proves useful; it should not become an obstacle to editing or review.

Acceptance: every product is discoverable from the overview without guessing its name; focus does not disappear during zoom; a source link can be explained without reading all global paths; reduced-motion and text-view users can complete the same mission.

## Third slice: complete the editorial and product graph

Build read-only adapters into one dated snapshot contract, retaining each source's ID and observation time:

| Source | Records to add | Required boundary |
|---|---|---|
| Substack | Native essay drafts, Notes, scheduled items, revisions and delivery receipts | Reconcile the unpublished introduction and October 6 Note before inventing current delivery state |
| Existing editorial queue | Exact body/title, account, audience, destination, media hashes, revisions and holds | No automatic approval or promotion from a status label |
| GitHub | Relevant issue/project items, open work, uncommitted-change summaries and exact source links | Accessible census is not permission to promote private, client or fork material |
| Vercel and current hosting records | Project, deployment, protection, aliases and verified Git bindings | Domain attachment and READY status do not prove public access or ownership |
| Notes and manuscript intake | Source fragments, substantive briefs, missing-text holds and development actions | Preserve original notes and source locators; preparation does not lift author/source holds |

Use stable source-owned IDs, typed edges, visibility, provenance and freshness. Draft rows currently use `proposed_date`; migrations must recognize that existing field. Board names need stable numeric IDs before renaming or refresh. Refresh must merge observations without overwriting local creative notes or proposal dates. Show an inspectable diff before accepting a changed snapshot. First integrate a small representative set; do not ingest thousands of issue placements merely to fill the scene.

## Fourth slice: a human review station

Create an opened review desk at the publishing docks. Present exact body/title, account, audience, destination, time, ordered media, hashes, source claims and revision. Display the already-carried review fingerprint.

Approval is a separate human action tied to that exact revision and payload. Any material change invalidates it. Public submission remains a separate supported operation with duplicate checks and visible platform readback. Scheduled, submitted, published and verified delivery must be different states. Preparation at 10:00 Paris can populate the desk; it cannot press approval or submit.

Begin with review receipts and change detection locally. Connect a posting adapter only after the human decision contract and replay/duplicate behavior are accepted. There is no auto-publish quest reward.

## Fifth slice: persistence, performance and return

Extract the compressed single script into bounded modules for data loading, proposal migration, journal, camera, graph, and scene. Use deterministic positions so a snapshot refresh preserves spatial orientation. Keep the private source dataset outside publicly deployable assets.

Persist local plans atomically in a private store before introducing multi-device state. Define backup, revision conflict, import and rollback behavior first. Serve explicitly allowed artifact/media routes and disable directory listings when the prototype becomes a lasting local application. Loopback binding remains required for owner-only metadata.

Measure idle rendering, district navigation, label projection and media memory on the actual machine. Prefer render-on-change for a still scene, frame-rate-independent motion, geometry reuse and measured label bounds. Keep hidden-tab pause and reduced-motion behavior. Frame-rate claims require measurements; syntax and a screenshot do not certify performance.

Attach reader feedback or a lived return to the delivered receipt as a new observation. Keep it separate from the original idea and initial interpretation. The purpose is to improve the next piece, not to award a completion score.

## Build boundaries and verification

Create a new version of the private artifact and retain the verified first-pass bundle. Avoid replacing the working source wholesale with an unverified generated scaffold. Each slice needs its own inspectable artifact and browser evidence before it becomes the next baseline.

Verify representative journeys: source-held idea → mission → saved proposal; draft → exact media review → revision change; prior-week assignment → restored plan; unknown relationship → explicit uncertainty; stale/failed data → accessible recovery; keyboard/mobile/reduced motion → equivalent completed planning. Verify queue and source hashes before and after. Public approval and delivery require real human/platform evidence and remain outside synthetic tests.

Suggested order: mission journal/calendar → district navigation → small read-only adapter set → exact review station → durable persistence and measured rendering. Run performance and accessibility checks within every slice. This keeps the world useful while its visual craft grows.

## Routed second opinion and corrections

A bounded read-only noesis-plan-max review completed and its findings were checked against the source. Provider/model attribution was not included in the returned receipt and remains unresolved. Additional accepted findings: plans for missing source IDs disappear from the trail, export omits the stored snapshot date, annotation counts are literal, source/vendor/font symlinks depend on local checkouts, and shared materials are changed globally by Connections. Preserve orphaned missions visibly, align export/import schemas, derive counts from the snapshot, package dependencies for a portable release, and separate presentation materials before deeper graph styling.

Two suggested constraints were refined: the missing approval button is intentional in the first prototype, which cannot submit; an approval control belongs only in the separately accepted review contract. Likewise, one post per brand per day is not an existing author rule. Use configurable effort/cadence warnings, with owner override, instead of inventing a hard posting quota. The active planning week follows the current Europe/Paris date; the snapshot date remains a separate freshness signal.
