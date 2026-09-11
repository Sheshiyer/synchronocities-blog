# AGENTS.md — synchronocities-blog

Working context for agents (Claude Code, Codex, Cursor, OpenCode) operating in this repo.
Written from a verified deep pass on **2026-09-12**. Read this before touching anything.

> Full verified infrastructure map with commands and probe output: **[`docs/INFRA.md`](docs/INFRA.md)**.

---

## What this is

A Tryambakam Noesis sub-brand blog: a 55-day mythic journey through Thailand told as a
depth-scrolling Three.js tarot gallery, plus a much larger essay archive, plus an
AI retrieval layer over both.

Two deployable units live in one repo — **both now live on Cloudflare**:

1. **`/` → `synchronocities-site`** — Astro 6 static site on Workers Static Assets.
   **https://synchronocities.tryambakam.space** · config `wrangler.jsonc` (repo root) ·
   `npm run build && wrangler deploy`.
2. **`workers/` → `synchronocities-ai`** — Cloudflare Worker, NVIDIA NIM multi-model router
   (embeddings, SSE RAG chat, rerank, cluster labelling, safety).
   **https://synchronocities-ai.tryambakam.space** · config `workers/wrangler.toml` ·
   `cd workers && wrangler deploy --config ./wrangler.toml`.

The frontend calls the Worker through `src/lib/aiClient.ts`
(override with `PUBLIC_AI_BASE_URL`).

---

## Read this before you plan anything

Four facts that invalidate most reasonable assumptions about this repo:

### 1. Inference is split across two providers

The NVIDIA NIM tier collapsed from **39 reachable models to 12** between 2026-07-22 and
2026-09-11, killing `nv-embedqa-e5-v5` (embeddings, EOL 2026-08-25) and
`nemotron-mini-4b-instruct` (rerank + cluster labelling). Since 2026-09-12:

| Surface | Provider | Model |
|---|---|---|
| embeddings | **Nebius** | `Qwen/Qwen3-Embedding-8B` @ 1024-d (Matryoshka) |
| rerank + cluster label | **Nebius** | `Qwen/Qwen3-30B-A3B-Instruct-2507` |
| chat / RAG, safety | NVIDIA NIM | `nemotron-3-super-120b-a12b`, `nemoguard-8b` |

Routing lives in `upstreamFor()` in `lib/nim.ts` plus a per-surface `upstream` in
`routing.ts`. `EMBED_DIMENSIONS` **must** equal the Vectorize index width (1024) —
`embed()` hard-fails on a mismatch rather than corrupting the index.

**Rerank needs an INSTRUCT model, never a reasoning one.** `parseScores()` expects bare
comma-separated integers; a reasoning model emits chain-of-thought into `content` and
silently degrades rerank to the fail-open neutral 5.

### 2. The vault reindex may still be running

`CORPUS_VERSION` is **5**. Blog entries (126) are reindexed on Qwen3. The ~28,290 vault
chunks take ~6h at ~1.4 chunks/sec — check `workers/.vault-reindex-v5.log`. Until it
finishes, unfiltered surfaces (`/search`, `/chat`) mix fresh blog vectors with stale
e5-v5 vault ones. The indexer is idempotent, so re-running resumes rather than redoing.

### 3. 🟠 The canonical domain is `.space`, not `.com`

`synchronocities.tryambakam.com` is **not usable**: `tryambakam.com` sits on GoDaddy
nameservers and is not a zone in this Cloudflare account, so no Workers custom domain can
bind to it. It was never on Vercel either. The live canonical is
`synchronocities.tryambakam.space`, set **once** in `astro.config.mjs` → `site`; the four
text endpoints derive it via `import.meta.env.SITE`. Only `public/robots.txt` still writes
the host by hand.

### 4. Both Workers deploy from CI

`synchronocities-site-deploy.yml` builds and ships the site; `synchronocities-ai-deploy.yml`
ships the Worker and reindexes when posts change. The AI workflow's change detection was
rewritten to diff the whole push range — it used to read only `head_commit`, so `workers/`
edits in a non-head commit silently skipped the deploy.

---

## Layout

```
src/
├── experience/           Three.js depth gallery (Engine, Gallery, Scroll, GLSL shaders)
│                         aliased as @experience
├── content/posts/        126 markdown entries — 43 with card: (tarot travelogue),
│                         83 with entry_kind: (78 essay, 4 hub, 1 reference)
├── components/           React islands + .astro partials
├── lib/                  tarot.ts, cardColors.ts, cardExperience.ts, aiClient.ts
├── pages/                index, posts/[...slug], card/[card], journeys, research,
│                         maps, chat, + llms.txt / llms-full.txt /
│                         llms-manifest.json / start.txt endpoints
├── layouts/BaseLayout.astro
└── styles/global.css     design tokens + 8 card-specific layouts

workers/                  synchronocities-ai Worker (src/, scripts/, wrangler.toml)
scripts/                  repo tooling — validate-post-metadata.ts, ci-audit.py,
                          semantic-vectorizer.py, generate-dashboard.py, …
quality-engine/           Nigredo/Albedo/Rubedo audit engine (agents, manifests, schemas)
docs/                     INFRA.md, VOICE.md, TAGS.md, plans/, generated audit artifacts
_processing/              staging for scripts/propose-processing-import.ts
```

---

## Commands

