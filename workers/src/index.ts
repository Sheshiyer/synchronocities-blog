/**
 * synchronocities-ai — Cloudflare Worker entry point.
 *
 * PHASE A (current): minimal — exposes /models (NIM catalog proxy) and
 * /test/wrapper (end-to-end smoke test of the NIM client wrapper).
 *
 * PHASE B (subsequent tasks): adds /search, /related/:slug, /chat (SSE),
 * /embed/batch, /generate/summary, /maps/cluster. Non-linear fan-out via
 * Promise.allSettled. Routing layer maps surface → {model, params, cache_ttl}.
 *
 * Secrets: `wrangler secret put NVIDIA_API_KEY` (one-time, prompted).
 * Local dev: `wrangler dev --remote` reuses the remote secret.
 */

import { embed, chat, rerank } from './lib/nim';

export interface Env {
  // Secret (from `wrangler secret put NVIDIA_API_KEY`)
  NVIDIA_API_KEY: string;

  // Vars (from wrangler.toml [vars])
  NIM_BASE_URL: string;
  NIM_EMBED_MODEL: string;
  NIM_CHAT_MODEL: string;
  NIM_RERANK_MODEL: string;
  NIM_CLUSTER_LABEL_MODEL: string;
  NIM_SAFETY_MODEL: string;
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

/** Wrap an async call to capture its duration in ms alongside the result. */
async function timeIt<T>(
  _label: string,
  fn: () => Promise<T>,
): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

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
            safety: env.NIM_SAFETY_MODEL,
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

