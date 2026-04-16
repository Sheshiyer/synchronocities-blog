# Phase 3 Wave 2 Discovery UI Note

Date: 2026-04-02

This note freezes the implementation direction for the Phase 3 Wave 2 discovery batch. It consumes the Wave 1 archive dataset without redefining the data model.

## Core Approach

Wave 2 should stay build-time first.

- `/journeys` becomes the main executable archive surface.
- Search, preset selection, and topic filtering operate on build-time archive data through a client-side control layer.
- The server-rendered HTML for `/journeys` should remain useful in its default state, with fallback copy when JavaScript is unavailable.
- The homepage gets a server-rendered discovery atlas so the site remains navigable when the depth gallery is unavailable.
- Article pages consume the archive relationship graph for adjacent reading surfaces.

This keeps the static build intact while still exposing an interactive archive UI.

## Journeys Contract

Rules:

- filters compose instead of replacing one another
- empty search queries do not produce a fake “no results” state
- the default server-rendered state should expose the archive even before any client code runs
- the tarot card grid remains visible as the signature path when the view is not explicitly narrowed to a filtered result set

Visible sections should be:

1. Major Arcana
2. Presets and search controls
3. Topic facets
4. Maps & Indexes
5. Filtered archive results / research library rows

## Homepage Contract

The homepage should no longer rely on the depth gallery as the only navigation surface.

Add a discovery atlas that exposes:

- the travel arc
- the research library
- the Downstream Mind pilot
- maps / indexes

The atlas must be semantic HTML and visible in server-rendered output.

## Related Reading Contract

Article pages should expose relationship-driven continuation modules using the Wave 1 graph.

Priorities:

1. explicit editorial relationships
2. same-series neighbors
3. high-scoring graph edges that bridge into hubs, references, essays, or journey posts

The module should work for both seeded pilot essays and legacy posts.

## Crawl Visibility

If Wave 2 adds dedicated discovery routes, they should be static pages so sitemap generation picks them up automatically.

The minimal acceptable additions are:

- a research-focused route
- a maps/index-focused route

These routes can reuse the archive dataset and do not need client-side filtering logic.
