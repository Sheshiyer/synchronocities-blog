# synchronocities-ai

NVIDIA NIM multi-model router for the synchronocities blog. Cloudflare Workers.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Astro frontend (synchronocities.tryambakam.com)                     │
│   ├─ /research          → fetches /search at runtime                 │
│   ├─ /posts/[slug]      → fetches /related/:slug at build            │
│   ├─ /maps              → reads R2 cluster artifact at build         │
│   └─ <CorpusChat>       → streams /chat (SSE)                        │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  synchronocities-ai (Cloudflare Worker)                              │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │  Routing layer (src/routing.ts)                              │   │
│   │  surface → {model, params, cache_ttl}                        │   │
│   │  • semantic-search  → embed model + rerank model             │   │
│   │  • related-posts    → embed model (vector knn)               │   │
│   │  • llm-summary      → chat model                             │   │
│   │  • canonical-qs     → chat model (different prompt)          │   │
│   │  • concept-cluster  → embed model + chat (for cluster label) │   │
│   │  • rerank-llms-txt  → rerank model                           │   │
│   │  • rag-chat         → embed + rerank + chat (3-stage)        │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                       │                                              │
│         ┌─────────────┼─────────────┬──────────────┐                 │
│         ▼             ▼             ▼              ▼                 │
│   ┌─────────┐  ┌─────────────┐  ┌─────────┐  ┌──────────┐            │
│   │ NIM API │  │  Vectorize  │  │   KV    │  │    R2    │            │
│   │ (embed/ │  │   (corpus   │  │ (query  │  │ (cluster │            │
│   │ chat/   │  │   index)    │  │ cache + │  │ outputs, │            │
│   │ rerank) │  │             │  │ limits) │  │ summaries│            │
│   └─────────┘  └─────────────┘  └─────────┘  └──────────┘            │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                  ┌────────────────────────────────┐
                  │  integrate.api.nvidia.com/v1/  │
                  │  (NVIDIA NIM hosted models)    │
                  └────────────────────────────────┘
```

## Model selection (defaults in `wrangler.toml [vars]`)

All five models below are validated callable on this account's NIM tier via
`/test/probe-one`. The original picks (nv-embedqa-mistral-7b-v2,
llama-3.1-nemotron-70b, llama-3.2-nv-rerankqa-1b-v2) either 404 on this tier
or exceed the Vectorize dimension cap — see the notes in `wrangler.toml`.

| Surface | Model | Why |
|---|---|---|
| Embeddings (search, related, RAG retrieval, clustering input) | `nvidia/nv-embedqa-e5-v5` | 1024-d, ~585ms — fits the Cloudflare Vectorize cap (1536-d max) |
| Chat (summaries, canonical questions, RAG answers) | `nvidia/nemotron-3-super-120b-a12b` | 120B, ~385ms — primary synthesis; swapped in 2026-07-20 after llama-3.3-70b-instruct went unreachable on this tier |
| Reranking (RAG result refinement, /llms.txt ordering) | `nvidia/nemotron-mini-4b-instruct` | 4B, ~405ms — cheap LLM-as-judge rerank on every search/RAG call |
| Cluster labeling (concept-cluster surface) | `nvidia/nemotron-mini-4b-instruct` | Same cheap model reused for the lower-frequency cluster-naming job |
| Safety (/chat content moderation) | `nvidia/llama-3.1-nemoguard-8b-content-safety` | ~450ms — runs concurrently with the query embedding, no added latency |

All overridable per-surface in `src/routing.ts` and per-environment via `.dev.vars`.

## Non-linear processing

Each request fans out via `Promise.allSettled`:
- Embedding requests batched (NIM supports up to ~96 texts per call)
- Cache lookup happens in parallel with NIM call (whichever returns first wins)
- Failed surfaces fail open (cached or empty result), never block the response
- The corpus-index endpoint queues per-post embedding jobs to `EMBED_QUEUE` instead of doing them inline

## Endpoints (final shape; built in tasks #5–#10)

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/`                  | Service info + model selection |
| `GET`  | `/healthz`           | Liveness probe |
| `GET`  | `/search?q=...`      | Semantic search across all posts |
| `GET`  | `/related/:slug`     | Top-5 related posts for a given slug |
| `POST` | `/chat`              | Streaming RAG (SSE), CORS-enabled |
| `POST` | `/embed/batch`       | Reindex the corpus (auth-gated) |
| `POST` | `/generate/summary`  | Auto-generate llm.summary + canonical_questions |
| `POST` | `/maps/cluster`      | Cluster the corpus by embedding similarity |

## Authentication (ISSUE-02)

Admin routes are gated by a shared secret. Send it as the `X-Admin-Key` header
(`Authorization: Bearer <key>` also accepted). Comparison is constant-time.

```bash
wrangler secret put ADMIN_API_KEY        # one-time, prompted — use a strong random string
```

**Fail-CLOSED:** if `ADMIN_API_KEY` is not set on the Worker, every admin route
returns `500 {error:"server_misconfigured"}` — a misconfigured deploy is never
silently open. Wrong/missing key → `401 {error:"unauthorized"}`.

| Public (no key) | Admin (X-Admin-Key required) |
|---|---|
| `GET /`, `GET /healthz` | `POST /embed/batch` |
| `GET /models` | `POST /expand`, `POST /expand/section` |
| `GET /search` | `POST /expand/v2/section` |
| `GET /related/:slug` | `POST /generate/summary` |
| `POST /chat` | `POST /maps/cluster` (GET stays public) |
| `GET /maps/cluster` | all `/test/*`, `GET /vectorize/info` |

Ops scripts (`index-corpus.ts`, `index-vault.ts`, `expand-posts.ts`,
`expand-v2-posts.ts`, `probe-catalog.ts`, `eval-embed.py`) read
`process.env.ADMIN_API_KEY` / `$ADMIN_API_KEY` and fail fast with a clear
message when it's missing. GitHub Actions passes it from the `ADMIN_API_KEY`
repo secret.

### /chat rate limit + safety

- **Rate limit:** the `CHAT_RATE_LIMIT` Cloudflare ratelimit binding
  (`[[unsafe.bindings]]` in `wrangler.toml`) enforces 20 req/min per IP
  (`CF-Connecting-IP`). When the binding is absent (e.g. `wrangler dev`),
  an in-isolate fallback limits to 10 req/min per IP. Exceeded →
  `429 {error:"rate_limited"}`.
- **Safety check:** the user query is sent to the `chat.safety-check` surface
  (nemoguard, `NIM_SAFETY_MODEL`) concurrently with the query embedding — no
  added latency. A clearly-unsafe verdict returns a polite SSE refusal
  (`event: refusal` + one `token` + `done`) without streaming. Any error or
  unparseable verdict **fails open** (logged, request continues).

### CORS

`Access-Control-Allow-Origin` is no longer `*`. Only
`https://synchronocities.tryambakam.com` and dev origins
(`http://localhost:*`, `http://127.0.0.1:*`) receive CORS headers, applied
centrally by the fetch wrapper (`src/lib/auth.ts`). Other origins get none —
the browser blocks the response. OPTIONS preflight is handled centrally too.

## Local development

```bash
cd workers
cp .dev.vars.example .dev.vars
# Edit .dev.vars: paste your NVIDIA_API_KEY from https://build.nvidia.com/
bun install
bun run dev          # wrangler dev — exposes localhost:8787
bun run models:list  # one-shot script: list all NIM models, helps pick alternates
```

## Production deployment

```bash
wrangler login
wrangler secret put NVIDIA_API_KEY                    # paste key when prompted

# Create Cloudflare resources (one-time)
wrangler vectorize create synchronocities-corpus \
  --dimensions=4096 --metric=cosine
wrangler kv:namespace create CACHE                    # paste returned id into wrangler.toml
wrangler r2 bucket create synchronocities-artifacts
wrangler queues create synchronocities-embed-jobs
wrangler queues create synchronocities-embed-dlq

bun run deploy                                        # wrangler deploy
```

## State

All 12 tasks complete. Live at `https://synchronocities-ai.sheshnarayan-iyer.workers.dev`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/healthz`         | GET  | Service info + model selection |
| `/models`          | GET  | NIM catalog (cached 1h) |
| `/vectorize/info`  | GET  | Vectorize index stats |
| `/embed/batch`     | POST | Corpus indexing (idempotent via content hash) |
| `/search`          | GET  | Semantic search across corpus |
| `/related/:slug`   | GET  | Related-posts recommendations |
| `/generate/summary` | POST | Auto-generate llm.summary + canonical_questions |
| `/chat`            | POST | Streaming RAG with citations (SSE) |
| `/maps/cluster`    | GET/POST | Concept clusters (GET reads R2, POST recomputes) |
| `/test/wrapper`    | GET  | Diagnostic: end-to-end embed+chat+rerank |
| `/test/probe-one`  | GET  | Diagnostic: test a single model `?model=...&kind=embed\|chat` |
| `/test/routing`    | GET  | Diagnostic: cache + fan-out + fail-open |

## Validated model trio

This mirrors the "Model selection" table above (single source of truth:
`wrangler.toml [vars]`); kept here with measured latencies from the probes.

| Surface | Model | Latency |
|---|---|---|
| Embed | `nvidia/nv-embedqa-e5-v5` | 1024-d, ~600ms |
| Chat primary | `nvidia/nemotron-3-super-120b-a12b` | ~385ms |
| Cheap (rerank + clusters) | `nvidia/nemotron-mini-4b-instruct` | ~450ms |
| Safety | `nvidia/llama-3.1-nemoguard-8b-content-safety` | ~450ms |

## Key never enters source control

- `.dev.vars` is gitignored (only `.dev.vars.example` is committed)
- Production secrets go through `wrangler secret put` — encrypted at rest in Cloudflare
- The Worker reads `env.NVIDIA_API_KEY` at request time; the value never appears in logs or responses
- The GitHub Action does not need the key — `wrangler deploy` and `wrangler secret put` are separate operations; secrets stay in Cloudflare's secret store

## Deploy playbook (one-time setup)

```bash
# 1. Cloudflare resources (one-time)
wrangler login
wrangler kv namespace list                                # CACHE id already in wrangler.toml
wrangler vectorize create synchronocities-corpus --dimensions=1024 --metric=cosine
wrangler r2 bucket create synchronocities-artifacts

# 2. Secrets
wrangler secret put NVIDIA_API_KEY                        # paste from build.nvidia.com when prompted
wrangler secret put ADMIN_API_KEY                         # strong random string; same value goes in the GitHub repo secret

# 3. Deploy + index
cd workers
bun install
bunx wrangler deploy
ADMIN_API_KEY=... bun scripts/index-corpus.ts             # embeds all 125 posts → Vectorize

# 4. Cluster (optional, periodic)
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
  https://synchronocities-ai.sheshnarayan-iyer.workers.dev/maps/cluster?k=8
```

## CI/CD

`.github/workflows/synchronocities-ai-deploy.yml` deploys on push to `workers/**`
and re-indexes when `src/content/posts/**` changes. Requires repo secrets:

- `CLOUDFLARE_API_TOKEN` — scoped: Workers Scripts Edit, Vectorize Edit, KV Edit, R2 Edit
- `CLOUDFLARE_ACCOUNT_ID` — same as `wrangler whoami` output
- `ADMIN_API_KEY` — must match the Worker Secret; the reindex step posts to the auth-gated `/embed/batch`

Manual trigger available via the Actions tab (`workflow_dispatch`), with an
optional `reindex` boolean to force re-embedding of all posts.

## Costs (rough)

| Resource | Tier needed | Notes |
|---|---|---|
| Workers | Free plan covers 100k req/day | Each /search ≈ 1 invocation; /chat ≈ 1 (streaming uses single invocation) |
| Vectorize | Standard plan ($0.04/M queried vectors) | 125 vectors × moderate query volume ≈ negligible |
| KV | Free 1k writes/day, 100k reads | Search caches reduce NIM calls; should fit free |
| R2 | Free 10GB storage, Class A ops included | One cluster artifact ≈ 50KB |
| NIM | Per-token billing on build.nvidia.com | Dominant cost; cache hit on /search reduces calls |