    // ─────────────────────────────────────────────────────────────────────
    // GET /test/wrapper — end-to-end smoke test of the NIM client wrapper.
    // Exercises embed(), chat(), and rerank() with fixed inputs. Returns
    // dimensions, response excerpts, and timing per call. Used to verify
    // the trio + wrapper before building the routing layer (task #4).
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/test/wrapper' && request.method === 'GET') {
      if (!env.NVIDIA_API_KEY) {
        return Response.json(
          { error: 'NVIDIA_API_KEY secret not set' },
          { status: 500, headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
        );
      }

      const fixtures = {
        query: 'How does the inner fire relate to the pancha-kosha sheaths?',
        passages: [
          'The cavity precedes the flame. Antar-agni is the substrate. The work is containment.',
          'A Cloudflare Worker runs at the edge in V8 isolates with no persistent state between requests.',
          'Each kosha is a vessel shaped to hold the next inward layer; the matched-cavity principle governs preparation.',
        ],
      };

      const results = await Promise.allSettled([
        timeIt('embed', () =>
          embed(env, {
            model: env.NIM_EMBED_MODEL,
            texts: [fixtures.query, ...fixtures.passages],
            input_type: 'passage',
          }),
        ),
        timeIt('chat', () =>
          chat(env, {
            model: env.NIM_CHAT_MODEL,
            messages: [
              { role: 'system', content: 'Reply in one sentence, under 25 words.' },
              { role: 'user', content: 'What is antar-agni?' },
            ],
            max_tokens: 80,
          }),
        ),
        timeIt('rerank', () =>
          rerank(env, {
            model: env.NIM_RERANK_MODEL,
            query: fixtures.query,
            passages: fixtures.passages,
          }),
        ),
      ]);

      const [embedResult, chatResult, rerankResult] = results;

      return Response.json(
        {
          embed:
            embedResult.status === 'fulfilled'
              ? {
                  status: 'ok',
                  vectors_returned: embedResult.value.result.length,
                  dimensions: embedResult.value.result[0]?.length,
                  ms: embedResult.value.ms,
                  model: env.NIM_EMBED_MODEL,
                }
              : { status: 'error', error: String(embedResult.reason) },
          chat:
            chatResult.status === 'fulfilled'
              ? {
                  status: 'ok',
                  excerpt: chatResult.value.result.slice(0, 200),
                  ms: chatResult.value.ms,
                  model: env.NIM_CHAT_MODEL,
                }
              : { status: 'error', error: String(chatResult.reason) },
          rerank:
            rerankResult.status === 'fulfilled'
              ? {
                  status: 'ok',
                  ranked: rerankResult.value.result.map((r) => ({
                    index: r.index,
                    score: r.score,
                    passage_excerpt: r.passage.slice(0, 80),
                  })),
                  ms: rerankResult.value.ms,
                  model: env.NIM_RERANK_MODEL,
                }
              : { status: 'error', error: String(rerankResult.reason) },
        },
        { headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /test/probe-one?model=...&kind=embed|chat — tries a single
    // candidate model. Use for sequential probing when bulk probe times out.
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/test/probe-one' && request.method === 'GET') {
      const model = url.searchParams.get('model');
      const kind = url.searchParams.get('kind') ?? 'chat';
      if (!model) {
        return Response.json({ error: 'model param required' }, { status: 400 });
      }
      const start = Date.now();
      try {
        if (kind === 'embed') {
          const out = await embed(env, { model, texts: ['hello world'] });
          return Response.json({
            model, ok: true, dimensions: out[0]?.length, ms: Date.now() - start,
          }, { headers: { ...JSON_HEADERS, ...CORS_HEADERS } });
        }
        const out = await chat(env, {
          model,
          messages: [{ role: 'user', content: 'Reply with the single word: ack' }],
          max_tokens: 16,
          temperature: 0,
        });
        return Response.json({
          model, ok: out.trim().length > 0, excerpt: out.slice(0, 80), ms: Date.now() - start,
        }, { headers: { ...JSON_HEADERS, ...CORS_HEADERS } });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return Response.json({
          model, ok: false, error: msg.slice(0, 250), ms: Date.now() - start,
        }, { headers: { ...JSON_HEADERS, ...CORS_HEADERS } });
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /test/probe?kind=embed|chat — tries multiple candidate models in
    // parallel to find which ones are actually callable on this key (the
    // /v1/models catalog returns more models than the account can invoke).
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/test/probe' && request.method === 'GET') {
      const kind = url.searchParams.get('kind') ?? 'embed';
      const candidates =
        kind === 'embed'
          ? [
              'nvidia/nv-embedqa-mistral-7b-v2',
              'nvidia/nv-embed-v1',
              'nvidia/nv-embedqa-e5-v5',
              'nvidia/llama-3.2-nv-embedqa-1b-v1',
              'nvidia/llama-nemotron-embed-1b-v2',
              'snowflake/arctic-embed-l',
              'baai/bge-m3',
            ]
          : [
              // Small/cheap chat candidates — looking for a cheap-tier model
              'meta/llama-3.2-3b-instruct',
              'meta/llama-3.2-1b-instruct',
              'meta/llama-3.1-8b-instruct',
              'microsoft/phi-4-mini-instruct',
              'google/gemma-2-2b-it',
              'google/gemma-3-4b-it',
              'nvidia/nemotron-mini-4b-instruct',
              'mistralai/mistral-7b-instruct-v0.3',
              'nvidia/mistral-nemo-minitron-8b-8k-instruct',
              'ibm/granite-3.0-8b-instruct',
            ];

      const results = await Promise.all(
        candidates.map(async (model) => {
          const start = Date.now();
          try {
            if (kind === 'embed') {
              const out = await embed(env, { model, texts: ['hello world'] });
              return {
                model,
                ok: true,
                dimensions: out[0]?.length,
                ms: Date.now() - start,
              };
            } else {
              const out = await chat(env, {
                model,
                messages: [{ role: 'user', content: 'Reply with the single word: ack' }],
                max_tokens: 16,
                temperature: 0,
              });
              return {
                model,
                ok: out.trim().length > 0,
                response_excerpt: out.slice(0, 80),
                response_length: out.length,
                ms: Date.now() - start,
              };
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              model,
              ok: false,
              error: msg.slice(0, 200),
              ms: Date.now() - start,
            };
          }
        }),
      );

      return Response.json(
        { kind, results },
        { headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
      );
    }

    // Surface endpoints land here in tasks #5–#10.
    return Response.json(
      { error: 'not_implemented', path, note: 'phase A — /models, /test/wrapper, /test/probe are live' },
      { status: 501, headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
    );
  },
};
