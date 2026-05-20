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

| Surface | Model | Why |
|---|---|---|
| Embeddings (search, related, RAG retrieval, clustering input) | `nvidia/nv-embedqa-mistral-7b-v2` | 4096-d retrieval-optimized embedding; tops MTEB retrieval leaderboard; native to NIM with batch support |
| Chat (summaries, canonical questions, RAG answers) | `nvidia/llama-3.1-nemotron-70b-instruct` | NVIDIA's instruction-tuned Llama 3.1 70B; strong on long-form synthesis + structured output |
| Reranking (RAG result refinement, /llms.txt ordering) | `nvidia/llama-3.2-nv-rerankqa-1b-v2` | Latency-optimized 1B rerank model; pairs with the larger chat model for the RAG pipeline |
| Cluster labeling (concept-cluster surface) | `meta/llama-3.3-70b-instruct` | Cheaper general-purpose chat for the lower-frequency clustering job |

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

All 12 tasks complete. Live at `https://synchronocities-ai.tirak-court.workers.dev`.

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

| Surface | Model | Latency |
|---|---|---|
| Embed | `nvidia/nv-embedqa-e5-v5` | 1024-d, ~600ms |
| Chat primary | `meta/llama-3.3-70b-instruct` | ~400ms |
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

# 3. Deploy + index
cd workers
bun install
bunx wrangler deploy
bun scripts/index-corpus.ts                               # embeds all 125 posts → Vectorize

# 4. Cluster (optional, periodic)
curl -X POST https://synchronocities-ai.tirak-court.workers.dev/maps/cluster?k=8
```

## CI/CD

`.github/workflows/synchronocities-ai-deploy.yml` deploys on push to `workers/**`
and re-indexes when `src/content/posts/**` changes. Requires repo secrets:

- `CLOUDFLARE_API_TOKEN` — scoped: Workers Scripts Edit, Vectorize Edit, KV Edit, R2 Edit
- `CLOUDFLARE_ACCOUNT_ID` — same as `wrangler whoami` output

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
