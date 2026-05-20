/**
 * Routing layer — surface → {primitive, model, params, cache} map.
 *
 * Each "surface" is a named operation (semantic-search, post-summary,
 * canonical-questions, etc.). The routing layer:
 *
 *   1. Maps each surface to a primitive (embed / chat / rerank), a model
 *      name (from env), and default parameters.
 *   2. Wraps every call with KV cache (read-through; writes are
 *      fire-and-forget via ctx.waitUntil for low-latency responses).
 *   3. Provides fanOut() for non-linear parallel execution with
 *      Promise.allSettled — failing surfaces don't block siblings.
 *   4. Provides withFailOpen() for callers who want a default on error
 *      without conditional branching.
 *
 * Design note: surfaces are ATOMIC primitives (one NIM call each). Composite
 * operations like "embed query → vector search → rerank → chat answer" are
 * the responsibility of the endpoint handlers (tasks #5–#10), which compose
 * these atomic surfaces. Keeping the routing layer atomic keeps caching
 * sensible — composite results can't be cached the same way atomic ones can.
 *
 * Cache key: `${surface}:v${CORPUS_VERSION}:${sha256(input).slice(0,24)}`
 * — bumping CORPUS_VERSION in wrangler.toml invalidates every cached entry.
 */

import {
  embed,
  chat,
  rerank,
  type ChatMessage,
  type RerankResult,
  type RateLimiter,
} from './nim';

// ============================================================================
// CONFIG — what routing.ts needs from env
// ============================================================================

export interface RoutingConfig {
  NIM_BASE_URL: string;
  NVIDIA_API_KEY: string;
  NIM_EMBED_MODEL: string;
  NIM_CHAT_MODEL: string;
  NIM_RERANK_MODEL: string;
  NIM_CLUSTER_LABEL_MODEL: string;
  NIM_SAFETY_MODEL: string;
  CORPUS_VERSION: string;
  CACHE: KVNamespace;
}

// ============================================================================
// SURFACE DECLARATIONS
// ============================================================================

export type SurfaceName =
  | 'embed.query'         // embed a search query (input_type: query)
  | 'embed.passage'       // embed a document for storage (input_type: passage)
  | 'chat.summary'        // generate a post summary
  | 'chat.questions'      // generate canonical questions for a post
  | 'chat.cluster-label'  // label a concept cluster
  | 'chat.rag-answer'     // RAG: generate answer from retrieved context
  | 'chat.safety-check'   // moderate user input (for /chat)
  | 'rerank.default';     // LLM-as-judge rerank

interface BaseSurface {
  primitive: 'embed' | 'chat' | 'rerank';
  /** Which env var holds the model name. Indirection so models can be swapped via wrangler.toml. */
  modelOf: (cfg: RoutingConfig) => string;
  /** Default parameters merged into every call. */
  defaults: Record<string, unknown>;
  /** Cache TTL in seconds. 0 = don't cache. */
  cacheTtlSeconds: number;
}

export const SURFACES: Record<SurfaceName, BaseSurface> = {
  'embed.query': {
    primitive: 'embed',
    modelOf: (c) => c.NIM_EMBED_MODEL,
    defaults: { input_type: 'query', batch_size: 32 },
    cacheTtlSeconds: 3600, // 1h — queries change often
  },
  'embed.passage': {
    primitive: 'embed',
    modelOf: (c) => c.NIM_EMBED_MODEL,
    defaults: { input_type: 'passage', batch_size: 32 },
    cacheTtlSeconds: 60 * 60 * 24 * 30, // 30d — post content is stable
  },
  'chat.summary': {
    primitive: 'chat',
    modelOf: (c) => c.NIM_CHAT_MODEL,
    defaults: { max_tokens: 512, temperature: 0.3, top_p: 0.95 },
    cacheTtlSeconds: 60 * 60 * 24 * 30,
  },
  'chat.questions': {
    primitive: 'chat',
    modelOf: (c) => c.NIM_CHAT_MODEL,
    defaults: { max_tokens: 512, temperature: 0.4, top_p: 0.95 },
    cacheTtlSeconds: 60 * 60 * 24 * 30,
  },
  'chat.cluster-label': {
    primitive: 'chat',
    modelOf: (c) => c.NIM_CLUSTER_LABEL_MODEL,
    defaults: { max_tokens: 32, temperature: 0.2 },
    cacheTtlSeconds: 60 * 60 * 24, // 1d — clusters change with each reindex
  },
  'chat.rag-answer': {
    primitive: 'chat',
    modelOf: (c) => c.NIM_CHAT_MODEL,
    defaults: { max_tokens: 1024, temperature: 0.5, top_p: 0.95 },
    cacheTtlSeconds: 60 * 60, // 1h — RAG answers cached per (query, corpus-version)
  },
  'chat.safety-check': {
    primitive: 'chat',
    modelOf: (c) => c.NIM_SAFETY_MODEL,
    defaults: { max_tokens: 64, temperature: 0 },
    cacheTtlSeconds: 60 * 60,
  },
  'rerank.default': {
    primitive: 'rerank',
    modelOf: (c) => c.NIM_RERANK_MODEL,
    defaults: { passage_truncate: 500 },
    cacheTtlSeconds: 60 * 60,
  },
};

