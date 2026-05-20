/**
 * POST /chat — streaming RAG with citations.
 *
 * Pipeline (all async, fail-open per stage):
 *   1. Embed user query via embed.query
 *   2. CORPUS_INDEX.query top-10
 *   3. Rerank with chat.rerank → top-5 (best-effort)
 *   4. Build context: title + excerpt per top-5 passage with [n] markers
 *   5. chatStream() the answer with system prompt that:
 *      - Uses the Anatomist voice
 *      - Cites passages by [n]
 *      - Refuses to answer outside the corpus's domain
 *
 * Response: SSE stream
 *   event: citations
 *   data: [{n, slug, title, similarity}, ...]
 *
 *   event: token
 *   data: <text delta>
 *
 *   event: done
 *   data: {ms, sources_count}
 *
 * CORS-enabled. Naive in-isolate rate-limit (10 req/min/IP) — phase B
 * could swap in the Cloudflare native ratelimit binding (already declared
 * in wrangler.toml as commented-out).
 *
 * No cache — each chat is fresh. Telemetry via standard console.log
 * which goes to wrangler tail.
 */

import type { Env } from '../index';
import { chatStream } from '../lib/nim';
import { runSurface, withFailOpen, type RoutingConfig } from '../lib/routing';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface ChatRequest {
  query: string;
  /** Optional history for multi-turn chat. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** How many corpus passages to retrieve for context. Default 5, max 10. */
  k?: number;
}

interface Citation {
  n: number;
  slug: string;
  title: string;
  excerpt?: string;
  similarity: number;
}

const SYSTEM_PROMPT = `You are the synchronocities corpus assistant. Voice: The Anatomist Who Sees Fractals — clinical precision, structural humor, no spiritual platitudes. Direct, declarative, no hedging.

You answer using ONLY the provided passages. Cite passages inline by their number in square brackets like [1] or [2,4]. Multiple citations OK. If the passages don't address the question, say so directly — never fabricate.

AVOID these words: journey, healing, manifesting, vibration, authentic self, optimization, hacks, tribe, community.

Keep answers under 200 words unless the question genuinely requires more depth. Lead with the answer; supporting detail second.`;

export async function handleChat(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(
      { error: 'method_not_allowed' },
      { status: 405, headers: CORS_HEADERS },
    );
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400, headers: CORS_HEADERS });
  }

  const query = body.query?.trim();
  if (!query || query.length > 2000) {
    return Response.json(
      { error: 'query required (1-2000 chars)' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const k = Math.max(1, Math.min(10, body.k ?? 5));
  const config: RoutingConfig = env;

  // ─── 1. Embed query (fail-fast if this breaks) ──────────────────────────
  let queryVec: Float32Array;
  try {
    const embeddings = await runSurface('embed.query', { texts: [query] }, config, { ctx });
    if (!embeddings[0]) throw new Error('no vector');
    queryVec = embeddings[0];
  } catch (err) {
    return Response.json(
      { error: 'embedding failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  // ─── 2. Vector knn — over-fetch for rerank ──────────────────────────────
  const knn = await env.CORPUS_INDEX.query(Array.from(queryVec), {
    topK: Math.max(k, 8),
    returnValues: false,
    returnMetadata: 'all',
  });

  if (knn.matches.length === 0) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: 'no_results_in_corpus' })}\n\n`,
      {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      },
    );
  }

  // ─── 3. Rerank — best effort (fail open to vector order) ────────────────
  const passages = knn.matches.map((m) => {
    const md = (m.metadata ?? {}) as Record<string, string>;
    return md.excerpt ? `${md.title ?? m.id}: ${md.excerpt}` : (md.title ?? m.id);
  });

  const reranked = await withFailOpen(
    runSurface(
      'rerank.default',
      { query, passages, top_n: k },
      config,
      { ctx },
    ),
    knn.matches.slice(0, k).map((m, i) => ({ index: i, score: m.score, passage: passages[i] ?? '' })),
    'chat-rerank',
  );

  // ─── 4. Build citations + context ───────────────────────────────────────
  const citations: Citation[] = reranked.slice(0, k).map((r, i) => {
    const match = knn.matches[r.index];
    if (!match) throw new Error('rerank index out of bounds');
    const md = (match.metadata ?? {}) as Record<string, string>;
    return {
      n: i + 1,
      slug: match.id,
      title: md.title ?? match.id,
      ...(md.excerpt ? { excerpt: md.excerpt } : {}),
      similarity: round3(match.score),
    };
  });

  const contextBlock = citations
    .map((c) => `[${c.n}] ${c.title}\n${c.excerpt ?? '(no excerpt available)'}`)
    .join('\n\n---\n\n');

  // ─── 5. Build chat messages with history + RAG context ──────────────────
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...(body.history ?? []).slice(-6), // last 3 turns max
    {
      role: 'user' as const,
      content: `Question: ${query}\n\nRelevant passages from the corpus:\n\n${contextBlock}\n\nAnswer using the passages, citing them inline by number.`,
    },
  ];

  // ─── 6. Stream the response ─────────────────────────────────────────────
  const streamStart = Date.now();
  let nimStream: ReadableStream<string>;
  try {
    nimStream = await chatStream(env, {
      model: env.NIM_CHAT_MODEL,
      messages,
      max_tokens: 768,
      temperature: 0.4,
      top_p: 0.95,
    });
  } catch (err) {
    return Response.json(
      { error: 'chat stream failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  // Build SSE response: citations first, then stream tokens, then done event.
  // Using ReadableStream.start() so all writes happen after the Response
  // object is constructed (avoids 1101 backpressure-before-consumer issue).
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let tokenCount = 0;
      try {
        // Citations immediately — frontend renders sources before the answer
        controller.enqueue(encoder.encode(formatSSE('citations', citations)));

        const reader = nimStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            tokenCount++;
            controller.enqueue(encoder.encode(formatSSE('token', value)));
          }
        }

        controller.enqueue(
          encoder.encode(
            formatSSE('done', {
              ms: Date.now() - streamStart,
              sources_count: citations.length,
              tokens_streamed: tokenCount,
            }),
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(formatSSE('error', { error: msg })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}

function formatSSE(event: string, data: unknown): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  // SSE: each event has event: and data: lines, terminated by blank line
  // If data contains newlines, prefix each line with "data: "
  const dataLines = payload.split('\n').map((line) => `data: ${line}`).join('\n');
  return `event: ${event}\n${dataLines}\n\n`;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
