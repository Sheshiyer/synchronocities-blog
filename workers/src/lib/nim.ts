/**
 * NVIDIA NIM client wrapper.
 *
 * Three primitives covering the entire service surface:
 *   embed(config, opts)  → Float32Array[]           (semantic search, related-posts, RAG, clustering input)
 *   chat(config, opts)   → string                   (summaries, canonical questions, RAG answers, cluster labels)
 *   chatStream(...)      → ReadableStream<string>   (RAG SSE responses)
 *   rerank(config, opts) → RerankResult[]           (LLM-as-judge; catalog has no dedicated rerank model)
 *
 * Design constraints:
 *   • Every function takes an explicit model name — no model is hardcoded.
 *     The routing layer (src/routing.ts, task #4) maps surface → model.
 *   • Decoupled from Cloudflare types: depends only on a NimConfig interface
 *     which the full Worker Env satisfies structurally. Usable from Node scripts.
 *   • OpenAI-compatible request shapes (NIM mirrors OpenAI's API).
 *   • Auto-batches embeddings — NIM accepts arrays but each model has a soft cap;
 *     default 32 to stay safely under any limit while parallelizing batch calls.
 *   • Retries with exponential backoff + jitter for 429 and 5xx. Honors Retry-After.
 *   • Token-bucket rate limiter (pluggable) gates outbound calls. Default is an
 *     in-memory bucket shared per-isolate — good enough for low-traffic surfaces.
 *     Swap in a Cloudflare-ratelimit-backed limiter for distributed correctness.
 *
 * Errors are typed so callers can fail open per surface (Promise.allSettled).
 */

// ============================================================================
// CONFIG — decoupled from Cloudflare Env
// ============================================================================

export interface NimConfig {
  NIM_BASE_URL: string;
  NVIDIA_API_KEY: string;
}

// ============================================================================
// EMBEDDINGS
// ============================================================================

export interface EmbedOptions {
  model: string;
  texts: string[];
  /** 'query' for search queries, 'passage' for documents being indexed. */
  input_type?: 'query' | 'passage';
  /** Max texts per upstream call. Default 32. */
  batch_size?: number;
  rateLimiter?: RateLimiter;
  signal?: AbortSignal;
}

interface EmbedResponse {
  data: Array<{ index: number; embedding: number[] }>;
  model: string;
  usage?: { prompt_tokens: number; total_tokens: number };
}

const DEFAULT_BATCH_SIZE = 32;

/**
 * Embed N texts via the configured embedding model. Returns one Float32Array
 * per input text, in the same order. Batches are dispatched in parallel.
 */
export async function embed(
  config: NimConfig,
  opts: EmbedOptions,
): Promise<Float32Array[]> {
  if (opts.texts.length === 0) return [];

  const batchSize = opts.batch_size ?? DEFAULT_BATCH_SIZE;
  const inputType = opts.input_type ?? 'passage';

  const batches: string[][] = [];
  for (let i = 0; i < opts.texts.length; i += batchSize) {
    batches.push(opts.texts.slice(i, i + batchSize));
  }

  // Non-linear: all batches dispatched simultaneously.
  const batchResults = await Promise.all(
    batches.map(async (batch) => {
      const res = await nimFetch<EmbedResponse>(config, {
        path: '/embeddings',
        body: {
          input: batch,
          model: opts.model,
          input_type: inputType,
          encoding_format: 'float',
        },
        rateLimiter: opts.rateLimiter,
        signal: opts.signal,
      });
      // Re-sort by index in case NIM returns out of order
      const sorted = [...res.data].sort((a, b) => a.index - b.index);
      return sorted.map((d) => new Float32Array(d.embedding));
    }),
  );

  return batchResults.flat();
}

// ============================================================================
// CHAT
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  /** Force JSON output when the model supports response_format. */
  response_format?: { type: 'json_object' };
  rateLimiter?: RateLimiter;
  signal?: AbortSignal;
}

interface ChatResponse {
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * Single-shot chat completion. Returns the assistant message content.
 * For streaming, use chatStream().
 */
export async function chat(config: NimConfig, opts: ChatOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.max_tokens ?? 1024,
    temperature: opts.temperature ?? 0.2,
    top_p: opts.top_p ?? 0.95,
    stream: false,
  };
  if (opts.response_format) body.response_format = opts.response_format;

  const res = await nimFetch<ChatResponse>(config, {
    path: '/chat/completions',
    body,
    rateLimiter: opts.rateLimiter,
    signal: opts.signal,
  });

  return res.choices[0]?.message?.content ?? '';
}

/**
 * Streaming chat. Returns a ReadableStream of content deltas (not full SSE
 * frames — the wrapper parses the SSE protocol and yields plain text chunks).
 */
