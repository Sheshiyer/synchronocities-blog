/**
 * synchronocities-ai client — tiny wrapper for the Cloudflare Worker
 * at https://synchronocities-ai.sheshnarayan-iyer.workers.dev.
 *
 * Used both at build time (Astro pages calling getRelatedPosts) and at
 * runtime (React components calling search and chat).
 *
 * Endpoints called:
 *   GET  /search?q=...&limit=...&rerank=...&threshold=...
 *   GET  /related/:slug?limit=...
 *   POST /chat  → SSE stream
 *   GET  /maps/cluster  → R2-stored clustering artifact
 *
 * Override the base URL by setting PUBLIC_AI_BASE_URL in your env
 * (Astro exposes PUBLIC_* vars to the client and the build).
 */

const DEFAULT_BASE =
  (import.meta.env?.PUBLIC_AI_BASE_URL as string | undefined) ??
  'https://synchronocities-ai.sheshnarayan-iyer.workers.dev';

export interface SearchResult {
  slug: string;
  title: string;
  excerpt?: string;
  concepts?: string[];
  tags?: string[];
  kosha?: string;
  date?: string;
  vector_score: number;
  rerank_score?: number;
  final_score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  meta: { total_candidates: number; reranked: boolean; ms: number; cache: 'hit' | 'miss' };
}

export interface RelatedPost {
  slug: string;
  title: string;
  excerpt?: string;
  concepts?: string[];
  tags?: string[];
  kosha?: string;
  date?: string;
  similarity: number;
}

export interface RelatedResponse {
  slug: string;
  related: RelatedPost[];
  meta: { ms: number; cache: 'hit' | 'miss' };
}

export interface ClusterEntry {
  id: number;
  label: string;
  post_count: number;
  post_slugs: string[];
  top_concepts: string[];
  centroid_distance_avg: number;
}

export interface ClusterArtifact {
  generated_at: string;
  corpus_version: string;
  k: number;
  total_posts: number;
  clusters: ClusterEntry[];
  ms: number;
}

export interface ChatCitation {
  n: number;
  slug: string;
  title: string;
  excerpt?: string;
  similarity: number;
}

/**
 * Server-side semantic search. Safe to call at build time from Astro pages
 * (no client-side cost) or from React components on the client.
 */
export async function search(
  query: string,
  opts: { limit?: number; rerank?: boolean; threshold?: number; baseUrl?: string } = {},
): Promise<SearchResponse> {
  const base = opts.baseUrl ?? DEFAULT_BASE;
  const params = new URLSearchParams({ q: query });
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.rerank !== undefined) params.set('rerank', String(opts.rerank));
  if (opts.threshold !== undefined) params.set('threshold', String(opts.threshold));
  const res = await fetch(`${base}/search?${params}`);
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return res.json() as Promise<SearchResponse>;
}

/**
 * Fetch related posts for a given slug. Designed to be called at build
 * time from Astro post pages — replaces hand-curated related_posts arrays.
 * Returns empty `related: []` if the slug isn't indexed.
 */
export async function getRelatedPosts(
  slug: string,
  opts: { limit?: number; baseUrl?: string } = {},
): Promise<RelatedResponse> {
  const base = opts.baseUrl ?? DEFAULT_BASE;
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  const url = `${base}/related/${slug}${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url);
  if (res.status === 404) {
    return {
      slug,
      related: [],
      meta: { ms: 0, cache: 'miss' },
    };
  }
  if (!res.ok) throw new Error(`related failed: ${res.status}`);
  return res.json() as Promise<RelatedResponse>;
}

/**
 * Fetch the latest clustering artifact (from R2). Designed for build-time
 * consumption by /maps.astro — renders the cluster facet.
 */
export async function getClusters(
  opts: { baseUrl?: string } = {},
): Promise<ClusterArtifact | null> {
  const base = opts.baseUrl ?? DEFAULT_BASE;
  const res = await fetch(`${base}/maps/cluster`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`clusters failed: ${res.status}`);
  return res.json() as Promise<ClusterArtifact>;
}

/**
 * Streaming chat — yields events as they arrive. Used by the <CorpusChat />
 * React component for the RAG widget. Not safe at build time (returns a
 * never-ending stream of events).
 */
export interface ChatStreamOptions {
  query: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  k?: number;
  baseUrl?: string;
  signal?: AbortSignal;
}

export type ChatStreamEvent =
  | { type: 'citations'; data: ChatCitation[] }
  | { type: 'token'; data: string }
  | { type: 'done'; data: { ms: number; sources_count: number; tokens_streamed: number } }
  | { type: 'error'; data: { error: string } };

export async function* streamChat(opts: ChatStreamOptions): AsyncGenerator<ChatStreamEvent> {
  const base = opts.baseUrl ?? DEFAULT_BASE;
  const res = await fetch(`${base}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: opts.query,
      ...(opts.history ? { history: opts.history } : {}),
      ...(opts.k !== undefined ? { k: opts.k } : {}),
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    yield { type: 'error', data: { error: `HTTP ${res.status}` } };
    return;
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;

    // SSE events are separated by blank lines
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const evt of events) {
      const parsed = parseSSEFrame(evt);
      if (parsed) yield parsed;
    }
  }
}

function parseSSEFrame(frame: string): ChatStreamEvent | null {
  const lines = frame.split('\n');
  let event = 'token';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
  }
  if (dataLines.length === 0) return null;

  const dataStr = dataLines.join('\n');

  if (event === 'token') return { type: 'token', data: dataStr };
  try {
    const data = JSON.parse(dataStr);
    if (event === 'citations') return { type: 'citations', data };
    if (event === 'done') return { type: 'done', data };
    if (event === 'error') return { type: 'error', data };
  } catch {
    return null;
  }
  return null;
}
