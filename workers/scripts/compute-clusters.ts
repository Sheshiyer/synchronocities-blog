#!/usr/bin/env bun
/**
 * compute-clusters.ts — off-worker concept clustering for /maps/cluster.
 *
 * The in-Worker route (src/routes/maps-cluster.ts) caps out around 15k
 * vectors: 28k × 1024-d Float32s ≈ 114 MB against the 128 MB isolate
 * limit, and 28k/20 ≈ 1,415 getByIds calls against the 1,000-subrequest
 * ceiling. This script runs the SAME algorithm on a desktop (bun) and
 * uploads a byte-compatible artifact to R2, so GET /maps/cluster and
 * src/lib/aiClient.ts getClusters() see no difference.
 *
 * Pipeline (mirrors maps-cluster.ts exactly):
 *   1. Page ALL `post-hash:v<ver>:*` slugs from KV via the Cloudflare REST
 *      API (cursor pagination — the route now does this too, but stays
 *      guarded to corpora that fit in an isolate).
 *   2. Fetch vectors via the Vectorize REST get_by_ids endpoint in chunks
 *      of 20 (the binding's getByIds hard cap; REST mirrors it).
 *   3. k-means++ (SEEDED — deterministic across runs) → 20 Lloyd iterations,
 *      euclidean on the (cosine-normalized) vectors.
 *   4. Top-5 nearest-to-centroid samples per cluster, top concepts.
 *   5. Labels via NVIDIA NIM chat (nemotron-mini-4b-instruct), same prompt
 *      as the route; falls back to `Cluster N` on failure.
 *   6. Upload clusters-v<ver>.json to R2 via wrangler (same key + shape the
 *      route writes).
 *
 * Credentials: sourced from ~/.claude/.env (never printed):
 *   CLOUDFLARE_API_TOKEN   — needs Workers KV Storage:Read + Vectorize:Read
 *   CLOUDFLARE_ACCOUNT_ID
 *   NVIDIA_API_KEY         — for cluster labels (optional; falls back to "Cluster N")
 *
 * Usage:
 *   bun workers/scripts/compute-clusters.ts                  # full corpus, upload
 *   bun workers/scripts/compute-clusters.ts --k=16           # override k (clamped 2-30)
 *   bun workers/scripts/compute-clusters.ts --seed=7         # override k-means seed
 *   bun workers/scripts/compute-clusters.ts --dry-run        # compute + summary, no upload
 *   bun workers/scripts/compute-clusters.ts --limit=200 --dry-run   # smoke test
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const WORKERS_DIR = join(import.meta.dir, '..');
const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
const NIM_BASE_URL = process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
const NIM_CLUSTER_LABEL_MODEL = 'nvidia/nemotron-mini-4b-instruct';
const VECTORIZE_INDEX_NAME = 'synchronocities-corpus';
const GETBYIDS_CHUNK = 20; // Vectorize getByIds hard cap
const FETCH_CONCURRENCY = 8; // parallel get_by_ids chunks (desktop, not an isolate)
const MAX_ITER = 20;

// ─────────────────────────────────────────────────────────────────────────
// Args + env
// ─────────────────────────────────────────────────────────────────────────

interface Args {
  k: number;
  seed: number;
  dryRun: boolean;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const num = (flag: string): number | null => {
    const a = argv.find((x) => x.startsWith(`--${flag}=`));
    if (!a) return null;
    const n = parseInt(a.split('=')[1] ?? '', 10);
    return Number.isFinite(n) ? n : null;
  };
  const k = Math.min(30, Math.max(2, num('k') ?? 12));
  return {
    k,
    seed: num('seed') ?? 42,
    dryRun: argv.includes('--dry-run'),
    limit: num('limit'),
  };
}

/** Source ~/.claude/.env into process.env (existing vars win). Never prints values. */
function loadEnvFile(): void {
  const path = join(homedir(), '.claude', '.env');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return; // file absent — rely on ambient env
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

/** Read CORPUS_VERSION from workers/wrangler.toml so the R2 key matches the Worker. */
function readCorpusVersionFromWrangler(): string {
  const toml = readFileSync(join(WORKERS_DIR, 'wrangler.toml'), 'utf8');
  const m = toml.match(/^CORPUS_VERSION\s*=\s*"([^"]+)"/m);
  if (!m?.[1]) throw new Error('CORPUS_VERSION not found in wrangler.toml');
  return m[1];
}

