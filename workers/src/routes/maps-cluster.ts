/**
 * POST /maps/cluster — concept clustering across the corpus.
 *
 * Pipeline:
 *   1. Page through CORPUS_INDEX to pull every vector + metadata
 *   2. Run k-means clustering (default k=12, configurable) on the vectors
 *   3. For each cluster, sample top-N posts (by proximity to centroid)
 *   4. Use chat.cluster-label to generate a human-readable cluster label
 *      from those samples' titles + concepts (parallel fanOut across clusters)
 *   5. Write the artifact to R2 as JSON, keyed by `clusters-v${ver}.json`
 *   6. Return the artifact URL + summary
 *
 * GET /maps/cluster — returns the last-computed artifact from R2.
 *
 * Cluster artifact shape:
 *   {
 *     generated_at: ISO,
 *     corpus_version: string,
 *     k: number,
 *     clusters: [
 *       { id, label, post_count, post_slugs, top_concepts, centroid_distance_avg }
 *     ]
 *   }
 *
 * Designed for build-time consumption by /maps.astro — fetches the
 * artifact, renders the cluster facet. The clustering is expensive
 * (~30s for 125 posts × 12 clusters × cluster-label generation), so
 * it's run periodically (via cron or manual) rather than per-request.
 */

import type { Env } from '../index';
import { runSurface, fanOut, withFailOpen, type RoutingConfig } from '../lib/routing';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface ClusterEntry {
  id: number;
  label: string;
  post_count: number;
  post_slugs: string[];
  top_concepts: string[];
  centroid_distance_avg: number;
}

interface ClusterArtifact {
  generated_at: string;
  corpus_version: string;
  k: number;
  total_posts: number;
  clusters: ClusterEntry[];
  ms: number;
}

const ARTIFACT_KEY = (version: string) => `clusters-v${version}.json`;

