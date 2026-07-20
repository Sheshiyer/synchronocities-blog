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
 *   event: refusal
 *   data: {reason: 'content_policy'}   (followed by a polite token + done)
 *
 *   event: done
 *   data: {ms, sources_count}
 *
 * Hardening (ISSUE-02):
 *   • CORS — no longer set here; the fetch wrapper in index.ts applies the
 *     origin allowlist centrally (lib/auth.ts).
 *   • Rate limit — Cloudflare native ratelimit binding (env.CHAT_RATE_LIMIT,
 *     20 req/min/IP) when present; otherwise a naive in-isolate per-IP
 *     fallback (10 req/min). 429 JSON when exceeded.
 *   • Safety check — the user query is fanned out to chat.safety-check
 *     (nemoguard) concurrently with the query embedding, so the verdict
 *     costs no extra latency. Clearly-unsafe → SSE refusal, no stream.
 *     Any error/parse failure → fail OPEN (log and continue).
 *
 * No cache — each chat is fresh. Telemetry via standard console.log
 * which goes to wrangler tail.
 */

import type { Env } from '../index';
import { chatStream } from '../lib/nim';
import { runSurface, withFailOpen, type RoutingConfig } from '../lib/routing';

// Content-Type/method headers only — Access-Control-* is applied centrally
// by applyCors() in index.ts (lib/auth.ts origin allowlist).
const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SSE_HEADERS = {
  ...CORS_HEADERS,
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
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

  // ─── 0. Rate limit ──────────────────────────────────────────────────────
  // Native Cloudflare ratelimit binding when present (20 req/min per key,
  // configured in wrangler.toml); otherwise the in-isolate fallback below.
  // Keyed on the connecting IP; 'anonymous' bucket when the header is absent
  // (shouldn't happen behind Cloudflare).
  const clientIp = request.headers.get('CF-Connecting-IP') ?? 'anonymous';
  if (env.CHAT_RATE_LIMIT) {
    try {
      const { success } = await env.CHAT_RATE_LIMIT.limit({ key: clientIp });
      if (!success) {
        return Response.json(
          { error: 'rate_limited', retry_after_seconds: 60 },
          { status: 429, headers: CORS_HEADERS },
        );
      }
    } catch (err) {
      // Binding failure must not take /chat down — fail open, log loudly.
      console.error('[chat-rate-limit] binding error, failing open:', err instanceof Error ? err.message : String(err));
    }
  } else if (!inIsolateRateLimitAllow(clientIp)) {
    return Response.json(
      { error: 'rate_limited', retry_after_seconds: 60, note: 'in-isolate fallback limiter' },
      { status: 429, headers: CORS_HEADERS },
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

  // ─── 1. Embed query + safety check — dispatched concurrently ────────────
  // Both runSurface calls are started before either is awaited (the fan-out
  // pattern from routing.ts, inlined so each side keeps its own failure
  // posture): embed failure is fatal (502); safety failure/parse failure
  // fails OPEN via withFailOpen (log + continue) — availability over false
  // negatives, matching the rerank stage below. The nemoguard verdict rides
  // along with the embedding call, so the gate adds no wall-clock latency.
  const embedPromise = runSurface('embed.query', { texts: [query] }, config, { ctx });
  // If the safety gate refuses below we return without awaiting embedPromise —
  // suppress its rejection so it doesn't surface as an unhandled rejection.
  void embedPromise.catch(() => {});

  // '' fallback → skip parsing entirely (withFailOpen already logged the error).
  const safetyRaw = await withFailOpen(
    runSurface(
      'chat.safety-check',
      { messages: [{ role: 'user' as const, content: query }] },
      config,
      { ctx },
    ),
    '',
    'chat-safety-check',
  );

  if (safetyRaw) {
    const verdict = parseSafetyVerdict(safetyRaw);
    if (verdict === 'unsafe') {
      console.log('[safety-check] refused query:', query.slice(0, 120));
      return sseRefusal();
    }
    if (verdict === 'unknown') {
      console.warn('[safety-check] unparseable verdict, failing open:', safetyRaw.slice(0, 120));
    }
  }

  let queryVec: Float32Array;
  try {
    const embeddings = await embedPromise;
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

// ============================================================================
// RATE LIMIT — in-isolate fallback (used only when CHAT_RATE_LIMIT binding
// is absent, e.g. `wrangler dev` without unsafe bindings)
// ============================================================================

const FALLBACK_LIMIT = 10; // requests
const FALLBACK_WINDOW_MS = 60_000; // per minute
const isolateHits = new Map<string, { count: number; resetAt: number }>();

/**
 * Fixed-window per-IP limiter. Per-isolate and best-effort: Cloudflare runs
 * many isolates, so the effective distributed limit is N × isolates. It
 * exists to blunt naive abuse in dev/when the native binding isn't deployed,
 * not as a hard guarantee.
 */
export function inIsolateRateLimitAllow(key: string): boolean {
  const now = Date.now();
  // Bound memory: drop everything when the map gets large (all windows are
  // ≤ 1 min old anyway, so a full clear is a soft reset, not a bypass).
  if (isolateHits.size > 10_000) isolateHits.clear();

  const entry = isolateHits.get(key);
  if (!entry || now >= entry.resetAt) {
    isolateHits.set(key, { count: 1, resetAt: now + FALLBACK_WINDOW_MS });
    return true;
  }
  if (entry.count >= FALLBACK_LIMIT) return false;
  entry.count++;
  return true;
}

// ============================================================================
// SAFETY CHECK — nemoguard verdict parsing + refusal
// ============================================================================

export type SafetyVerdict = 'safe' | 'unsafe' | 'unknown';

/**
 * Leniently parse the nemoguard content-safety verdict. The model returns a
 * JSON-ish blob like {"User Safety": "safe", "Agent Safety": "..."} but small
 * models often wrap it in prose or emit broken JSON — same parsing posture
 * as the rerank score parser in nim.ts:
 *   1. Extract a {...} blob, JSON.parse, scan string values for (un)safe.
 *   2. Fall back to a word-boundary regex on the raw text.
 * 'unknown' when nothing parses — callers fail OPEN.
 *
 * Order matters: 'unsafe' is checked before 'safe' because /\bsafe\b/ would
 * also match inside the JSON for unsafe verdicts containing both keys.
 */
export function parseSafetyVerdict(raw: string): SafetyVerdict {
  const text = raw.trim();

  const blob = text.match(/\{[\s\S]*\}/)?.[0];
  if (blob) {
    try {
      const parsed = JSON.parse(blob) as Record<string, unknown>;
      const values = Object.values(parsed).map((v) => String(v).toLowerCase());
      if (values.some((v) => v.includes('unsafe'))) return 'unsafe';
      if (values.some((v) => v.includes('safe'))) return 'safe';
    } catch {
      // fall through to free-text scan
    }
  }

  if (/\bunsafe\b/i.test(text)) return 'unsafe';
  if (/\bsafe\b/i.test(text)) return 'safe';
  return 'unknown';
}

const REFUSAL_TEXT =
  "That's outside what I can help with. This assistant answers questions about the synchronocities corpus — consciousness research, contemplative systems, and the essays on this blog. Rephrase, or ask something within that scope.";

/**
 * Polite refusal as a complete (non-streaming) SSE body: a `refusal` event
 * for programmatic handling, a `token` event so naive frontends that only
 * render tokens still show something, and `done` to close the loop.
 */
function sseRefusal(): Response {
  const body =
    formatSSE('refusal', { reason: 'content_policy' }) +
    formatSSE('token', REFUSAL_TEXT) +
    formatSSE('done', { refused: true, sources_count: 0, tokens_streamed: 0 });
  return new Response(body, { headers: SSE_HEADERS });
}