/** Read the CACHE KV namespace id from wrangler.toml ([[kv_namespaces]] binding). */
function readKvNamespaceIdFromWrangler(): string {
  const toml = readFileSync(join(WORKERS_DIR, 'wrangler.toml'), 'utf8');
  const m = toml.match(/\[\[kv_namespaces\]\][\s\S]*?binding\s*=\s*"CACHE"[\s\S]*?id\s*=\s*"([^"]+)"/);
  if (!m?.[1]) throw new Error('kv_namespaces CACHE id not found in wrangler.toml');
  return m[1];
}

// ─────────────────────────────────────────────────────────────────────────
// Seeded PRNG — mulberry32. The in-Worker route uses Math.random() for
// k-means++ init, which makes every recompute different; a fixed seed makes
// the artifact reproducible (override with --seed=).
// ─────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Cloudflare REST — KV key listing (cursor pagination) + Vectorize get_by_ids
// ─────────────────────────────────────────────────────────────────────────

interface CfEnvelope<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
  result_info?: { count?: number; cursor?: string | null };
}

async function cfFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CF_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json()) as CfEnvelope<T>;
  if (!res.ok || !body.success) {
    const errs = body.errors?.map((e) => `${e.code}: ${e.message}`).join('; ') ?? `HTTP ${res.status}`;
    throw new Error(`Cloudflare API error on ${path.split('?')[0]}: ${errs}`);
  }
  return body.result === undefined ? (body as unknown as T) : body.result;
}

