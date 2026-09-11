# Infrastructure Map — synchronocities-blog

> **Verified live 2026-09-12** against the Cloudflare account and both deployed Workers
> (`wrangler whoami`, `kv namespace list`, `r2 bucket list`, `vectorize info`,
> `deployments list`, `secret list`, `wrangler tail`, the `/workers/domains` API) plus
> live HTTP probes and DNS. Observed state, not aspiration. Re-verify with the commands
> in [Re-verification](#re-verification) before trusting it.

---

## TL;DR

| Question | Answer |
|---|---|
| Is this on Vercel? | **No — and it never was.** No `.vercel/`, no `vercel.json`, no adapter, no matching project in the Vercel account. |
| Where is the frontend? | **`https://synchronocities.tryambakam.space`** — Cloudflare Workers Static Assets, deployed 2026-09-12. |
| Where is the backend? | **`https://synchronocities-ai.tryambakam.space`** — Cloudflare Worker, custom domain added 2026-09-12. `*.workers.dev` still live. |
| Is the backend healthy? | **Partially.** `/`, `/healthz`, `/models`, `/maps/cluster`, `/related/:slug` OK. **`/search` returns 500 and `/chat` hangs** — the embedding model hit end-of-life. |
| Is CI running? | **No.** The local git repo has no remote and no history, so the workflows in `.github/` have nothing to run against. |

---

## 1. Frontend — `synchronocities-site` ✅ LIVE

| Property | Value |
|---|---|
| URL | **https://synchronocities.tryambakam.space** |
| Fallback URL | https://synchronocities-site.sheshnarayan-iyer.workers.dev |
| Platform | Cloudflare **Workers Static Assets** (not Pages) |
| Config | `wrangler.jsonc` at the repo root |
| Framework | Astro 6, **no SSR adapter** → pure static (`dist/`) |
| Zone | `tryambakam.space` — `3c1066df55d4e99464c8bcf1f850894b`, **Free plan** |
| Deploy | `npm run build && wrangler deploy` (from the repo root) |
| Content | 126 markdown entries — 43 with a `card:` (tarot travelogue), 83 with `entry_kind` (78 essay, 4 hub, 1 reference) |
| Build output | 153 HTML pages, 391 assets |
| Node engine | `>=22.12.0` (local: v26.8.1) |

Routes: `index`, `posts/[...slug]`, `card/[card]`, `journeys`, `research`, `maps`, `chat`,
plus the `llms.txt` / `llms-full.txt` / `llms-manifest.json` / `start.txt` endpoints.

### Why `.space` and not `.com`

`synchronocities.tryambakam.com` was the original canonical URL and is **still not usable**:
`tryambakam.com` sits on GoDaddy nameservers (`ns29/ns30.domaincontrol.com`) and is not a
zone in this Cloudflare account, so no Workers custom domain can bind to it. The domain is
nearly empty — parking A records, a `www` CNAME, a GoDaddy DMARC TXT, **no MX and no SPF** —
so moving its nameservers to Cloudflare later would be low-risk. Until then `.space` is
canonical, matching the sibling projects (`urania.tryambakam.space`, `thoughtseed.space`).

The canonical host is set **once**, in `astro.config.mjs` → `site`. The four text endpoints
under `src/pages/` derive it via `import.meta.env.SITE`; `public/robots.txt` is the one
place it is still written by hand.

### Edge headers — `public/_headers`

Astro copies `public/` verbatim into `dist/`, where the assets runtime reads the file.

| Pattern | Cache-Control |
|---|---|
| `/_astro/*` | `public, max-age=31536000, immutable` (content-hashed) |
| `/fonts/*` | `public, max-age=31536000, immutable` + `ACAO: *` |
| `/cards/*`, `/images/*`, `/models/*` | `public, max-age=604800, stale-while-revalidate=86400` |
| `/llms.txt`, `/llms-full.txt`, `/llms-manifest.json`, `/start.txt` | `public, max-age=3600` |
| `/*` (HTML) | `public, max-age=0, must-revalidate` + security headers |

Security headers on `/*`: `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options`, `Permissions-Policy`. **No CSP yet** — Astro emits inline bootstrap
scripts and the Three.js islands compile GLSL at runtime, so a policy needs testing first.

> ⚠️ **`_headers` rules are cumulative, not first-match.** Every matching pattern
> contributes. A bare `/*  Cache-Control:` therefore leaks into `/_astro/*`, producing a
> spliced `public, max-age=0, must-revalidate, public, max-age=31536000, immutable` whose
> *first* `max-age` wins — silently destroying immutable caching. This happened on the
> first deploy. Every rule that sets its own `Cache-Control` now begins with
> `! Cache-Control` to unset the inherited one. Verified live afterwards.

### Known gaps

- **No 404 page.** There is no `src/pages/404.astro`, so `not_found_handling` is `"none"`
  and misses return a bare Cloudflare 404. Switch to `"404-page"` once a designed one exists.
- **Cloudflare Managed robots.txt is being injected.** The served `/robots.txt` is prefixed
  with a Cloudflare-managed block that `Disallow: /` for `GPTBot`, `ClaudeBot`, `CCBot`,
  `Google-Extended`, `Amazonbot`, `Bytespider`, `meta-externalagent`, and others, and sets
  `Content-Signal: search=yes,ai-train=no,use=reference`. That is a **zone-level setting**,
  not something in this repo. It is arguably at odds with shipping `llms.txt` /
  `llms-full.txt` as deliberate LLM-facing surfaces — decide which you want.
- `/posts/<slug>` 307-redirects to `/posts/<slug>/`. Correct: Astro emits
  `posts/<slug>/index.html`, so the trailing-slash form is canonical and internal links
  already use it. Only hand-typed URLs take the hop.

---

## 2. Backend — `synchronocities-ai` ✅ LIVE (degraded)

| Property | Value |
|---|---|
| URL | **https://synchronocities-ai.tryambakam.space** |
| Also live | https://synchronocities-ai.sheshnarayan-iyer.workers.dev |
| Account | `Sheshnarayan.iyer@gmail.com's Account` — `9d9d23b27f32e70ae3afb6a1aa2c0f10` |
| Config | `workers/wrangler.toml` |
| Entry | `workers/src/index.ts` |
| `compatibility_date` | `2026-05-20`, flags `["nodejs_compat"]` |
| Deploy | `cd workers && wrangler deploy --config ./wrangler.toml` |

> ⚠️ **Always pass `--config ./wrangler.toml` when deploying the AI Worker.** A bare
> `wrangler deploy` from `workers/` resolved the *root* `wrangler.jsonc` and deployed
> `synchronocities-site` instead. Observed 2026-09-12.

> ⚠️ **`workers_dev = true` is load-bearing.** Declaring `routes` makes Wrangler disable
> the `*.workers.dev` subdomain by default. When the custom domain was first added it took
> `synchronocities-ai.sheshnarayan-iyer.workers.dev` to 404 — a URL hardcoded in every ops
> script (`index-corpus.ts`, `index-vault.ts`, `probe-catalog.ts`, `expand-*.ts`,
> `semantic-vectorizer.py`, `eval-embed.py`), in the integration tests, and in
> `.github/workflows/synchronocities-ai-deploy.yml`.

### Bindings — all four verified

| Binding | Type | Identifier | Verified |
|---|---|---|---|
| `CACHE` | KV | `5e7bd8128b7b47cba0df0b11cb26aa88` (preview `bd18e5cf…5028`) | ✅ titled **`SYNCHRONOCITIES_CACHE`**, not `CACHE` |
| `CORPUS_INDEX` | Vectorize | `synchronocities-corpus` | ✅ 1024-d cosine, **28,290 vectors**, last mutation 2026-07-22 |
| `ARTIFACTS` | R2 | `synchronocities-artifacts` | ✅ serves `clusters-v{CORPUS_VERSION}.json`, `saturation/v{…}.json` |
| `CHAT_RATE_LIMIT` | ratelimit | ns `1001`, 20 req/60 s | ✅ in-isolate 10 req/min fallback when absent |

> ⚠️ **Match KV by id, never title.** This account is shared. A separate, unrelated
> namespace is literally titled `CACHE` (`d5aa9b42b2f948bfa59143d5a56ea58b`). "Correcting"
> the binding to match that title would repoint the cache at another project.

Queues (`EMBED_QUEUE`, DLQ) remain commented out; ops scripts embed inline.

### Secrets

| Secret | Where | Status |
|---|---|---|
| `NVIDIA_API_KEY` | Worker Secret | ✅ set |
| `ADMIN_API_KEY` | Worker Secret + local `workers/.env`, `workers/.dev.vars` | ✅ set; both local files confirmed git-ignored |

Admin gating fails **closed** — no `ADMIN_API_KEY` on the Worker → `500 server_misconfigured`.

### CORS

`ALLOWED_ORIGINS` in `workers/src/lib/auth.ts`:
`https://synchronocities.tryambakam.space` (live) and `https://synchronocities.tryambakam.com`
(reserved, so a later nameserver move needs no redeploy), plus any `http://localhost:*` /
`http://127.0.0.1:*` for dev. Verified live: the `.space` origin is echoed back; an
unknown origin gets no `Access-Control-Allow-Origin` header.

### Live probe results — 2026-09-12

| Endpoint | Result |
|---|---|
| `GET /` · `/healthz` | ✅ 200 — `phase: B`, `corpus_version: 4` |
| `GET /models` | ✅ 200 — live NIM catalog, **80 models** (was 118 at last probe) |
| `GET /maps/cluster` | ✅ 200 — R2 artifact, `generated_at 2026-07-20`, k=12, `total_posts: 28290` |
| `GET /related/:slug` | ✅ 200 — but returns **vault chunks** (`vault:resource:…#chunk-0`), not blog slugs |
| `GET /search?q=…` | ❌ **500 / `error code: 1101`** |
| `POST /chat` | ❌ **hangs** — no bytes in 50 s, logged as `Canceled` |
| `GET /vectorize/info` | 401 (expected — admin-gated) |

---

## 3. The production break — embedding model EOL 🔴

`wrangler tail` on a live `/search` call:

```
NimModelError: NIM 410: {"type":"about:blank","title":"Gone","status":410,
"detail":"The model 'nvidia/nv-embedqa-e5-v5' has reached its end of life
on 2026-08-25T09:00:00Z and is no longer available."}
    at nimFetch → embed → runSurface → handleSearch
```

`nvidia/nv-embedqa-e5-v5` is `NIM_EMBED_MODEL`. It is **gone from the live catalog**
(absent from the 80 models `/models` now returns). Every surface that embeds *new text* is
dead: `/search`, `/chat`, `/embed/batch`, `POST /maps/cluster`, and
`scripts/semantic-vectorizer.py`.

`GET /related/:slug` survives because it looks up a **stored** vector by id and runs a
vector-to-vector kNN — it never calls the embedding model. That asymmetry is the tell.

### Why the replacement is not a one-line swap

Cloudflare Vectorize caps at **1536 dimensions**. Of the embed models reachable at the last probe:

| Model | Dims | Fits Vectorize? |
|---|---|---|
| `nvidia/nv-embedqa-e5-v5` | 1024 | — **EOL 2026-08-25** |
| `nvidia/nemotron-3-embed-1b` | 2048 | ❌ |
| `nvidia/llama-nemotron-embed-1b-v2` | 2048 | ❌ |
| `nvidia/llama-nemotron-embed-vl-1b-v2` | 2048 | ❌ |
| `nvidia/nv-embed-v1` | 4096 | ❌ |
| `nvidia/nv-embedcode-7b-v1` | 4096 | ❌ |

Restoring search means (a) a model with Matryoshka/`dimensions` truncation to ≤1536,
(b) a new Vectorize index at the replacement's native width, or (c) a different provider.
**All three require a full 28,290-vector reindex** — the existing index is in a vector
language nothing live can still speak. Treat it as orphaned, not as an asset to preserve.

`probe-catalog-daily.yml` exists to catch exactly this drift. It has not run (see §5), so
the EOL landed silently on 2026-08-25.

### Second-order issue: corpus scope drift

`CORPUS_VERSION = "4"` widened the index from ~125 blog posts to the whole vault
(28,290 vectors). `/maps/cluster` reports `total_posts: 28290` and `/related/:slug` returns
`vault:resource:…#chunk-N` ids. Any frontend surface assuming a blog slug —
`RelatedPostModules.astro`, `/maps`, `/research` — gets ids it cannot link. A `source_type`
filter on the Vectorize query is the likely fix.

---

## 4. Gaps and risks

| # | Finding | Severity |
|---|---|---|
| 1 | `NIM_EMBED_MODEL` is EOL → `/search` 500, `/chat` hangs, reindex impossible; 28,290 vectors orphaned | 🔴 critical |
| 2 | Local git has **no remote and no history** — one empty "Initial commit", 0 tracked files. All three workflows inert | 🔴 critical |
| 3 | `/related` and `/maps` return vault chunk ids the frontend cannot resolve to posts | 🟠 high |
| 4 | No `404.astro`; misses return a bare Cloudflare 404 | 🟡 medium |
| 5 | Cloudflare Managed robots.txt blocks the AI crawlers the `llms.txt` surfaces are built for | 🟡 medium |
| 6 | `synchronocities.tryambakam.com` still unusable (GoDaddy NS); any external links to it stay dead | 🟡 medium |
| 7 | Ops scripts + CI still hardcode `*.workers.dev`, so `workers_dev = true` can't be turned off | 🟡 medium |
| 8 | No CSP on the site | 🟡 medium |
| 9 | Queues scaffolded-but-commented since Phase B | 🟢 low |

**Ordering note:** #2 gates #1. Restoring the embed model without a remote means the daily
probe still can't warn you the next time a model retires.

---

## 5. CI/CD — present but inert

Three workflows in `.github/workflows/`, none of which can fire (no remote):

| Workflow | Trigger | Does |
|---|---|---|
| `synchronocities-ai-deploy.yml` | push to `main` touching `workers/**` or `src/content/posts/**` | `wrangler deploy`, then `index-corpus.ts` reindex |
| `probe-catalog-daily.yml` | cron `0 4 * * *` | probes the NIM catalog, commits snapshots with `[skip ci]` |
| `weekly-audit.yml` | cron `17 3 * * 1` | 7-dimension quality audit + bounded fix stage, same-or-better gate |

Required secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ADMIN_API_KEY`, and
optional `NVIDIA_API_KEY`. Note **none of them deploys the site** — `synchronocities-site`
has no workflow yet and is currently deployed by hand.

Local `.reachable-models.txt` / `.catalog-probe.md` snapshot is dated **2026-07-22** —
7 weeks stale, predating the e5-v5 EOL.

---

## 6. Docs inventory

| Path | What it is | Freshness |
|---|---|---|
| `README.md` | Project overview, stack, design system | current |
| `AGENTS.md` | Agent working context | current |
| `docs/INFRA.md` | This file | current |
| `docs/VOICE.md` · `docs/TAGS.md` | Voice spec, tag taxonomy | reference |
| `docs/quality-dashboard.md` | Generated audit dashboard | 2026-08-07 — 125 posts, 25 PASS / 100 WARN / 0 FAIL |
| `docs/ci-audit-report.json` · `ci-audit-history.jsonl` | Audit artifacts | 2026-08-07 |
| `docs/semantic-similarity-report.json` | Local QA similarity scores | 2026-07-21 |
| `docs/plans/*.md` | 10 dated design/execution plans | historical |
| `workers/README.md` | Worker architecture, model + route tables, auth | model table flagged (EOL) |
| `quality-engine/` | Nigredo/Albedo/Rubedo audit engine | 2026-07/08 |
| `_PROJECT-STATUS.md` | Project snapshot | current |
| `plan.md` | Cosmology/Noesis-writer plan | brand-level |
| `tasks/todo.md` · `lessons.md` | Last closed task loop | closed |
| `_processing/` | Staging for `propose-processing-import.ts` | working set |

---

## Re-verification

```bash
# identity + account
wrangler whoami

# both Workers and their custom domains
wrangler deployments list                                  # site (root config)
cd workers && wrangler deployments list --config ./wrangler.toml

# bindings actually present
cd workers
wrangler kv namespace list | grep -A1 -B2 SYNCHRONOCITIES
wrangler r2 bucket list | grep synchronocities
wrangler vectorize info synchronocities-corpus
wrangler secret list

# live site
S=https://synchronocities.tryambakam.space
curl -sI "$S/" | grep -iE 'http/|cache-control|x-content-type'
curl -sI "$S/_astro/"*.js 2>/dev/null | grep -i cache-control   # must be immutable ONLY
curl -s "$S/robots.txt" | grep -i '^sitemap:'

# live worker
A=https://synchronocities-ai.tryambakam.space
curl -s "$A/healthz"
curl -s -w '\n[%{http_code}]\n' "$A/search?q=tower&limit=3"     # expect 500 until §3 is fixed
curl -s -o /dev/null -D- -X OPTIONS "$A/chat" \
  -H "Origin: $S" -H 'Access-Control-Request-Method: POST' | grep -i access-control-allow-origin

# see the real error
wrangler tail --config ./wrangler.toml --format=pretty   # then hit /search in another shell

# is the embed model still gone?
curl -s "$A/models" | grep -c nv-embedqa-e5-v5    # 0 == still gone
```

> If a hostname here returns `http 000` from this machine while `dig @1.1.1.1` resolves it
> fine, that is a stale **local** negative DNS cache (macOS caches the NXDOMAIN from before
> the record existed). Flush with
> `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`, or bypass with
> `curl --resolve synchronocities.tryambakam.space:443:104.21.82.17`.