```bash
npm install
npm run dev              # localhost:4321
npm run build            # prebuild runs validate:posts; static output → dist/
npm run test             # node --test over tests/*.test.ts
npm run validate:posts   # frontmatter + tag-taxonomy gate (currently: 0 errors, tag warnings)
npm run import:processing

cd workers
bun install
bun test
wrangler dev
wrangler deploy
```

Node `>=22.12.0`. Vite cache errors after edits → `rm -rf node_modules/.vite`.

---

## Conventions

- **Content model** — frontmatter is enforced by `src/content.config.ts` and
  `scripts/validate-post-metadata.ts`. Card entries carry `card` / `suit` / `phase` /
  `kosha` / `identity` / `revolution`; non-card entries carry `entry_kind`. Run
  `npm run validate:posts` after any frontmatter edit; the prebuild will run it anyway.
- **Tags** — governed by `docs/TAGS.md`. New single-use tags produce orphan warnings;
  consolidate into an existing cluster rather than inventing a sibling.
- **Voice** — `docs/VOICE.md` is binding for prose. `quality-engine/` audits against it
  and tracks "contamination signatures" (generic wellness/AI vocabulary).
- **Layouts** — 8 per-card layout types in `src/styles/global.css` keyed off
  `src/lib/cardExperience.ts`. Each post is intentionally its own world; don't
  homogenize them into one template.
- **CodeGraph** — a CodeGraph MCP index exists for this repo (`.cursor/rules/codegraph.mdc`).
  Prefer `codegraph_*` for structural questions over grep-and-read loops.

---

## Rules of engagement

- **Deploying the AI Worker needs `--config ./wrangler.toml`.** A bare `wrangler deploy`
  from `workers/` resolves the *root* `wrangler.jsonc` and ships `synchronocities-site`
  instead. Seen for real on 2026-09-12.
- **Do not remove `workers_dev = true` from `workers/wrangler.toml`.** Declaring `routes`
  makes Wrangler disable the `*.workers.dev` subdomain by default — which 404s a URL that
  every ops script, the integration tests, and the deploy workflow hardcode.
- **Stay one label deep on `tryambakam.space`.** The zone is on the **Free plan**, so
  Universal SSL covers `tryambakam.space` and `*.tryambakam.space` only. A two-level host
  (`ai.synchronocities.tryambakam.space` was tried) resolves but never gets a certificate.
- **`public/_headers` rules are cumulative, not first-match.** Any rule setting its own
  `Cache-Control` must begin with `! Cache-Control`, or the `/*` value splices in front of
  it and its `max-age` wins.
- **Never deploy speculatively.** Both Workers are live and the backend is mid-incident.
- **Never rewrite the Vectorize index or R2 artifacts speculatively.** A reindex is
  ~28k vectors and costs real NIM calls; `/maps/cluster` currently serves a cached R2
  artifact that is the *only* working discovery surface.
- **Match KV bindings by id, not title.** This Cloudflare account is shared across many
  projects. There is an unrelated namespace literally titled `CACHE`
  (`d5aa9b42b2f948bfa59143d5a56ea58b`). The synchronocities one is titled
  `SYNCHRONOCITIES_CACHE` and its id is `5e7bd8128b7b47cba0df0b11cb26aa88` — which is what
  `wrangler.toml` correctly binds. An old comment in that file says otherwise; it's wrong.
- **Secrets** — `NVIDIA_API_KEY` and `ADMIN_API_KEY` are Worker Secrets, set via
  `wrangler secret put`, never in the repo. `workers/.env` and `workers/.dev.vars` hold a
  local `ADMIN_API_KEY` and are confirmed git-ignored. Don't print, echo, or commit them.
- **Don't claim the site is live.** Until DNS and a host exist, "deployed" means the
  Worker only.
- **Ordering** — restoring the git remote (blocker 2) should precede the embed-model fix
  (blocker 1). Without a remote, the daily catalog probe still can't warn you the next
  time a model retires.

---

## Open threads

| # | Thread | Blocking |
|---|---|---|
| 1 | Let the vault reindex finish, then regenerate the R2 cluster artifact (`bun workers/scripts/compute-clusters.ts`) for v5 | `/maps` |
| 2 | Add a CI assertion that fails when a configured model leaves `.reachable-models.txt` — this tier lost 2 of 5 models in 7 weeks and nothing noticed | next silent outage |
| 8 | Recalibrate `scripts/semantic-vectorizer.py` bands for Qwen3 — the 0.57/0.37 thresholds were fitted to e5-v5 | local QA accuracy |
| 3 | Add a `404.astro`, then flip `not_found_handling` to `"404-page"` in `wrangler.jsonc` | misses return a bare CF 404 |
| 4 | Decide the Cloudflare **Managed robots.txt** question — it `Disallow: /`s GPTBot, ClaudeBot, CCBot and friends at zone level, which contradicts shipping `llms.txt` | LLM discoverability |
| 5 | Filter `/related` and `/maps` by `source_type` so vault chunks stop leaking into blog-facing surfaces | discovery UX |
| 6 | Add a deploy workflow for `synchronocities-site` (currently hand-deployed) | release repeatability |
| 7 | Optional: move `tryambakam.com` nameservers to Cloudflare to reclaim the `.com` canonical | branding |

Detail, evidence, and re-verification commands for each: `docs/INFRA.md`.
