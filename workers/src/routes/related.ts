/**
 * GET /related/:slug — related-posts recommendations for a given post.
 *
 * Pipeline:
 *   1. Fetch the post's stored embedding from Vectorize via getByIds
 *   2. Run vector knn with topK = limit + 1 (the post's own vector is the
 *      nearest match, so over-fetch by 1)
 *   3. Filter out the source slug from results
 *   4. Truncate to limit, return ordered by similarity descending
 *   5. Cache the response (24h TTL — related posts only change when
 *      the corpus is reindexed)
 *
 * Path-routed via /related/:slug. The slug must already exist in
 * Vectorize (i.e. /embed/batch has indexed it). Drafts / hidden posts
 * are not indexed and will 404 here.
 *
 * Query params:
 *   limit       (default 5) — how many related posts to return (1-20)
 */

import type { Env } from '../index';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface RelatedPost {
  slug: string;
  title: string;
  excerpt?: string;
  concepts?: string[];
  tags?: string[];
  kosha?: string;
  date?: string;
  similarity: number;
}

interface RelatedResponse {
  slug: string;
  related: RelatedPost[];
  meta: {
    ms: number;
    cache: 'hit' | 'miss';
  };
}

const CACHE_TTL = 60 * 60 * 24; // 24h

export async function handleRelated(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  slug: string,
): Promise<Response> {
  const start = Date.now();
  const url = new URL(request.url);

  if (!slug || /[^a-z0-9-]/.test(slug)) {
    return Response.json(
      { error: 'invalid slug' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const limit = clamp(parseInt(url.searchParams.get('limit') ?? '5', 10), 1, 20);

  // ─── 1. Endpoint cache short-circuit ────────────────────────────────────
  const cacheKey = `related:v${env.CORPUS_VERSION}:${slug}:${limit}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached) {
    const body = JSON.parse(cached) as RelatedResponse;
    body.meta.cache = 'hit';
    body.meta.ms = Date.now() - start;
    return Response.json(body, { headers: CORS_HEADERS });
  }

  // ─── 2. Fetch the source post's vector ──────────────────────────────────
  const fetched = await env.CORPUS_INDEX.getByIds([slug]);
  if (fetched.length === 0) {
    return Response.json(
      {
        error: 'slug not found in index',
        slug,
        hint: 'post may be draft/hidden or not yet indexed via /embed/batch',
      },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  const sourceVector = fetched[0]?.values;
  if (!sourceVector) {
    return Response.json(
      { error: 'index entry has no vector values', slug },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  // ─── 3. kNN search — over-fetch by 1 since the post's own vector is the
  //        nearest match and will need to be filtered out ─────────────────
  const knn = await env.CORPUS_INDEX.query(sourceVector, {
    topK: limit + 1,
    returnValues: false,
    returnMetadata: 'all',
  });

  const related: RelatedPost[] = knn.matches
    .filter((m) => m.id !== slug)
    .slice(0, limit)
    .map((m) => {
      const md = (m.metadata ?? {}) as Record<string, string>;
      return {
        slug: m.id,
        title: md.title ?? m.id,
        ...(md.excerpt ? { excerpt: md.excerpt } : {}),
        ...(md.concepts ? { concepts: md.concepts.split(',') } : {}),
        ...(md.tags ? { tags: md.tags.split(',') } : {}),
        ...(md.kosha ? { kosha: md.kosha } : {}),
        ...(md.date ? { date: md.date } : {}),
        similarity: round3(m.score),
      };
    });

  const response: RelatedResponse = {
    slug,
    related,
    meta: { ms: Date.now() - start, cache: 'miss' },
  };

  // ─── 4. Cache the response ──────────────────────────────────────────────
  ctx.waitUntil(
    env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: CACHE_TTL }),
  );

  return Response.json(response, { headers: CORS_HEADERS });
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