/** Page ALL KV keys matching the prefix via the REST API (1000/page + cursor). */
async function listAllSlugs(
  accountId: string,
  namespaceId: string,
  prefix: string,
  token: string,
): Promise<string[]> {
  const slugs: string[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ prefix, limit: '1000' });
    if (cursor) params.set('cursor', cursor);
    // The envelope's result_info.cursor is what we need, so grab the raw body.
    const res = await fetch(
      `${CF_API_BASE}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = (await res.json()) as CfEnvelope<Array<{ name: string }>>;
    if (!res.ok || !body.success) {
      const errs = body.errors?.map((e) => `${e.code}: ${e.message}`).join('; ') ?? `HTTP ${res.status}`;
      throw new Error(`Cloudflare KV keys list failed: ${errs}`);
    }
    for (const key of body.result ?? []) {
      const slug = key.name.replace(prefix, '');
      if (slug) slugs.push(slug);
    }
    cursor = body.result_info?.cursor ?? null;
    if (slugs.length % 5000 < 1000) {
      console.error(`  … listed ${slugs.length} slugs so far`);
    }
  } while (cursor);
  return slugs;
}

interface VectorEntry {
  slug: string;
  vector: number[];
  metadata: Record<string, string>;
}

/** Fetch vectors in chunks of 20 via Vectorize REST get_by_ids, pooled. */
async function fetchVectors(
  accountId: string,
  indexName: string,
  slugs: string[],
  token: string,
): Promise<VectorEntry[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < slugs.length; i += GETBYIDS_CHUNK) {
    chunks.push(slugs.slice(i, i + GETBYIDS_CHUNK));
  }
  const entries: VectorEntry[] = [];
  let done = 0;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < chunks.length) {
      const chunk = chunks[next++]!;
      const result = await cfFetch<Array<{ id: string; values?: number[]; metadata?: Record<string, string> }>>(
        `/accounts/${accountId}/vectorize/v2/indexes/${indexName}/get_by_ids`,
        token,
        { method: 'POST', body: JSON.stringify({ ids: chunk }) },
      );
      for (const f of result ?? []) {
        if (f.values) {
          entries.push({ slug: f.id, vector: f.values, metadata: f.metadata ?? {} });
        }
      }
      done++;
      if (done % 100 === 0 || done === chunks.length) {
        console.error(`  … fetched ${done}/${chunks.length} vector chunks (${entries.length} vectors)`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, chunks.length) }, worker));
  return entries;
}

// ─────────────────────────────────────────────────────────────────────────
// k-means — same math as maps-cluster.ts (euclidean on normalized vectors),
// but with seeded k-means++ init and incremental min-dist tracking.
// ─────────────────────────────────────────────────────────────────────────

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

function kmeans(
  vectors: number[][],
  k: number,
  dim: number,
  maxIter: number,
  rand: () => number,
): { centroids: number[][]; assignments: number[] } {
  const n = vectors.length;

  // k-means++ init: first centroid seeded-random, subsequent picks weighted
  // by squared distance to the nearest existing centroid. `minDist` tracks
  // D(x)² incrementally — identical selections to the route's naive rescan,
  // at O(n·k) distance computations instead of O(n·k²).
  const centroids: number[][] = [];
  centroids.push([...vectors[Math.floor(rand() * n)]!]);
  const minDist = vectors.map((v) => squaredEuclidean(v, centroids[0]!));
  while (centroids.length < k) {
    const total = minDist.reduce((s, d) => s + d, 0);
    let target = rand() * total;
    let chosen = 0;
    for (let i = 0; i < n; i++) {
      target -= minDist[i]!;
      if (target <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push([...vectors[chosen]!]);
    for (let i = 0; i < n; i++) {
      const d = squaredEuclidean(vectors[i]!, vectors[chosen]!);
      if (d < minDist[i]!) minDist[i] = d;
    }
  }

  const assignments = new Array<number>(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;

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

    if (!changed) {
      console.error(`  … k-means converged after ${iter + 1} iterations`);
      break;
    }

    const sums = Array.from({ length: k }, () => new Array<number>(dim).fill(0));
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      const a = assignments[i]!;
      counts[a]++;
      const sumRow = sums[a]!;
      const vec = vectors[i]!;
      for (let d = 0; d < dim; d++) sumRow[d] += vec[d]!;
    }
    for (let j = 0; j < k; j++) {
      if (counts[j]! > 0) {
        const sumRow = sums[j]!;
        centroids[j] = sumRow.map((s) => s / counts[j]!);
      }
    }
  }

  return { centroids, assignments };
}

// ─────────────────────────────────────────────────────────────────────────
// Labels — same prompt/parse as maps-cluster.ts, direct NIM chat call.
// ─────────────────────────────────────────────────────────────────────────

function cleanLabel(s: string): string {
  return s.trim().replace(/^["']|["']$/g, '').replace(/[.!?]+$/, '').slice(0, 60);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

async function generateLabel(
  topConcepts: string[],
  sampleTitles: string[],
  apiKey: string,
): Promise<string> {
  const prompt = `Generate a 2-4 word label for this cluster of related blog posts. Reply with ONLY the label, no quotes, no commentary.

Top concepts: ${topConcepts.join(', ')}

Sample post titles:
${sampleTitles.map((t) => `- ${t}`).join('\n')}

Label:`;
  const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: NIM_CLUSTER_LABEL_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 32,
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`NIM ${res.status}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('NIM empty content');
  return content;
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile();

  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error(
      'CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required.\n' +
        'Set them in ~/.claude/.env (auto-sourced) or export them before running.\n' +
        'Token needs: Workers KV Storage Read + Vectorize Read on this account.',
    );
  }

  const corpusVersion = process.env.CORPUS_VERSION ?? readCorpusVersionFromWrangler();
  const namespaceId = readKvNamespaceIdFromWrangler();
  const prefix = `post-hash:v${corpusVersion}:`;
  const start = Date.now();

  console.error(`corpus_version=${corpusVersion} k=${args.k} seed=${args.seed} dry_run=${args.dryRun} limit=${args.limit ?? 'none'}`);

  // ─── 1. Slugs ──────────────────────────────────────────────────────────
  console.error('[1/5] Listing KV slugs…');
  let allSlugs = await listAllSlugs(accountId, namespaceId, prefix, token);
  if (allSlugs.length === 0) {
    throw new Error(`no slugs found under ${prefix} — has /embed/batch (or index-vault) run?`);
  }
  if (args.limit !== null && args.limit > 0 && allSlugs.length > args.limit) {
    allSlugs = allSlugs.slice(0, args.limit);
  }
  console.error(`  → ${allSlugs.length} slugs`);

  // ─── 2. Vectors ────────────────────────────────────────────────────────
  console.error('[2/5] Fetching vectors (get_by_ids ×20)…');
  const vectorEntries = await fetchVectors(accountId, VECTORIZE_INDEX_NAME, allSlugs, token);
  console.error(`  → ${vectorEntries.length} vectors`);
  if (vectorEntries.length < args.k) {
    throw new Error(`need at least ${args.k} vectors; have ${vectorEntries.length}`);
  }

  // ─── 3. k-means ────────────────────────────────────────────────────────
  console.error('[3/5] k-means++ clustering…');
  const dim = vectorEntries[0]!.vector.length;
  const rand = mulberry32(args.seed);
  const { centroids, assignments } = kmeans(
    vectorEntries.map((e) => e.vector),
    args.k,
    dim,
    MAX_ITER,
    rand,
  );

  // ─── 4. Samples + concepts (identical to route) ───────────────────────
  console.error('[4/5] Sampling + labeling…');
  const buckets: Array<typeof vectorEntries> = Array.from({ length: args.k }, () => []);
  vectorEntries.forEach((entry, i) => {
    buckets[assignments[i]!]!.push(entry);
  });

  const samples = buckets.map((bucket, clusterId) => {
    const centroid = centroids[clusterId]!;
    const withDistance = bucket.map((e) => ({ ...e, distance: euclidean(e.vector, centroid) }));
    withDistance.sort((a, b) => a.distance - b.distance);
    const top5 = withDistance.slice(0, 5);
    const avgDistance =
      withDistance.reduce((s, e) => s + e.distance, 0) / Math.max(1, withDistance.length);

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

    return { clusterId, bucket, topPosts: top5, topConcepts, avgDistance };
  });

  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const labelResults = await Promise.allSettled(
    samples.map((s) => {
      if (!nvidiaKey) return Promise.reject(new Error('NVIDIA_API_KEY not set'));
      return generateLabel(
        s.topConcepts,
        s.topPosts.map((p) => p.metadata.title ?? p.slug),
        nvidiaKey,
      );
    }),
  );

  // ─── 5. Artifact (byte-compatible shape with the route's output) ──────
  const clusters = samples
    .map((s, i) => {
      const r = labelResults[i];
      const label =
        r?.status === 'fulfilled' && r.value ? cleanLabel(String(r.value)) : `Cluster ${s.clusterId + 1}`;
      return {
        id: s.clusterId,
        label,
        post_count: s.bucket.length,
        post_slugs: s.bucket.map((e) => e.slug),
        top_concepts: s.topConcepts,
        centroid_distance_avg: round3(s.avgDistance),
      };
    })
    .sort((a, b) => b.post_count - a.post_count);

  const artifact = {
    generated_at: new Date().toISOString(),
    corpus_version: corpusVersion,
    k: args.k,
    total_posts: vectorEntries.length,
    clusters,
    ms: Date.now() - start,
  };

  console.error('[5/5] Artifact built:');
  console.error(`  total_posts=${artifact.total_posts} k=${artifact.k} ms=${artifact.ms}`);
  for (const c of artifact.clusters) {
    console.error(`  #${c.id}  ${String(c.post_count).padStart(5)}  ${c.label}  [${c.top_concepts.slice(0, 3).join(', ')}]`);
  }

  if (args.dryRun) {
    console.log(JSON.stringify({ ...artifact, clusters: artifact.clusters.map((c) => ({ ...c, post_slugs: c.post_slugs.slice(0, 5) })) }, null, 2));
    console.error('--dry-run: not uploading.');
    return;
  }

  const outPath = join(WORKERS_DIR, `.clusters-v${corpusVersion}.json`);
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.error(`Wrote ${outPath}`);

  // Upload — same style as compute-saturation.ts. Guard against shell
  // injection (corpusVersion is interpolated into the command).
  if (!/^[\w.-]+$/.test(corpusVersion)) {
    throw new Error(`Invalid CORPUS_VERSION (must match /^[\\w.-]+$/): ${corpusVersion}`);
  }
  const key = `clusters-v${corpusVersion}.json`;
  const { execSync } = await import('node:child_process');
  execSync(
    `wrangler r2 object put synchronocities-artifacts/${key} --file=${outPath} --content-type=application/json --remote`,
    { stdio: 'inherit', cwd: WORKERS_DIR },
  );
  console.error(`Uploaded to r2://synchronocities-artifacts/${key}`);
}

if (import.meta.main) {
  await main();
}
