/**
 * POST /embed/batch — corpus indexing endpoint.
 *
 * Input: { posts: PostMetadata[], force?, concurrency? }
 * Output: { total, embedded, skipped_unchanged, skipped_draft, errors, ms }
 *
 * Behavior:
 *   1. For each post, check KV for the previously-indexed contentHash.
 *      If it matches and !force, skip (idempotent).
 *   2. Otherwise, build embedText (title + excerpt + body[:4000]) and
 *      send to NIM via the routing layer's embed.passage surface.
 *   3. Upsert {id: slug, values: vector, metadata: postMetadata} to
 *      Vectorize. Vectorize accepts up to 1000 vectors per upsert call;
 *      we batch internally if posts.length > 1000 (won't happen at 125).
 *   4. Update the KV hash so subsequent calls are no-ops.
 *
 * Non-linear: embeddings dispatched in parallel up to `concurrency` at a
 * time (default 4). Upserts happen in one Vectorize call at the end.
 *
 * Auth: TODO — currently open. Add bearer-token check before exposing
 * publicly. For now relies on the workers.dev URL being non-discoverable.
 */

import type { Env } from '../index';
import { runSurface, type RoutingConfig } from '../lib/routing';
import {
  type IndexBatchRequest,
  type IndexBatchResponse,
  buildEmbedText,
  buildVectorMetadata,
  postHashCacheKey,
} from '../lib/posts';

export async function handleEmbedBatch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const start = Date.now();

  if (request.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }

  let body: IndexBatchRequest;
  try {
    body = (await request.json()) as IndexBatchRequest;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!Array.isArray(body.posts) || body.posts.length === 0) {
    return Response.json({ error: 'no posts provided' }, { status: 400 });
  }

  const concurrency = Math.max(1, Math.min(16, body.concurrency ?? 4));
  const force = !!body.force;
  const config: RoutingConfig = env;

  const response: IndexBatchResponse = {
    total: body.posts.length,
    embedded: 0,
    skipped_unchanged: 0,
    skipped_draft: 0,
    errors: [],
    ms: 0,
  };

  // Filter draft/hidden — they shouldn't be in the search index
  const indexable = body.posts.filter((p) => {
    if (p.draft || p.hidden) {
      response.skipped_draft++;
      return false;
    }
    return true;
  });

  // Check which posts actually need re-embedding (idempotent)
  const needsEmbedding: typeof indexable = [];
  if (force) {
    needsEmbedding.push(...indexable);
  } else {
    await Promise.all(
      indexable.map(async (post) => {
        const key = postHashCacheKey(post.slug, env.CORPUS_VERSION);
        const storedHash = await env.CACHE.get(key);
        if (storedHash === post.contentHash) {
          response.skipped_unchanged++;
        } else {
          needsEmbedding.push(post);
        }
      }),
    );
  }

  if (needsEmbedding.length === 0) {
    response.ms = Date.now() - start;
    return Response.json(response);
  }

  // Embed in concurrency-limited batches
  type EmbeddedPost = { post: (typeof needsEmbedding)[number]; vector: Float32Array };
  const embedded: EmbeddedPost[] = [];

  for (let i = 0; i < needsEmbedding.length; i += concurrency) {
    const batch = needsEmbedding.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (post) => {
        // Retry-with-halving: NIM caps input at 512 tokens for nv-embedqa-e5-v5,
        // but token density varies wildly with content (Sanskrit transliteration,
        // AIPRM exports, em-dashes can reach >1 token/char). A pure char-cap
        // doesn't work for every case. When NIM returns 400 with the token-cap
        // error, halve the body and retry. Up to 3 halvings (600 → 300 → 150
        // → 75 chars) — at 75 chars even pathological content fits.
        let text = buildEmbedText(post);
        let vectors: Float32Array[] | null = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            vectors = await runSurface(
              'embed.passage',
              { texts: [text] },
              config,
              { ctx, bypassCache: true }, // we manage idempotency via content hash
            );
            break;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const oversize = /Input length .* exceeds maximum allowed token size/.test(msg);
            if (!oversize || attempt === 3 || text.length < 100) {
              throw err;
            }
            // Halve the text by truncating the body portion. We keep the
            // title prefix (line 1) and excerpt (line 2 if present) and
            // halve the remaining body so the most-load-bearing context
            // (title + excerpt) is preserved across retries.
            const lines = text.split('\n\n');
            const head = lines.slice(0, Math.min(2, lines.length - 1)).join('\n\n');
            const tail = lines[lines.length - 1] ?? '';
            text = `${head}\n\n${tail.slice(0, Math.floor(tail.length / 2))}`.trim();
          }
        }
        const vec = vectors?.[0];
        if (!vec) throw new Error('no vector returned');
        return { post, vector: vec };
      }),
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j]!;
      const post = batch[j]!;
      if (r.status === 'fulfilled') {
        embedded.push(r.value);
      } else {
        response.errors.push({
          slug: post.slug,
          reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }
  }

  // Upsert to Vectorize — single call (Vectorize supports up to 1000 vectors per upsert)
  if (embedded.length > 0) {
    try {
      await env.CORPUS_INDEX.upsert(
        embedded.map(({ post, vector }) => ({
          id: post.slug,
          values: Array.from(vector),
          metadata: buildVectorMetadata(post),
        })),
      );
      response.embedded = embedded.length;

      // Update content hashes in KV (fire-and-forget — non-blocking)
      ctx.waitUntil(
        Promise.all(
          embedded.map(({ post }) =>
            env.CACHE.put(
              postHashCacheKey(post.slug, env.CORPUS_VERSION),
              post.contentHash,
              { expirationTtl: 60 * 60 * 24 * 365 }, // 1 year — content hashes are long-lived
            ),
          ),
        ),
      );
    } catch (err) {
      // Vectorize upsert failed — record all as errors
      const msg = err instanceof Error ? err.message : String(err);
      for (const { post } of embedded) {
        response.errors.push({ slug: post.slug, reason: `vectorize_upsert: ${msg}` });
      }
    }
  }

  response.ms = Date.now() - start;
  return Response.json(response);
}