// ============================================================================
// SURFACE INPUTS — per-surface input shape
// ============================================================================

export interface SurfaceInputs {
  'embed.query': { texts: string[] };
  'embed.passage': { texts: string[] };
  'chat.summary': { messages: ChatMessage[] };
  'chat.questions': { messages: ChatMessage[] };
  'chat.cluster-label': { messages: ChatMessage[] };
  'chat.rag-answer': { messages: ChatMessage[] };
  'chat.safety-check': { messages: ChatMessage[] };
  'rerank.default': { query: string; passages: string[]; top_n?: number };
}

export interface SurfaceOutputs {
  'embed.query': Float32Array[];
  'embed.passage': Float32Array[];
  'chat.summary': string;
  'chat.questions': string;
  'chat.cluster-label': string;
  'chat.rag-answer': string;
  'chat.safety-check': string;
  'rerank.default': RerankResult[];
}

// ============================================================================
// CACHE — read-through with sha256-based keys
// ============================================================================

async function cacheKey(surface: SurfaceName, input: unknown, version: string): Promise<string> {
  const canonical = JSON.stringify(input, replacerForFloat32);
  const bytes = new TextEncoder().encode(`${surface}|${canonical}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(hash))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${surface}:v${version}:${hex}`;
}

/** JSON.stringify replacer that converts Float32Array → typed marker for stable hashing. */
function replacerForFloat32(_key: string, value: unknown): unknown {
  if (value instanceof Float32Array) {
    return { __f32: Array.from(value) };
  }
  return value;
}

/**
 * Per-primitive serialization for KV storage.
 * - embed: base64-encoded raw Float32 bytes (compact: 4 bytes/float vs ~10 chars for JSON)
 * - chat:  raw string
 * - rerank: JSON
 */
function serialize(primitive: BaseSurface['primitive'], value: unknown): string {
  if (primitive === 'embed') {
    const vectors = value as Float32Array[];
    const dim = vectors[0]?.length ?? 0;
    const parts = vectors.map((v) => floatArrayToBase64(v));
    return JSON.stringify({ dim, count: vectors.length, parts });
  }
  if (primitive === 'chat') {
    return JSON.stringify({ s: value });
  }
  // rerank
  return JSON.stringify({ r: value });
}

function deserialize(primitive: BaseSurface['primitive'], raw: string): unknown {
  if (primitive === 'embed') {
    const obj = JSON.parse(raw) as { dim: number; count: number; parts: string[] };
    return obj.parts.map((p) => base64ToFloatArray(p, obj.dim));
  }
  if (primitive === 'chat') {
    return (JSON.parse(raw) as { s: string }).s;
  }
  return (JSON.parse(raw) as { r: RerankResult[] }).r;
}

function floatArrayToBase64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  // btoa needs a string of single-byte chars
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64ToFloatArray(b64: string, _dim: number): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

// ============================================================================
// RUN SURFACE
// ============================================================================

export interface RunOptions {
  /** ExecutionContext — if provided, cache writes use ctx.waitUntil (non-blocking). */
  ctx?: { waitUntil(promise: Promise<unknown>): void };
  /** Skip cache lookup. Always hit the model. (Cache writes still happen.) */
  bypassCache?: boolean;
  /** Skip cache write. Useful for one-off requests not worth persisting. */
  noCacheWrite?: boolean;
  /** Pluggable rate limiter. Defaults to the wrapper's per-isolate token bucket. */
  rateLimiter?: RateLimiter;
  /** Abort signal — propagates to the underlying NIM call. */
  signal?: AbortSignal;
}

/**
 * Execute a surface with read-through caching. Throws on NIM failure;
 * callers wanting fail-open should use withFailOpen() or fanOut().
 */
export async function runSurface<S extends SurfaceName>(
  surface: S,
  input: SurfaceInputs[S],
  config: RoutingConfig,
  opts: RunOptions = {},
): Promise<SurfaceOutputs[S]> {
  const surfaceConfig = SURFACES[surface];
  const key = await cacheKey(surface, input, config.CORPUS_VERSION);

  // Cache read
  if (!opts.bypassCache && surfaceConfig.cacheTtlSeconds > 0) {
    const cached = await config.CACHE.get(key);
    if (cached !== null) {
      return deserialize(surfaceConfig.primitive, cached) as SurfaceOutputs[S];
    }
  }

  // Primitive dispatch
  const model = surfaceConfig.modelOf(config);
  const merged = { ...surfaceConfig.defaults, ...input, model };

  let result: unknown;
  if (surfaceConfig.primitive === 'embed') {
    const embedInput = merged as { model: string; texts: string[]; input_type?: 'query' | 'passage'; batch_size?: number };
    result = await embed(config, {
      model: embedInput.model,
      texts: embedInput.texts,
      ...(embedInput.input_type ? { input_type: embedInput.input_type } : {}),
      ...(embedInput.batch_size ? { batch_size: embedInput.batch_size } : {}),
      ...(opts.rateLimiter ? { rateLimiter: opts.rateLimiter } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } else if (surfaceConfig.primitive === 'chat') {
    const chatInput = merged as {
      model: string;
      messages: ChatMessage[];
      max_tokens?: number;
      temperature?: number;
      top_p?: number;
    };
    result = await chat(config, {
      model: chatInput.model,
      messages: chatInput.messages,
      ...(chatInput.max_tokens !== undefined ? { max_tokens: chatInput.max_tokens } : {}),
      ...(chatInput.temperature !== undefined ? { temperature: chatInput.temperature } : {}),
      ...(chatInput.top_p !== undefined ? { top_p: chatInput.top_p } : {}),
      ...(opts.rateLimiter ? { rateLimiter: opts.rateLimiter } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } else {
    // rerank
    const rerankInput = merged as {
      model: string;
      query: string;
      passages: string[];
      passage_truncate?: number;
      top_n?: number;
    };
    result = await rerank(config, {
      model: rerankInput.model,
      query: rerankInput.query,
      passages: rerankInput.passages,
      ...(rerankInput.passage_truncate !== undefined ? { passage_truncate: rerankInput.passage_truncate } : {}),
      ...(rerankInput.top_n !== undefined ? { top_n: rerankInput.top_n } : {}),
      ...(opts.rateLimiter ? { rateLimiter: opts.rateLimiter } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  }

  // Cache write — fire-and-forget if we have a ctx, otherwise inline
  if (!opts.noCacheWrite && surfaceConfig.cacheTtlSeconds > 0) {
    const writePromise = config.CACHE.put(key, serialize(surfaceConfig.primitive, result), {
      expirationTtl: surfaceConfig.cacheTtlSeconds,
    });
    if (opts.ctx) {
      opts.ctx.waitUntil(writePromise);
    } else {
      await writePromise;
    }
  }

  return result as SurfaceOutputs[S];
}

// ============================================================================
// FAIL-OPEN WRAPPER
// ============================================================================

/**
 * Wrap a runSurface call with a fallback value. Logs the error and returns
 * the fallback instead of throwing. Use when a surface failure should
 * degrade gracefully rather than fail the whole request.
 */
export async function withFailOpen<T>(
  promise: Promise<T>,
  fallback: T,
  label = 'surface',
): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    console.error(`[fail-open:${label}]`, err instanceof Error ? err.message : String(err));
    return fallback;
  }
}

// ============================================================================
// FAN-OUT (non-linear parallel execution)
// ============================================================================

export interface SurfaceCall<S extends SurfaceName> {
  surface: S;
  input: SurfaceInputs[S];
  /** Override per-call options (e.g. bypassCache for one specific call). */
  options?: RunOptions;
}

export interface FanOutResult<S extends SurfaceName> {
  surface: S;
  status: 'fulfilled' | 'rejected';
  value?: SurfaceOutputs[S];
  reason?: string;
  ms: number;
}

/**
 * Dispatch multiple surface calls in parallel via Promise.allSettled. Per-call
 * failures don't affect siblings. Each result includes timing for telemetry.
 *
 * Typical pattern (RAG answer endpoint):
 *
 *   const [embedRes, safetyRes] = await fanOut([
 *     { surface: 'embed.query',       input: { texts: [query] } },
 *     { surface: 'chat.safety-check', input: { messages: [...]} },
 *   ], env, { ctx });
 *
 *   if (safetyRes.status === 'fulfilled' && isSafe(safetyRes.value!)) {
 *     // proceed with retrieval using embedRes.value
 *   }
 */
export async function fanOut<C extends ReadonlyArray<SurfaceCall<SurfaceName>>>(
  calls: C,
  config: RoutingConfig,
  opts: RunOptions = {},
): Promise<{ [K in keyof C]: C[K] extends SurfaceCall<infer S> ? FanOutResult<S> : never }> {
  const results = await Promise.allSettled(
    calls.map(async (c) => {
      const start = Date.now();
      try {
        const value = await runSurface(c.surface, c.input, config, { ...opts, ...c.options });
        return { surface: c.surface, status: 'fulfilled' as const, value, ms: Date.now() - start };
      } catch (err) {
        return {
          surface: c.surface,
          status: 'rejected' as const,
          reason: err instanceof Error ? err.message : String(err),
          ms: Date.now() - start,
        };
      }
    }),
  );

  // results from Promise.allSettled where each inner promise itself never rejects
  return results.map((r) => (r as PromiseFulfilledResult<unknown>).value) as never;
}
