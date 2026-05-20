/**
 * synchronocities-ai — Cloudflare Worker entry point.
 *
 * PHASE A (current): minimal — exposes /models which proxies NIM's catalog
 * so we can pick the embed/chat/rerank trio for the full service.
 *
 * PHASE B (subsequent tasks): adds /search, /related/:slug, /chat (SSE),
 * /embed/batch, /generate/summary, /maps/cluster. Non-linear fan-out via
 * Promise.allSettled. Routing layer maps surface → {model, params, cache_ttl}.
 *
 * Secrets: `wrangler secret put NVIDIA_API_KEY` (one-time, prompted).
 * Local dev: `wrangler dev --remote` reuses the remote secret.
 */

export interface Env {
  // Secret (from `wrangler secret put NVIDIA_API_KEY`)
  NVIDIA_API_KEY: string;

  // Vars (from wrangler.toml [vars])
  NIM_BASE_URL: string;
  NIM_EMBED_MODEL: string;
  NIM_CHAT_MODEL: string;
  NIM_RERANK_MODEL: string;
  NIM_CLUSTER_LABEL_MODEL: string;
  CORPUS_VERSION: string;

  // Bindings
  CACHE: KVNamespace;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' || path === '/healthz') {
      return Response.json(
        {
          service: 'synchronocities-ai',
          phase: 'A',
          status: 'ok',
          corpus_version: env.CORPUS_VERSION,
          models: {
            embed: env.NIM_EMBED_MODEL,
            chat: env.NIM_CHAT_MODEL,
            rerank: env.NIM_RERANK_MODEL,
            cluster_label: env.NIM_CLUSTER_LABEL_MODEL,
          },
        },
        { headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /models — proxy NIM's catalog. The deployed Worker has the
    // NVIDIA_API_KEY via Workers Secrets; the response is the raw NIM JSON
    // so we can categorize models on the orchestrator side.
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/models' && request.method === 'GET') {
      if (!env.NVIDIA_API_KEY) {
        return Response.json(
          { error: 'NVIDIA_API_KEY secret not set on this Worker' },
          { status: 500, headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
        );
      }

      const cacheKey = `nim:models:v1`;
      const cached = await env.CACHE.get(cacheKey);
      if (cached) {
        return new Response(cached, {
          headers: { ...JSON_HEADERS, ...CORS_HEADERS, 'X-Cache': 'HIT' },
        });
      }

      const upstream = await fetch(`${env.NIM_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}`, Accept: 'application/json' },
      });

      const body = await upstream.text();
      if (upstream.ok) {
        await env.CACHE.put(cacheKey, body, { expirationTtl: 3600 });
      }

      return new Response(body, {
        status: upstream.status,
        headers: { ...JSON_HEADERS, ...CORS_HEADERS, 'X-Cache': 'MISS' },
      });
    }

    // Surface endpoints land here in tasks #5–#10.
    return Response.json(
      { error: 'not_implemented', path, note: 'phase A — only /models is live' },
      { status: 501, headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
    );
  },
};
