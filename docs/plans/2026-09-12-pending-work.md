# Pending Work — 2026-09-12

> Reconciled from the live GitHub backlog, `docs/plans/` (March–May, historical),
> `tasks/todo.md` (closed through 2026-04-18), `_processing/` leftovers,
> `AGENTS.md` / `docs/INFRA.md`, and the current `main` tree at `5986f6e`.
> This file is the execution queue. Older plans stay as history.

---

## What this pass is *not*

March–May plans in `docs/plans/` and the April 18 queue in `tasks/todo.md` are
**done or superseded**. Do not reopen them as live work:

| Historical plan | Current truth |
|---|---|
| Design overhaul / unique card layouts (milestones #1–#2) | Closed. 8 card layouts live in `global.css`. |
| Upstream discovery (milestone #3) | Closed. `/journeys`, `/research`, `/maps` exist. |
| Non-card article engine + LLM surfaces (milestone #4, issues #136–#140) | Closed. `NonCardArticleShell`, `/start.txt`, `/llms.txt`, `/llms-full.txt`, `/llms-manifest.json` all exist. |
| Expand v2 retrieval-grounded (`2026-05-25-expand-v2-retrieval-grounded.md`) | Implemented: `workers/src/routes/expand-v2.ts` + `expand-v2-posts.ts`. |
| Site not on Cloudflare / no git remote / no site CI | Resolved 2026-09-12. Live at `synchronocities.tryambakam.space`. Four workflows. |

`plan.md` at the repo root is a **brand-level cosmology / Noesis-writer** plan, not
this blog's execution board. Leave it alone.

---

## Live GitHub state

Hygiene landed 2026-09-12. Proved live: **34 open issues**, all on
[milestone #5](https://github.com/Sheshiyer/synchronocities-blog/milestone/5).
Open PRs: 0. The entire open backlog is **content expansion + expansion tooling**, not infra.

### Epic still open

[#242](https://github.com/Sheshiyer/synchronocities-blog/issues/242) — 4× expansion of 30 background-agent posts.

### Tooling still open (do these before more auto-expand)

| Issue | Title | Why it still matters |
|---|---|---|
| [#243](https://github.com/Sheshiyer/synchronocities-blog/issues/243) | Auto-retry posts rejected by the no-shrink guard | `implosion-paradigm` is the documented stuck case (now 14% of target). |
| [#244](https://github.com/Sheshiyer/synchronocities-blog/issues/244) | Cache `/expand/section` by content hash | Efficiency only. |
| [#245](https://github.com/Sheshiyer/synchronocities-blog/issues/245) | Per-post 4× target instead of flat 4000w | `expand-posts.ts` and `expand-v2-posts.ts` still use `EXPANDED_THRESHOLD = 4000`. Several remaining targets are 8–12k. |

### Remaining open expansion issues (word counts measured 2026-09-12)

None of these posts are near their 4× target. YAML on the previously-broken three is now valid (#241 closed).

| Issue | Slug | Words now | Target | % |
|---|---|---|---|---|
| #211 | `active-inference-prediction-engine` | 1,372 | 12,000 | 11% |
| #213 | `root-access-to-reality` | 2,086 | 8,200 | 25% |
| #217 | `mantra-as-source-code` | 2,174 | 10,900 | 20% |
| #218 | `bioelectric-protocol` | 1,940 | 6,700 | 29% |
| #220 | `water-fourth-phase` | 1,268 | 9,500 | 13% |
| #224 | `vortex-based-mathematics` | 1,272 | 9,200 | 14% |
| #225 | `morphic-resonance-network-protocol` | 1,290 | 10,300 | 13% |
| #227 | `semantic-trauma` | 1,325 | 6,400 | 21% |
| #229 | `pharmacos-protocol` | 1,913 | 7,200 | 27% |
| #230 | `hidden-history-cultural-amnesia` | 1,445 | 11,300 | 13% |
| #231 | `bicameral-consciousness-patch` | 1,513 | 10,800 | 14% |
| #233 | `qualified-to-qualia-fied` | 2,876 | 6,900 | 42% |
| #235 | `noetic-aether-substrate` | 2,465 | 11,700 | 21% |
| #237 | `yantra-and-tantra-in-the-age-of-llms` | 1,611 | 7,200 | 22% |
| #239 | `death-at-the-border` | 1,500 | 6,400 | 23% |
| #240 | `implosion-paradigm` | 1,213 | 8,700 | 14% |

### Closed expansion issues that did **not** meet their target

These were closed 2026-05-22. The files are still 16–42% of target. GitHub is lying.

| Closed | Slug | Words now | Target | % |
|---|---|---|---|---|
| #212 | `sacred-geometry-processing-units` | 1,466 | 6,900 | 21% |
| #214 | `kubernetes-for-karma` | 2,247 | 6,300 | 36% |
| #215 | `your-consciousness-needs-better-error-handling` | 1,938 | 5,600 | 35% |
| #216 | `your-reality-is-a-smart-contract` | 1,329 | 6,200 | 21% |
| #219 | `fungal-intelligence-distributed-processing` | 1,598 | 7,500 | 21% |
| #221 | `docker-for-chakras` | 1,679 | 7,300 | 23% |
| #222 | `model-temperature-and-tapas` | 2,535 | 6,000 | 42% |
| #223 | `sacred-runtime-bali-padiyami` | 1,711 | 5,100 | 34% |
| #226 | `lorenz-kundli-protocol` | 1,424 | 9,000 | 16% |
| #228 | `the-devil-in-the-detail` | 1,588 | 6,200 | 26% |
| #232 | `the-sun-names-you` | 2,267 | 6,100 | 37% |
| #234 | `the-ineffable-secrets-of-a-breathing-sprite` | 1,928 | 5,500 | 35% |
| #236 | `body-as-blockchain` | 1,679 | 6,400 | 26% |
| #238 | `three-modes-of-intelligence` | 2,206 | 6,400 | 34% |

### Draft "Post:" issues #201–#210

**Closed as duplicate** 2026-09-12. Mapping: #201→#224, #202→#220, #203→#225,
#204→#217, #205→#230, #206→#226, #207→#235, #208→#211, #209→#231, #210→#240.

---

## Infra threads (from the 2026-09-12 deep pass)

Verified against the tree, not the original `AGENTS.md` table.

| # | Thread | State | Action |
|---|---|---|---|
| 1 | Vault reindex v5 (`workers/.vault-reindex-v5.log`) | **In flight.** Started 2026-09-11T21:08Z. `02-Areas` done (2,876 emitted, 0 errors). `03-Resources` walked 4,568 files; ~3,692 chunks embedded so far, 0 errors. | Let it finish. Do not start a second indexer. `/search` and `/chat` still mix fresh blog vectors with stale vault ones until it completes. |
| 2 | 12 Drift posts on the Qwen3 vectorizer | Open | Voice review, not a reindex. List below. |
| 3 | `404.astro` + `not_found_handling: "404-page"` | Open | `wrangler.jsonc` is still `"none"`. No `src/pages/404.astro`. |
| 4 | Cloudflare Managed robots.txt vs `llms.txt` | Open, decision | Zone-level `Disallow: /` for GPTBot/ClaudeBot/CCBot contradicts shipping LLM surfaces. |
| 5 | Filter `/related` and `/maps` by `source_type` | **Done.** Code in `related.ts` + both cluster paths. v5 cluster artifact is blog-only (126 posts, k=12). | Drop from the live queue. |
| 6 | Site deploy workflow | **Done.** `.github/workflows/synchronocities-site-deploy.yml` exists. | Drop from the live queue. |
| 7 | Move `tryambakam.com` NS to Cloudflare | Optional | Domain is still on GoDaddy (`ns29/ns30.domaincontrol.com`). Low-risk (no MX/SPF). |

INFRA.md §5 still *says* CI is inert / no remote / no site workflow. That section is
stale relative to the TL;DR at the top of the same file. Fix it when next touching infra docs.

---

## Temporary leftovers (`_processing/`)

Six files for `the-body-is-the-first-country` (Albedo ledger, blind coverage, pre-v2.4,
source lattice, transmutation trace, v2.4 patch).

- The published post **exists** at `src/content/posts/the-body-is-the-first-country.md` (2,331 words, `draft: false`).
- The v2.4 patch **does not apply cleanly** (`git apply --check` fails at line 17). Some of its language already landed; the remainder drifted.
- This is staging residue, not an unpublished article. Archive or delete after a one-line confirmation that the published essay is the intended v2.4, rather than trying to re-apply the patch.

---

## Drift review set (vectorizer, Qwen3, 12 posts)

From `docs/semantic-similarity-report.json` (`qwen3-embed-8b`, 1024-d, Drift < 0.36):

| Score | Post |
|---|---|
| 0.2835 | `chakra-bioelectricity-mapping.md` |
| 0.2932 | `magnetic-substrate.md` |
| 0.3032 | `nadi-bioimpedance-protocol.md` |
| 0.3170 | `noetic-aether-einsteinian-knot.md` |
| 0.3234 | `the-moon-refracts-everything.md` |
| 0.3244 | `shadbala-tensor-field-theory.md` |
| 0.3267 | `implosion-paradigm.md` |
| 0.3375 | `bioelectric-protocol.md` |
| 0.3383 | `topological-pocket-consciousness.md` |
| 0.3478 | `qualified-to-qualia-fied.md` |
| 0.3526 | `the-star-names-you.md` |
| 0.3572 | `the-body-is-the-first-country.md` |

These are the technical / bioelectric essays AGENTS.md already named. Review against
`docs/VOICE.md`; do not treat Drift as an automatic rewrite trigger.

Overlap with the expansion queue: `bioelectric-protocol`, `implosion-paradigm`,
`qualified-to-qualia-fied`. Voice review those *before* a 4× expand, or the expand
will lock in the drift.

---

## Execution queue

Ordered. Do not skip 0–2 to go write essays.

### 0. Let the vault reindex finish

Watch `workers/.vault-reindex-v5.log`. Resume is idempotent; a second concurrent run
is not. After it completes, probe `/search` and `/chat` against a vault-only query
and a blog-only query.

### 1. GitHub hygiene (tracking, not content) — done 2026-09-12

Proved live: [milestone #5](https://github.com/Sheshiyer/synchronocities-blog/milestone/5) `open_issues=34`, every open issue is on it, none missing a milestone.

- Created milestone **#5 Corpus + edge leftovers**.
- Reopened #212, #214, #215, #216, #219, #221, #222, #223, #226, #228, #232, #234, #236, #238 with measured word-count comments.
- Closed #201–#210 as `DUPLICATE` of the matching expansion issues.
- Annotated #242 (body + [comment](https://github.com/Sheshiyer/synchronocities-blog/issues/242#issuecomment-5641359561)).
- Assigned epic #242, tooling #243–#245, and all 30 expansion issues to milestone 5.

Still do **not** land the next auto-expand loop until #243 and #245 exist in code. #244 can wait.

### 2. Site leftovers (small, unblocked)

- Add `src/pages/404.astro`, then set `not_found_handling` to `"404-page"` in `wrangler.jsonc`.
- Decide Managed robots.txt (keep the zone block, or turn it off so `llms.txt` is actually crawlable).

### 3. Voice: the 12 Drift posts

Read, don't bulk-rewrite. Flag which are load-bearing technical essays that *should*
sit outside the travelogue centroid.

### 4. Expansion pass (content)

One post per session, as #242 already specifies. Use `/expand/v2/section` (retrieval-grounded),
not naked `/expand`. Skip any post still in the Drift set until step 3 has a verdict.

### 5. Optional / later

- Move `tryambakam.com` nameservers to Cloudflare.
- CSP (Astro inline bootstrap + runtime GLSL — needs a designed policy, not a guess).
- Archive `_processing/` once the published body essay is confirmed.
- Queues (`EMBED_QUEUE`) still commented; leave them.

---

## Explicitly out of scope until the queue above moves

- Speculative Vectorize rewrite or a second full reindex.
- Deploying either Worker "to pick up docs".
- Re-running the March design-overhaul or April non-card plans.
- Closing #242 because some sub-issues are GitHub-green.