export async function chatStream(
  config: NimConfig,
  opts: Omit<ChatOptions, 'response_format'>,
): Promise<ReadableStream<string>> {
  const url = `${config.NIM_BASE_URL}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.NVIDIA_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      max_tokens: opts.max_tokens ?? 1024,
      temperature: opts.temperature ?? 0.2,
      top_p: opts.top_p ?? 0.95,
      stream: true,
    }),
    signal: opts.signal ?? null,
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    throw classifyError(res.status, body, 'chatStream');
  }

  return res.body.pipeThrough(new TextDecoderStream()).pipeThrough(sseDeltaTransform());
}

function sseDeltaTransform(): TransformStream<string, string> {
  let buffer = '';
  return new TransformStream({
    transform(chunk, controller) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) controller.enqueue(delta);
        } catch {
          // Skip malformed lines silently — SSE keep-alives, comments, etc.
        }
      }
    },
  });
}

// ============================================================================
// RERANK (LLM-as-judge — no dedicated rerank model in NIM catalog)
// ============================================================================

export interface RerankOptions {
  model: string;
  query: string;
  passages: string[];
  /** Truncate each passage to this many chars before scoring. Default 500. */
  passage_truncate?: number;
  /** Return only top-N after sorting by score. */
  top_n?: number;
  rateLimiter?: RateLimiter;
  signal?: AbortSignal;
}

export interface RerankResult {
  /** Original index in the input `passages` array. */
  index: number;
  /** Relevance score, 0–10. */
  score: number;
  passage: string;
}

const RERANK_PROMPT_TEMPLATE = (query: string, numberedPassages: string, n: number) =>
  `Score each passage's relevance to the query on a 0-10 integer scale. ${n} passages, ${n} scores.

Query: ${query}

Passages:
${numberedPassages}

Output format: comma-separated integers, one per passage, in order. No commentary, no labels, no JSON. Just numbers.

Example output for 3 passages: 8,2,5

Your scores:`;

/**
 * LLM-as-judge reranking. Sends query + numbered passages to a chat model
 * with a structured-output prompt, parses scores, returns passages sorted
 * by score descending. Designed to use a cheap model (nemotron-nano-3-30b-a3b
 * is the default in wrangler.toml) since this runs on every search/RAG call.
 *
 * Failure mode: if scoring fails or returns unparseable output, all passages
 * get equal score (5) — the surface degrades to "no rerank applied" rather
 * than failing the whole request.
 */
export async function rerank(config: NimConfig, opts: RerankOptions): Promise<RerankResult[]> {
  if (opts.passages.length === 0) return [];

  const truncate = opts.passage_truncate ?? 500;
  const numbered = opts.passages
    .map((p, i) => `[${i}] ${p.replace(/\s+/g, ' ').slice(0, truncate)}`)
    .join('\n\n');

  const prompt = RERANK_PROMPT_TEMPLATE(opts.query, numbered, opts.passages.length);

  let scores: number[];
  try {
    const raw = await chat(config, {
      model: opts.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 64 + opts.passages.length * 4,
      temperature: 0,
      rateLimiter: opts.rateLimiter,
      signal: opts.signal,
    });
    scores = parseScores(raw, opts.passages.length);
  } catch {
    // Fail open: equal scores → no reranking applied
    scores = opts.passages.map(() => 5);
  }

  // Normalize length: pad with 0, truncate if over
  while (scores.length < opts.passages.length) scores.push(0);
  scores.length = opts.passages.length;

  const ranked: RerankResult[] = opts.passages.map((passage, index) => ({
    index,
    score: scores[index] ?? 0,
    passage,
  }));

  ranked.sort((a, b) => b.score - a.score);
  return opts.top_n ? ranked.slice(0, opts.top_n) : ranked;
}

/**
 * Parse rerank scores from a model response. Tries multiple strategies since
 * small models often don't honor strict response_format constraints:
 *   1. JSON {"scores": [...]} shape
 *   2. Bare JSON array [n, n, ...]
 *   3. Comma-separated integers (the prompt-requested format)
 *   4. Any sequence of integers anywhere in the text
 *
 * Falls back to equal scores (5) if nothing parses, so the surface degrades
 * to "no rerank applied" rather than throwing.
 */
function parseScores(raw: string, expectedCount: number): number[] {
  const text = raw.trim();

  // Strategy 1+2: JSON object with .scores key, or bare array
  for (const candidate of [text, text.match(/\{[\s\S]*\}/)?.[0], text.match(/\[[\s\S]*?\]/)?.[0]]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      const arr =
        Array.isArray(parsed) ? parsed
        : Array.isArray((parsed as { scores?: unknown }).scores) ? (parsed as { scores: unknown[] }).scores
        : null;
      if (arr) {
        const nums = arr.map((s) => (typeof s === 'number' ? s : Number(s))).filter((n) => Number.isFinite(n));
        if (nums.length >= 1) return normalize(nums, expectedCount);
      }
    } catch {
      // try next strategy
    }
  }

  // Strategy 3+4: any sequence of integers in the text
  const matches = text.match(/-?\d+(?:\.\d+)?/g);
  if (matches && matches.length >= 1) {
    const nums = matches.map(Number).filter((n) => Number.isFinite(n));
    return normalize(nums, expectedCount);
  }

  // Total parse failure
  return new Array(expectedCount).fill(5);
}

function normalize(nums: number[], expectedCount: number): number[] {
  const out = nums.slice(0, expectedCount);
  while (out.length < expectedCount) out.push(0);
  // Clamp to 0-10
  return out.map((n) => Math.max(0, Math.min(10, n)));
}

// ============================================================================
// RATE LIMITER (pluggable)
// ============================================================================

export interface RateLimiter {
  /** Block until a slot is available. */
  acquire(): Promise<void>;
}

/**
 * In-memory token bucket. One instance per isolate. Provides soft per-isolate
 * limiting; for hard cross-isolate limits, pass a Cloudflare-ratelimit-backed
 * implementation instead.
 */
export class InMemoryTokenBucket implements RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number = 20,
    private readonly refillPerSec: number = 10,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil(((1 - this.tokens) / this.refillPerSec) * 1000);
    await sleep(waitMs);
    return this.acquire();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
    this.lastRefill = now;
  }
}

const defaultLimiter = new InMemoryTokenBucket();

// ============================================================================
// CORE FETCH — retries + backoff + jitter, typed errors
// ============================================================================

interface NimFetchOpts {
  path: string;
  body: unknown;
  rateLimiter?: RateLimiter;
  signal?: AbortSignal;
  maxRetries?: number;
}

const DEFAULT_MAX_RETRIES = 3;

async function nimFetch<T>(config: NimConfig, opts: NimFetchOpts): Promise<T> {
  const limiter = opts.rateLimiter ?? defaultLimiter;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const url = `${config.NIM_BASE_URL}${opts.path}`;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await limiter.acquire();

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.NVIDIA_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(opts.body),
        signal: opts.signal ?? null,
      });
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new NimNetworkError(`Fetch failed after ${maxRetries + 1} attempts`, lastError);
    }

    if (res.ok) {
      try {
        return (await res.json()) as T;
      } catch (err) {
        throw new NimNetworkError('Response was not valid JSON', err);
      }
    }

    const body = await res.text().catch(() => '');

    // Auth errors — never retry
    if (res.status === 401 || res.status === 403) {
      throw new NimAuthError(`NIM auth failed (${res.status})`, res.status, body);
    }

    // Rate limit — honor Retry-After if present, else exponential backoff
    if (res.status === 429 && attempt < maxRetries) {
      const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
      await sleep(Math.max(retryAfter, backoffMs(attempt)));
      continue;
    }
    if (res.status === 429) {
      throw new NimRateLimitError(`Rate limited (${maxRetries + 1} attempts)`, 429, body);
    }

    // 5xx — retry
    if (res.status >= 500 && attempt < maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }

    // 4xx (non-429) or final 5xx — surface as model error
    throw new NimModelError(`NIM ${res.status}: ${body.slice(0, 300)}`, res.status, body);
  }

  // Unreachable, but TypeScript narrowing
  throw new NimNetworkError('Exhausted retries without resolution', lastError);
}

function backoffMs(attempt: number): number {
  // 500ms, 1s, 2s, 4s ... with up to 250ms jitter
  return 500 * Math.pow(2, attempt) + Math.random() * 250;
}

function parseRetryAfter(value: string | null): number {
  if (!value) return 0;
  const seconds = parseFloat(value);
  if (!Number.isFinite(seconds)) return 0;
  return seconds * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// ERRORS — typed for fail-open behavior in the routing layer
// ============================================================================

export class NimError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly body?: string) {
    super(message);
    this.name = 'NimError';
  }
}

export class NimAuthError extends NimError {
  override name = 'NimAuthError';
}
export class NimRateLimitError extends NimError {
  override name = 'NimRateLimitError';
}
export class NimModelError extends NimError {
  override name = 'NimModelError';
}
export class NimNetworkError extends NimError {
  override name = 'NimNetworkError';
  constructor(message: string, public override readonly cause?: unknown) {
    super(message, 0);
  }
}

function classifyError(status: number, body: string, surface: string): NimError {
  if (status === 401 || status === 403) return new NimAuthError(`${surface}: auth failed (${status})`, status, body);
  if (status === 429) return new NimRateLimitError(`${surface}: rate limited`, status, body);
  return new NimModelError(`${surface}: NIM ${status}: ${body.slice(0, 200)}`, status, body);
}
