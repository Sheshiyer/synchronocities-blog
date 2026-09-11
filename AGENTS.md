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

### 1. 🔴 The retrieval stack is broken in production

`NIM_EMBED_MODEL = "nvidia/nv-embedqa-e5-v5"` **reached end-of-life 2026-08-25** and now
returns HTTP 410 from NVIDIA. Live consequences:

- `GET /search` → 500 (`error code: 1101`)
- `POST /chat` → hangs at the query-embed step
- `POST /embed/batch`, `POST /maps/cluster`, `scripts/semantic-vectorizer.py` → all fail
- `GET /related/:slug` still works — it reads a **stored** vector by id and never embeds

The 28,290 vectors in `synchronocities-corpus` are orphaned: no live model produces that
vector language. Every replacement candidate on this NIM tier is 2048-d or 4096-d and
**exceeds Vectorize's 1536-d cap**, so a swap means dimension truncation or a new index —
and a full reindex either way. Do not treat this as a one-line config fix.

### 2. 🔴 There is no git remote and no history

`git log` = one empty "Initial commit". 0 tracked files. 21 untracked top-level entries.
Nothing is pushed anywhere. Consequently **all three GitHub Actions workflows are inert** —
including `probe-catalog-daily.yml`, the job whose entire purpose is warning about the
model EOL in (1). Assume no CI has run since the repo was re-initialized.

### 3. 🟠 The canonical domain is `.space`, not `.com`

`synchronocities.tryambakam.com` is **not usable**: `tryambakam.com` sits on GoDaddy
nameservers and is not a zone in this Cloudflare account, so no Workers custom domain can
bind to it. It was never on Vercel either. The live canonical is
`synchronocities.tryambakam.space`, set **once** in `astro.config.mjs` → `site`; the four
text endpoints derive it via `import.meta.env.SITE`. Only `public/robots.txt` still writes
the host by hand.

### 4. 🟡 The site has no deploy pipeline

`synchronocities-site` is deployed **by hand** (`npm run build && wrangler deploy`). The
three GitHub workflows only cover the Worker, the model probe, and the quality audit — and
none of them can run anyway (see 2).

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
| 1 | Pick a Vectorize-compatible embedding model (≤1536-d) and reindex the corpus | `/search`, `/chat`, all reindexing |
| 2 | Restore the git remote and push, so CI and the daily model probe run again | early warning on the next EOL |
| 3 | Add a `404.astro`, then flip `not_found_handling` to `"404-page"` in `wrangler.jsonc` | misses return a bare CF 404 |
| 4 | Decide the Cloudflare **Managed robots.txt** question — it `Disallow: /`s GPTBot, ClaudeBot, CCBot and friends at zone level, which contradicts shipping `llms.txt` | LLM discoverability |
| 5 | Filter `/related` and `/maps` by `source_type` so vault chunks stop leaking into blog-facing surfaces | discovery UX |
| 6 | Add a deploy workflow for `synchronocities-site` (currently hand-deployed) | release repeatability |
| 7 | Optional: move `tryambakam.com` nameservers to Cloudflare to reclaim the `.com` canonical | branding |

Detail, evidence, and re-verification commands for each: `docs/INFRA.md`.
