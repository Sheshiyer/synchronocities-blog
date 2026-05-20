/**
 * GET /search — semantic search across the corpus.
 *
 * Pipeline:
 *   1. Embed the query via routing.embed.query surface
 *   2. Vectorize CORPUS_INDEX.query(topK = limit × 2.4) — over-fetch for rerank
 *   3. If rerank=true (default): LLM-as-judge rerank via routing.rerank.default
 *      using title + excerpt as the passage text
 *   4. Truncate to `limit`
 *   5. Cache the final ranked result at the endpoint level (1h TTL)
 *
 * Each composing call goes through its own routing-layer cache, but the
 * top-level cache short-circuits the whole pipeline for repeated queries.
 *
 * Query params:
 *   q          (required) — the search query
 *   limit      (default 5)  — final result count
 *   rerank     (default true) — enable LLM-as-judge refinement
 *   threshold  (default 0)  — minimum vector cosine similarity 0..1
 */

import type { Env } from '../index';
import { runSurface, type RoutingConfig } from '../lib/routing';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface SearchResult {
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

interface SearchResponse {
  query: string;
  results: SearchResult[];
  meta: {
    total_candidates: number;
    reranked: boolean;
    ms: number;
    cache: 'hit' | 'miss';
  };
}

const ENDPOINT_CACHE_TTL = 60 * 60; // 1 hour

export async function handleSearch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const start = Date.now();
  const url = new URL(request.url);

  const q = url.searchParams.get('q')?.trim();
  if (!q) {
    return Response.json(
      { error: 'q parameter required' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const limit = clamp(parseInt(url.searchParams.get('limit') ?? '5', 10), 1, 50);
  const rerank = url.searchParams.get('rerank') !== 'false';
  const threshold = parseFloat(url.searchParams.get('threshold') ?? '0');

  const config: RoutingConfig = env;

  // ─── 1. Endpoint-level cache short-circuit ──────────────────────────────
  const cacheKey = await endpointCacheKey(q, limit, rerank, threshold, env.CORPUS_VERSION);
  const cached = await env.CACHE.get(cacheKey);
  if (cached) {
    const body = JSON.parse(cached) as SearchResponse;
    body.meta.cache = 'hit';
    body.meta.ms = Date.now() - start;
    return Response.json(body, { headers: CORS_HEADERS });
  }

  // ─── 2. Embed the query ─────────────────────────────────────────────────
  const queryEmbeddings = await runSurface(
    'embed.query',
    { texts: [q] },
    config,
    { ctx },
  );
  const queryVector = queryEmbeddings[0];
  if (!queryVector) {
    return Response.json(
      { error: 'embedding failed' },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  // ─── 3. Vector knn ──────────────────────────────────────────────────────
  // Over-fetch when reranking, but cap at 8 — small rerank models lose
  // discrimination with too many candidates and default to "all 10"
  const topK = rerank ? Math.min(8, Math.max(limit, 8)) : limit;
  const knn = await env.CORPUS_INDEX.query(Array.from(queryVector), {
    topK,
    returnValues: false,
    returnMetadata: 'all',
  });

  // Filter by threshold
  const candidates = knn.matches.filter((m) => m.score >= threshold);
  if (candidates.length === 0) {
    return Response.json(
      {
        query: q,
        results: [],
        meta: { total_candidates: 0, reranked: false, ms: Date.now() - start, cache: 'miss' },
      },
      { headers: CORS_HEADERS },
    );
  }

  // ─── 4. Optional rerank refinement ──────────────────────────────────────
  let results: SearchResult[];
  if (rerank && candidates.length > 1) {
    const passages = candidates.map((c) => {
      const md = (c.metadata ?? {}) as Record<string, string>;
      const title = md.title ?? c.id;
      const excerpt = md.excerpt ?? '';
      return excerpt ? `${title}: ${excerpt}` : title;
    });

    const ranked = await runSurface(
      'rerank.default',
      { query: q, passages, top_n: limit },
      config,
      { ctx },
    );

    // rerank returns objects keyed by original passage index; remap to candidates
    results = ranked.map((r) => {
      const candidate = candidates[r.index]!;
      const md = (candidate.metadata ?? {}) as Record<string, string>;
      return buildResult(candidate.id, candidate.score, md, r.score);
    });
  } else {
    // Pure vector ranking
    results = candidates.slice(0, limit).map((c) => {
      const md = (c.metadata ?? {}) as Record<string, string>;
      return buildResult(c.id, c.score, md);
    });
  }

  const response: SearchResponse = {
    query: q,
    results,
    meta: {
      total_candidates: candidates.length,
      reranked: rerank && candidates.length > 1,
      ms: Date.now() - start,
      cache: 'miss',
    },
  };

  // ─── 5. Cache the final response ────────────────────────────────────────
  ctx.waitUntil(
    env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: ENDPOINT_CACHE_TTL }),
  );

  return Response.json(response, { headers: CORS_HEADERS });
}

function buildResult(
  slug: string,
  vectorScore: number,
  md: Record<string, string>,
  rerankScore?: number,
): SearchResult {
  return {
    slug,
    title: md.title ?? slug,
    ...(md.excerpt ? { excerpt: md.excerpt } : {}),
    ...(md.concepts ? { concepts: md.concepts.split(',') } : {}),
    ...(md.tags ? { tags: md.tags.split(',') } : {}),
    ...(md.kosha ? { kosha: md.kosha } : {}),
    ...(md.date ? { date: md.date } : {}),
    vector_score: round3(vectorScore),
    ...(rerankScore !== undefined ? { rerank_score: rerankScore } : {}),
    // Final score: if reranked, use rerank score normalized to 0..1; otherwise vector score
    final_score: rerankScore !== undefined ? round3(rerankScore / 10) : round3(vectorScore),
  };
}

async function endpointCacheKey(
  q: string,
  limit: number,
  rerank: boolean,
  threshold: number,
  version: string,
): Promise<string> {
  const canonical = `q=${q}&limit=${limit}&rerank=${rerank}&threshold=${threshold}`;
  const bytes = new TextEncoder().encode(canonical);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(hash))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `search:v${version}:${hex}`;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
