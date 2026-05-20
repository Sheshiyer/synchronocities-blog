/**
 * synchronocities-ai — Cloudflare Worker entry point.
 *
 * Multi-model NVIDIA NIM router. Each surface (semantic-search, related-posts,
 * llm-summary, canonical-questions, concept-clustering, rerank, rag-chat) maps
 * to a (model, params) pair declared in src/routing.ts. Endpoints fan out
 * non-linearly via Promise.allSettled — no surface blocks any other.
 *
 * Routes (final shape; handlers wired in subsequent tasks):
 *   GET  /                          → service info + model selection
 *   GET  /healthz                   → liveness probe
 *   GET  /search?q=...              → semantic search
 *   GET  /related/:slug             → related posts for a given slug
 *   POST /chat                      → RAG-with-corpus (streaming SSE)
 *   POST /embed/batch               → reindex the corpus (auth-gated)
 *   POST /generate/summary          → auto-generate llm.summary + questions
 *   POST /maps/cluster              → cluster the corpus by embedding
 */

export interface Env {
  // Secrets (from .dev.vars locally, `wrangler secret put` in prod)
  NVIDIA_API_KEY: string;

  // Vars (from wrangler.toml [vars])
  NIM_BASE_URL: string;
  NIM_EMBED_MODEL: string;
  NIM_CHAT_MODEL: string;
  NIM_RERANK_MODEL: string;
  NIM_CLUSTER_LABEL_MODEL: string;
  CORPUS_VERSION: string;

  // Bindings
  CORPUS_INDEX: VectorizeIndex;
  CACHE: KVNamespace;
  ARTIFACTS: R2Bucket;
  EMBED_QUEUE: Queue;
  CHAT_RATE_LIMIT: RateLimit;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route table — kept inline at this scaffolding stage; will move to a
    // dedicated router (itty-router or hono) once endpoints land.
    if (path === '/' || path === '/healthz') {
      return Response.json({
        service: 'synchronocities-ai',
        status: 'ok',
        corpus_version: env.CORPUS_VERSION,
        models: {
          embed: env.NIM_EMBED_MODEL,
          chat: env.NIM_CHAT_MODEL,
          rerank: env.NIM_RERANK_MODEL,
          cluster_label: env.NIM_CLUSTER_LABEL_MODEL,
        },
      });
    }

    // All surface endpoints land here in subsequent tasks (#5–#10).
    return Response.json(
      { error: 'not_implemented', path, note: 'scaffold stage — endpoints land in tasks #5–#10' },
      { status: 501 },
    );
  },

  // Queue consumer for batched embedding jobs (wired in task #5).
  async queue(_batch: MessageBatch<unknown>, _env: Env): Promise<void> {
    // Implemented in task #5 (POST /embed/batch)
  },
};

// Type augmentation for Cloudflare RateLimit binding (not in @cloudflare/workers-types yet)
export interface RateLimit {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
}