export async function handleMapsCluster(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);

  // GET — return the last-computed artifact
  if (request.method === 'GET') {
    const obj = await env.ARTIFACTS.get(ARTIFACT_KEY(env.CORPUS_VERSION));
    if (!obj) {
      return Response.json(
        { error: 'no artifact yet', hint: 'POST /maps/cluster to compute' },
        { status: 404, headers: CORS_HEADERS },
      );
    }
    const data = await obj.text();
    return new Response(data, {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // POST — recompute clustering
  if (request.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: CORS_HEADERS });
  }

  const start = Date.now();
  const k = parseInt(url.searchParams.get('k') ?? '12', 10);
  if (k < 2 || k > 30) {
    return Response.json(
      { error: 'k must be 2-30' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const config: RoutingConfig = env;

  // ─── 1. Pull every vector + metadata from Vectorize ─────────────────────
  // Vectorize doesn't have a "list all" — we read all post slugs from our KV
  // content-hash store, then getByIds the vectors in chunks.
  // KV list() returns at most 1000 keys per call and silently truncates
  // without a cursor loop, so we paginate until list_complete.
  const prefix = `post-hash:v${env.CORPUS_VERSION}:`;
  const allSlugs: string[] = [];
  let cursor: string | undefined;
  do {
    const page: KVNamespaceListResult<unknown> = await env.CACHE.list({ prefix, cursor });
    for (const key of page.keys) {
      const slug = key.name.replace(prefix, '');
      if (slug) allSlugs.push(slug);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  // Hard ceiling — beyond this the route cannot fit in a Worker:
  //   memory:  1024 dims × 4 B × N floats ≈ 61 MB at N=15k (plus JS array
  //            overhead, ~2-3× that) against the 128 MB isolate limit
  //   subrequests: N/20 getByIds calls + N/1000 KV list pages ≈ 765 at N=15k
  //            against the 1000-subrequest cap
  // At ~28k vectors (vault chunks included) both limits are blown. Use the
  // off-worker script instead — it runs the identical algorithm locally and
  // uploads the same artifact to R2.
  const MAX_IN_WORKER_SLUGS = 15_000;
  if (allSlugs.length > MAX_IN_WORKER_SLUGS) {
    const estMb = Math.round((allSlugs.length * 1024 * 4) / (1024 * 1024));
    return Response.json(
      {
        error: 'corpus_too_large',
        detail:
          `${allSlugs.length} slugs exceed the in-Worker ceiling of ${MAX_IN_WORKER_SLUGS} ` +
          `(~${estMb} MB of raw vectors + overhead vs 128 MB isolate memory; ` +
          `${Math.ceil(allSlugs.length / 20)} getByIds subrequests vs the 1000 cap). ` +
          `Run the off-worker script instead: bun workers/scripts/compute-clusters.ts ` +
          `(uploads clusters-v${env.CORPUS_VERSION}.json to R2 with the identical shape).`,
        slug_count: allSlugs.length,
        ceiling: MAX_IN_WORKER_SLUGS,
      },
      { status: 413, headers: CORS_HEADERS },
    );
  }

  if (allSlugs.length === 0) {
    return Response.json(
      { error: 'no posts found in corpus', hint: 'run /embed/batch first' },
      { status: 412, headers: CORS_HEADERS },
    );
  }

  // Fetch vectors in chunks of 20 (Vectorize getByIds hard cap)
  const VECTORIZE_GETBYIDS_LIMIT = 20;
  const vectorEntries: Array<{ slug: string; vector: number[]; metadata: Record<string, string> }> = [];
  for (let i = 0; i < allSlugs.length; i += VECTORIZE_GETBYIDS_LIMIT) {
    const chunk = allSlugs.slice(i, i + VECTORIZE_GETBYIDS_LIMIT);
    const fetched = await env.CORPUS_INDEX.getByIds(chunk);
    for (const f of fetched) {
      if (f.values) {
        vectorEntries.push({
          slug: f.id,
          vector: Array.from(f.values),
          metadata: (f.metadata ?? {}) as Record<string, string>,
        });
      }
    }
  }

  if (vectorEntries.length < k) {
    return Response.json(
      { error: `need at least ${k} vectors; have ${vectorEntries.length}` },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // ─── 2. k-means clustering ──────────────────────────────────────────────
  const dim = vectorEntries[0]!.vector.length;
  const { centroids, assignments } = kmeans(
    vectorEntries.map((e) => e.vector),
    k,
    dim,
    20, // max iterations
  );

  // ─── 3. Sample top posts per cluster ────────────────────────────────────
  const buckets: Array<typeof vectorEntries> = Array.from({ length: k }, () => []);
  vectorEntries.forEach((entry, i) => {
    const clusterId = assignments[i]!;
    buckets[clusterId]!.push(entry);
  });

  // For each cluster, get top-5 closest to centroid
  const samples = buckets.map((bucket, clusterId) => {
    const centroid = centroids[clusterId]!;
    const withDistance = bucket.map((e) => ({
      ...e,
      distance: euclidean(e.vector, centroid),
    }));
    withDistance.sort((a, b) => a.distance - b.distance);
    const top5 = withDistance.slice(0, 5);
    const avgDistance = withDistance.reduce((s, e) => s + e.distance, 0) / Math.max(1, withDistance.length);

    // Aggregate top concepts across the bucket
    const conceptCounts = new Map<string, number>();
    for (const e of bucket) {
      if (e.metadata.concepts) {
        for (const c of e.metadata.concepts.split(',')) {
          const clean = c.trim();
          if (clean) conceptCounts.set(clean, (conceptCounts.get(clean) ?? 0) + 1);
        }
      }
    }
    const topConcepts = [...conceptCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([c]) => c);

    return {
      clusterId,
      bucket,
      topPosts: top5,
      topConcepts,
      avgDistance,
    };
  });

  // ─── 4. Generate labels in parallel via cluster-label surface ───────────
  type LabelCall = {
    surface: 'chat.cluster-label';
    input: { messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }> };
  };
  const labelCalls: LabelCall[] = samples.map((s) => ({
    surface: 'chat.cluster-label' as const,
    input: {
      messages: [
        {
          role: 'user' as const,
          content: `Generate a 2-4 word label for this cluster of related blog posts. Reply with ONLY the label, no quotes, no commentary.

Top concepts: ${s.topConcepts.join(', ')}

Sample post titles:
${s.topPosts.map((p) => `- ${p.metadata.title ?? p.slug}`).join('\n')}

Label:`,
        },
      ],
    },
  }));

  const labelResults = await fanOut(labelCalls, config, { ctx });

  // ─── 5. Build the artifact ──────────────────────────────────────────────
  const clusters: ClusterEntry[] = samples.map((s, i) => {
    const labelResult = labelResults[i];
    const label =
      labelResult?.status === 'fulfilled' && labelResult.value
        ? cleanLabel(String(labelResult.value))
        : `Cluster ${s.clusterId + 1}`;
    return {
      id: s.clusterId,
      label,
      post_count: s.bucket.length,
      post_slugs: s.bucket.map((e) => e.slug),
      top_concepts: s.topConcepts,
      centroid_distance_avg: round3(s.avgDistance),
    };
  });

  const artifact: ClusterArtifact = {
    generated_at: new Date().toISOString(),
    corpus_version: env.CORPUS_VERSION,
    k,
    total_posts: vectorEntries.length,
    clusters: clusters.sort((a, b) => b.post_count - a.post_count),
    ms: Date.now() - start,
  };

  // ─── 6. Write to R2 ─────────────────────────────────────────────────────
  await env.ARTIFACTS.put(ARTIFACT_KEY(env.CORPUS_VERSION), JSON.stringify(artifact, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });

  return Response.json(artifact, { headers: CORS_HEADERS });
}

function cleanLabel(s: string): string {
  return s.trim().replace(/^["']|["']$/g, '').replace(/[.!?]+$/, '').slice(0, 60);
}

// ============================================================================
// K-means — minimal implementation. Cosine-distance variant (vectors are
// already L2-normalized by the embedding model, so euclidean ≈ cosine here).
// ============================================================================

function kmeans(
  vectors: number[][],
  k: number,
  dim: number,
  maxIter: number,
): { centroids: number[][]; assignments: number[] } {
  const n = vectors.length;

  // k-means++ init: pick first centroid randomly, then weight subsequent
  // picks by squared distance to nearest existing centroid.
  const centroids: number[][] = [];
  centroids.push([...vectors[Math.floor(Math.random() * n)]!]);
  while (centroids.length < k) {
    const distances = vectors.map((v) => {
      const minDist = Math.min(...centroids.map((c) => squaredEuclidean(v, c)));
      return minDist;
    });
    const total = distances.reduce((s, d) => s + d, 0);
    let target = Math.random() * total;
    let chosen = 0;
    for (let i = 0; i < n; i++) {
      target -= distances[i]!;
      if (target <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push([...vectors[chosen]!]);
  }

  const assignments = new Array<number>(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;

    // Assign each point to nearest centroid
    for (let i = 0; i < n; i++) {
      let bestDist = Infinity;
      let bestK = 0;
      for (let j = 0; j < k; j++) {
        const d = squaredEuclidean(vectors[i]!, centroids[j]!);
        if (d < bestDist) {
          bestDist = d;
          bestK = j;
        }
      }
      if (assignments[i] !== bestK) {
        assignments[i] = bestK;
        changed = true;
      }
    }

    if (!changed) break;

    // Recompute centroids
    const sums = Array.from({ length: k }, () => new Array(dim).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const a = assignments[i]!;
      counts[a]++;
      const sumRow = sums[a]!;
      const vec = vectors[i]!;
      for (let d = 0; d < dim; d++) sumRow[d] += vec[d]!;
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        const sumRow = sums[j]!;
        centroids[j] = sumRow.map((s) => s / counts[j]);
      }
    }
  }

  return { centroids, assignments };
}

function squaredEuclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return sum;
}

function euclidean(a: number[], b: number[]): number {
  return Math.sqrt(squaredEuclidean(a, b));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
