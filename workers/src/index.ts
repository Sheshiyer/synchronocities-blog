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
import { runSurface, fanOut, withFailOpen, type RoutingConfig } from './lib/routing';
import { handleEmbedBatch } from './routes/embed-batch';
import { handleSearch } from './routes/search';
import { handleRelated } from './routes/related';
import { handleGenerateSummary } from './routes/generate-summary';
import { handleChat } from './routes/chat';
import { handleMapsCluster } from './routes/maps-cluster';
import { handleExpand, handleExpandSection } from './routes/expand';
import { retrieveNeighbors } from './lib/retrieve';

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
  CORPUS_INDEX: VectorizeIndex;
  ARTIFACTS: R2Bucket;
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
    // POST /test/eval-embed — diagnostic: embed a batch of texts with an
    // explicit model + input_type. Returns vectors + dims + ms. Used for
    // offline trio-tuning evals (recall@5 across candidate embed models).
    // Body: { texts: string[], model: string, input_type?: 'query'|'passage' }
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/test/eval-embed' && request.method === 'POST') {
      if (!env.NVIDIA_API_KEY) {
        return Response.json({ error: 'NVIDIA_API_KEY not set' }, { status: 500, headers: { ...JSON_HEADERS, ...CORS_HEADERS } });
      }
      let body: { texts?: string[]; model?: string; input_type?: 'query' | 'passage' };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return Response.json({ error: 'invalid_json' }, { status: 400, headers: { ...JSON_HEADERS, ...CORS_HEADERS } });
      }
      if (!body.texts?.length || !body.model) {
        return Response.json({ error: 'texts and model required' }, { status: 400, headers: { ...JSON_HEADERS, ...CORS_HEADERS } });
      }
      const start = Date.now();
      try {
        const vectors = await embed(env, {
          model: body.model,
          texts: body.texts,
          input_type: body.input_type ?? 'passage',
        });
        return Response.json(
          {
            model: body.model,
            input_type: body.input_type ?? 'passage',
            count: vectors.length,
            dimensions: vectors[0]?.length ?? 0,
            ms: Date.now() - start,
            vectors: vectors.map((v) => Array.from(v)),
          },
          { headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return Response.json(
          { error: 'embed_failed', model: body.model, detail: msg.slice(0, 250), ms: Date.now() - start },
          { status: 502, headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
        );
      }
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
    // GET /test/saturation — returns the corpus saturation map (cached 1h in KV).
    //
    // Cache key is version-scoped: bumping CORPUS_VERSION in wrangler.toml
    // shifts to a new key naturally and old entries expire within 1h. To
    // avoid serving stale data during a corpus-version transition, deploy
    // the new CORPUS_VERSION wrangler.toml and the matching R2 upload as
    // a single atomic operation (don't deploy one without the other).
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/test/saturation' && request.method === 'GET') {
      const cacheKey = `saturation:v${env.CORPUS_VERSION}`;
      const cached = await env.CACHE.get(cacheKey);
      if (cached) {
        return new Response(cached, {
          headers: { ...JSON_HEADERS, ...CORS_HEADERS, 'X-Cache': 'HIT' },
        });
      }
      const r2Object = await env.ARTIFACTS.get(`saturation/v${env.CORPUS_VERSION}.json`);
      if (!r2Object) {
        return Response.json(
          { error: 'saturation map not found in R2; run compute-saturation.ts --upload' },
          { status: 404, headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
        );
      }
      const body = await r2Object.text();
      await env.CACHE.put(cacheKey, body, { expirationTtl: 3600 });
      return new Response(body, {
        headers: { ...JSON_HEADERS, ...CORS_HEADERS, 'X-Cache': 'MISS' },
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST /test/retrieve — per-section retrieval grounding for /expand/v2.
    // Body: { section_text, exclude_slug }
    // Response: { neighbors: Neighbor[] }
    // Pipeline: embed(section) → Vectorize.query(filter self) → rerank → top-3.
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/test/retrieve' && request.method === 'POST') {
      let body: { section_text?: string; exclude_slug?: string };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return Response.json(
          { error: 'invalid_json' },
          { status: 400, headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
        );
      }
      if (!body.section_text || !body.exclude_slug) {
        return Response.json(
          { error: 'section_text and exclude_slug required' },
          { status: 400, headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
        );
      }
      try {
        const neighbors = await retrieveNeighbors(env, body.section_text, body.exclude_slug);
        return Response.json(
          { neighbors },
          { headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
        );
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : String(err) },
          { status: 500, headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
        );
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

    // ─────────────────────────────────────────────────────────────────────
    // POST /embed/batch — corpus indexing endpoint. Reads request body of
    // {posts: PostMetadata[]}, embeds each via NIM, upserts to Vectorize.
    // Idempotent — skips posts whose contentHash matches the last index.
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/embed/batch' && request.method === 'POST') {
      return handleEmbedBatch(request, env, _ctx);
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /search?q=... — semantic search across the 125-post corpus.
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/search' && request.method === 'GET') {
      return handleSearch(request, env, _ctx);
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /related/:slug — related-posts recommendations.
    // Fetches the post's stored vector, runs kNN excluding self, returns
    // top-N most similar posts.
    // ─────────────────────────────────────────────────────────────────────
    if (path.startsWith('/related/') && request.method === 'GET') {
      const slug = path.slice('/related/'.length);
      return handleRelated(request, env, _ctx, slug);
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST /generate/summary — auto-generate llm.summary + canonical_questions
    // for any post. Returns YAML-formatted frontmatter fragment ready to paste.
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/generate/summary' && request.method === 'POST') {
      return handleGenerateSummary(request, env, _ctx);
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST /chat — streaming RAG (SSE) with citations.
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/chat' && request.method === 'POST') {
      return handleChat(request, env, _ctx);
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET/POST /maps/cluster — concept clustering across the corpus.
    // POST: recompute (~30s). GET: return last-computed artifact from R2.
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/maps/cluster' && (request.method === 'GET' || request.method === 'POST')) {
      return handleMapsCluster(request, env, _ctx);
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST /expand — expand a post body to ~4x via the 70B chat model.
    // Splits on ## headers, expands each section in parallel, stitches.
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/expand' && request.method === 'POST') {
      return handleExpand(request, env, _ctx);
    }
    if (path === '/expand/section' && request.method === 'POST') {
      return handleExpandSection(request, env, _ctx);
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /vectorize/info — returns the current Vectorize index stats.
    // Useful for verifying upserts landed.
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/vectorize/info' && request.method === 'GET') {
      try {
        const info = await env.CORPUS_INDEX.describe();
        return Response.json(info, { headers: { ...JSON_HEADERS, ...CORS_HEADERS } });
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : String(err) },
          { status: 500, headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /test/routing — exercises the routing layer: cache miss + hit,
    // fan-out fan-out across three surfaces in parallel, and fail-open
    // for a deliberately bad input.
    // ─────────────────────────────────────────────────────────────────────
    if (path === '/test/routing' && request.method === 'GET') {
      if (!env.NVIDIA_API_KEY) {
        return Response.json({ error: 'NVIDIA_API_KEY not set' }, { status: 500 });
      }

      const config: RoutingConfig = env;

      // 1. First call → cache MISS (will hit NIM)
      const t1 = Date.now();
      const first = await runSurface(
        'embed.query',
        { texts: ['inner fire of consciousness'] },
        config,
        { ctx: _ctx },
      );
      const firstMs = Date.now() - t1;

      // 2. Second identical call → cache HIT (fast, no NIM)
      const t2 = Date.now();
      const second = await runSurface(
        'embed.query',
        { texts: ['inner fire of consciousness'] },
        config,
        { ctx: _ctx },
      );
      const secondMs = Date.now() - t2;

      // 3. Fan-out — three surfaces in parallel
      const fanOutResults = await fanOut(
        [
          {
            surface: 'embed.query' as const,
            input: { texts: ['matched-cavity principle'] },
          },
          {
            surface: 'chat.summary' as const,
            input: {
              messages: [
                { role: 'system', content: 'Reply in one sentence under 20 words.' },
                { role: 'user', content: 'What is the pancha-kosha doctrine?' },
              ],
            },
          },
          {
            surface: 'rerank.default' as const,
            input: {
              query: 'consciousness as substrate',
              passages: [
                'Awareness is the field within which preparation happens.',
                'A Worker runs at the edge with no persistent state between requests.',
                'The fire is the substrate from the beginning; the cavity holds it.',
              ],
            },
          },
        ],
        config,
        { ctx: _ctx },
      );

      // 4. Fail-open — feed an invalid model via direct call
      const failOpenDemo = await withFailOpen(
        chat(env, {
          model: 'nonexistent/fake-model-1234',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 4,
        }),
        '(fell open to default — model failure swallowed)',
        'fail-open-demo',
      );

      return Response.json(
        {
          cache_miss: {
            dims: first[0]?.length,
            count: first.length,
            ms: firstMs,
          },
          cache_hit: {
            dims: second[0]?.length,
            count: second.length,
            ms: secondMs,
            speedup: firstMs > 0 ? +(firstMs / Math.max(secondMs, 1)).toFixed(1) : null,
          },
          fan_out: fanOutResults.map((r) => ({
            surface: r.surface,
            status: r.status,
            ms: r.ms,
            ...(r.status === 'fulfilled'
              ? {
                  preview:
                    Array.isArray(r.value) && r.value[0] instanceof Float32Array
                      ? `Float32Array[${r.value.length}] × ${(r.value[0] as Float32Array).length}d`
                      : typeof r.value === 'string'
                      ? (r.value as string).slice(0, 100)
                      : JSON.stringify(r.value).slice(0, 120),
                }
              : { reason: r.reason }),
          })),
          fail_open: { result: failOpenDemo },
        },
        { headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
      );
    }

    // Surface endpoints land here in tasks #5–#10.
    return Response.json(
      {
        error: 'not_implemented',
        path,
        note: 'phase A — /models, /test/wrapper, /test/probe, /test/routing are live',
      },
      { status: 501, headers: { ...JSON_HEADERS, ...CORS_HEADERS } },
    );
  },
};
