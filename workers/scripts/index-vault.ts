#!/usr/bin/env bun
/**
 * index-vault.ts — walk the user's wider knowledge base, chunk + tag each
 * document, and POST the chunks to /embed/batch on the deployed Worker
 * (or a local wrangler dev). After this runs, env.CORPUS_INDEX contains
 * vault chunks alongside the 125 blog posts, so retrieveNeighbors() in
 * /expand/v2/section pulls from the full vault Venn diagram instead of
 * just the (self-referential) blog corpus.
 *
 * Source roots (conservative scope, decision pre-baked into Task 13):
 *   ~/Documents/noesis/                                        recurse
 *   /Volumes/madara/2026/twc-vault/02-Areas/                   recurse
 *   /Volumes/madara/2026/twc-vault/03-Resources/               recurse
 *   /Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis/  TOP-LEVEL ONLY
 *
 * Filters: see shouldSkipFile() below.
 *
 * Chunking: H2 boundary split → 1800-char windows w/ 200-char overlap.
 * Each chunk becomes a synthetic "post" POSTed to /embed/batch, which
 * embeds + upserts to Vectorize via the SAME pipeline used by the 125
 * blog posts. The endpoint extends PostMetadata with optional source_type
 * + source_path that round-trip into Vectorize metadata, so downstream
 * retrieval can see the source mix.
 *
 * Slug shape:  vault:<source_type>:<sha1_short(path)>#chunk-<n>
 * The path-hash is stable; re-running the indexer on the same file
 * regenerates the same slug, and the post-hash KV idempotency check
 * detects content edits via the chunk's contentHash.
 *
 * Usage:
 *   bun scripts/index-vault.ts                # walk all roots, full index
 *   bun scripts/index-vault.ts --dry-run      # walk + count, no POSTs
 *   bun scripts/index-vault.ts --limit=100    # cap chunks for smoke test
 *   bun scripts/index-vault.ts --root=noesis  # one root only
 *   bun scripts/index-vault.ts --local        # POST to http://localhost:8787
 *   bun scripts/index-vault.ts --force        # re-embed unchanged chunks too
 *
 * Roots: noesis | areas | resources | projects (top-level only)
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';

// ─────────────────────────────────────────────────────────────────────────
// Public (testable) helpers — exported so index-vault.test.ts can hit them
// without spawning the full walk.
// ─────────────────────────────────────────────────────────────────────────

const CHUNK_MAX_CHARS = 1800;
const CHUNK_OVERLAP = 200;
const MIN_CHUNK_CHARS = 200;
const MAX_FILE_BYTES = 200 * 1024; // 200 KB
const IMAGE_EMBED_RE = /!\[[^\]]*\]\([^)]*\)/g;
const IMAGE_HEAVY_RATIO = 0.8;

/** Strip YAML frontmatter delimited by `---` markers. Returns body only. */
export function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return raw;
  return (m[2] ?? '').trimStart();
}

/**
 * Heuristic — is the body mostly image-embed syntax with little prose?
 * Returns true when >80% of non-whitespace bytes are inside `![...](...)`.
 */
export function isImageHeavy(body: string): boolean {
  const nonWs = body.replace(/\s+/g, '');
  if (nonWs.length === 0) return false;
  let imgBytes = 0;
  for (const m of body.matchAll(IMAGE_EMBED_RE)) {
    imgBytes += m[0].replace(/\s+/g, '').length;
  }
  return imgBytes / nonWs.length > IMAGE_HEAVY_RATIO;
}

export interface FileStats {
  size: number;
}

export interface SkipDecision {
  skip: boolean;
  reason?: 'too-big' | 'too-small' | 'blacklist' | 'image-heavy';
}

/**
 * Apply all the Task 13 filter rules. Returns {skip:true, reason} on the
 * first match so callers can tally rejection reasons.
 */
export function shouldSkipFile(
  path: string,
  stats: FileStats,
  body: string,
): SkipDecision {
  if (stats.size > MAX_FILE_BYTES) return { skip: true, reason: 'too-big' };

  // Path-based blacklist (case-insensitive on the few patterns where the
  // user has noted casing variants in the wild)
  const lower = path.toLowerCase();
  if (
    /\.bak/.test(path) ||
    /-export-/.test(path) ||
    lower.includes(`${sep}_inbox${sep}`) ||
    lower.includes(`${sep}_nightly-builds${sep}`) ||
    lower.includes(`${sep}zero-one${sep}`)
  ) {
    return { skip: true, reason: 'blacklist' };
  }

  const stripped = stripFrontmatter(body).trim();
  if (stripped.length < MIN_CHUNK_CHARS) return { skip: true, reason: 'too-small' };

  if (isImageHeavy(stripped)) return { skip: true, reason: 'image-heavy' };

  return { skip: false };
}

/**
 * Canonical, deterministic slug shape for a vault chunk. Same inputs →
 * byte-identical slug. The path-hash is short (12 hex chars) so the slug
 * stays under Vectorize's id-length limit comfortably.
 */
export function buildVaultSlug(
  sourceType: string,
  sourcePath: string,
  chunkIdx: number,
): string {
  const pathHash = createHash('sha1').update(sourcePath).digest('hex').slice(0, 12);
  return `vault:${sourceType}:${pathHash}#chunk-${chunkIdx}`;
}

/**
 * Chunk a (frontmatter-stripped, prose-only) body into Vectorize-sized
 * pieces. Strategy:
 *   1. Split on `^## ` H2 boundaries (the heading stays with its section).
 *   2. If a section is ≤ maxChars, emit as one chunk.
 *   3. If > maxChars, sub-split into overlapping windows.
 *   4. Docs with no H2 are windowed straight through.
 *   5. Drop chunks under MIN_CHUNK_CHARS — they're trailing partials.
 */
export function chunkBody(body: string, maxChars: number = CHUNK_MAX_CHARS): string[] {
  const trimmed = body.trim();
  if (trimmed.length === 0) return [];

  // Split on `^## ` (use a sentinel — splitting on the regex with capture
  // groups gets messy; we manually re-attach the heading)
  const lines = trimmed.split('\n');
  const sections: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current.length > 0) sections.push(current.join('\n').trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) sections.push(current.join('\n').trim());

  // If we ended up with one big section AND that section doesn't start with
  // `## ` (i.e. the original doc had no H2), windowed-chunk it directly.
  const chunks: string[] = [];
  for (const sec of sections) {
    if (sec.length === 0) continue;
    if (sec.length <= maxChars) {
      chunks.push(sec);
    } else {
      // Window the section
      let i = 0;
      while (i < sec.length) {
        const end = Math.min(sec.length, i + maxChars);
        chunks.push(sec.slice(i, end));
        if (end === sec.length) break;
        i += maxChars - CHUNK_OVERLAP;
      }
    }
  }

  return chunks.filter((c) => c.trim().length >= MIN_CHUNK_CHARS);
}

// ─────────────────────────────────────────────────────────────────────────
// Below this line: the walker, the indexer, and the CLI.
// Skipped when SKIP_INTEGRATION=1 (used by the unit-test file).
// ─────────────────────────────────────────────────────────────────────────

interface VaultChunk {
  slug: string;
  title: string;
  body: string;
  excerpt?: string;
  date?: string;
  contentHash: string;
  source_type: string;
  source_path: string;
}

interface RootSpec {
  tag: 'noesis' | 'area' | 'resource' | 'project';
  cli: 'noesis' | 'areas' | 'resources' | 'projects' | 'projects-top';
  path: string;
  recurse: boolean;
  maxDepth?: number;
}

const ROOTS: RootSpec[] = [
  { tag: 'noesis', cli: 'noesis', path: join(homedir(), 'Documents', 'noesis'), recurse: true },
  {
    tag: 'area',
    cli: 'areas',
    path: '/Volumes/madara/2026/twc-vault/02-Areas',
    recurse: true,
  },
  {
    tag: 'resource',
    cli: 'resources',
    path: '/Volumes/madara/2026/twc-vault/03-Resources',
    recurse: true,
  },
  {
    tag: 'project',
    cli: 'projects',
    path: '/Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis',
    recurse: false,
    maxDepth: 1,
  },
];

// ─────────────────────────────────────────────────────────────────────────
// File walking (depth-aware to support the projects=top-level-only case)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Depth semantics match `find -maxdepth N`: depth=1 means files directly
 * in `root`, no subdirectory descent. depth=Infinity recurses fully.
 */
async function walkMd(root: string, maxDepth: number = Infinity): Promise<string[]> {
  const out: string[] = [];
  async function go(dir: string, depth: number): Promise<void> {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      // Skip hidden dot-dirs (.git, .obsidian, .DS_Store, etc.)
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) {
        // Only descend if the next depth is still allowed.
        if (depth + 1 < maxDepth) await go(full, depth + 1);
      } else if (e.isFile() && e.name.endsWith('.md')) {
        out.push(full);
      }
    }
  }
  await go(root, 0);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Build chunks from a single file
// ─────────────────────────────────────────────────────────────────────────

function deriveTitle(body: string, path: string): string {
  // Frontmatter title?
  const fmMatch = body.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const t = fmMatch[1]!.match(/^title:\s*(.+)$/m);
    if (t) return t[1]!.trim().replace(/^['"]|['"]$/g, '');
  }
  // First H1?
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1]!.trim();
  // Filename minus extension
  return basename(path, '.md');
}

async function buildChunksForFile(
  path: string,
  sourceType: string,
): Promise<{ chunks: VaultChunk[]; skipReason?: string }> {
  const stats = await stat(path);
  const raw = await readFile(path, 'utf8');
  const decision = shouldSkipFile(path, { size: stats.size }, raw);
  if (decision.skip) return { chunks: [], skipReason: decision.reason };

  const title = deriveTitle(raw, path);
  const body = stripFrontmatter(raw).trim();
  const rawChunks = chunkBody(body, CHUNK_MAX_CHARS);

  const chunks: VaultChunk[] = rawChunks.map((text, idx) => {
    const slug = buildVaultSlug(sourceType, path, idx);
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
    // Excerpt = first sentence or 200 chars
    const firstSentence = text.match(/^([^.!?\n]{20,200}[.!?])/);
    const excerpt = firstSentence ? firstSentence[1] : text.slice(0, 200).replace(/\s+\S*$/, '');
    return {
      slug,
      title,
      body: text,
      excerpt,
      contentHash: hash,
      source_type: sourceType,
      source_path: path,
    };
  });

  return { chunks };
}

// ─────────────────────────────────────────────────────────────────────────
// CLI / main — only runs when invoked directly, not when imported by tests.
// ─────────────────────────────────────────────────────────────────────────

interface RootStats {
  files_walked: number;
  files_skipped: Record<string, number>; // reason → count
  chunks_emitted: number;
  chunks_unchanged: number;
  chunks_errored: number;
  ms: number;
}

async function indexRoot(
  root: RootSpec,
  args: {
    baseUrl: string;
    dryRun: boolean;
    force: boolean;
    limit: number;
    batchSize: number;
    emittedSoFar: () => number;
  },
): Promise<RootStats> {
  const t0 = Date.now();
  const stats: RootStats = {
    files_walked: 0,
    files_skipped: {},
    chunks_emitted: 0,
    chunks_unchanged: 0,
    chunks_errored: 0,
    ms: 0,
  };

  const maxDepth = root.recurse ? Infinity : root.maxDepth ?? 0;
  const files = await walkMd(root.path, maxDepth);
  console.log(`\n▸ Root [${root.tag}]: ${root.path}`);
  console.log(`  walked ${files.length} .md files (maxDepth=${maxDepth})`);

  // Accumulate chunks into batches; flush at batchSize.
  let pending: VaultChunk[] = [];
  const flush = async (): Promise<void> => {
    if (pending.length === 0) return;
    if (args.dryRun) {
      stats.chunks_emitted += pending.length;
      pending = [];
      return;
    }
    const res = await fetch(`${args.baseUrl}/embed/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts: pending, force: args.force, concurrency: 4 }),
    });
    if (!res.ok) {
      console.error(`    ✗ batch failed: HTTP ${res.status}`);
      console.error(`      ${await res.text()}`);
      stats.chunks_errored += pending.length;
      pending = [];
      return;
    }
    const result = (await res.json()) as {
      total: number;
      embedded: number;
      skipped_unchanged: number;
      errors: Array<{ slug: string; reason: string }>;
      ms: number;
    };
    stats.chunks_emitted += result.embedded;
    stats.chunks_unchanged += result.skipped_unchanged;
    stats.chunks_errored += result.errors.length;
    const sample = result.errors[0];
    console.log(
      `    batch ${pending.length} → embedded=${result.embedded}, unchanged=${result.skipped_unchanged}, errors=${result.errors.length} (${result.ms}ms)` +
        (sample ? `  first-error: ${sample.slug} — ${sample.reason.slice(0, 80)}` : ''),
    );
    pending = [];
  };

  for (const path of files) {
    if (args.emittedSoFar() + stats.chunks_emitted >= args.limit) break;
    stats.files_walked++;
    let built;
    try {
      built = await buildChunksForFile(path, root.tag);
    } catch (err) {
      stats.files_skipped['read-error'] = (stats.files_skipped['read-error'] ?? 0) + 1;
      console.warn(`  ✗ ${path}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    if (built.skipReason) {
      stats.files_skipped[built.skipReason] =
        (stats.files_skipped[built.skipReason] ?? 0) + 1;
      continue;
    }
    for (const chunk of built.chunks) {
      if (args.emittedSoFar() + stats.chunks_emitted + pending.length >= args.limit) break;
      pending.push(chunk);
      if (pending.length >= args.batchSize) await flush();
    }
  }
  await flush();

  stats.ms = Date.now() - t0;
  return stats;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const has = (k: string): boolean => argv.includes(k);
  const get = (k: string): string | undefined => argv.find((a) => a.startsWith(`${k}=`))?.split('=')[1];

  const dryRun = has('--dry-run');
  const force = has('--force');
  const local = has('--local');
  const limit = get('--limit') ? parseInt(get('--limit')!, 10) : Infinity;
  const rootFilter = get('--root'); // noesis | areas | resources | projects
  const batchSize = get('--batch-size') ? parseInt(get('--batch-size')!, 10) : 8;

  const baseUrl = local
    ? 'http://localhost:8787'
    : 'https://synchronocities-ai.tirak-court.workers.dev';

  const selected = rootFilter
    ? ROOTS.filter((r) => r.cli === rootFilter || r.tag === rootFilter)
    : ROOTS;
  if (selected.length === 0) {
    console.error(`No root matches --root=${rootFilter}. Available: noesis, areas, resources, projects.`);
    process.exit(1);
  }

  console.log(`▸ index-vault — target=${baseUrl}  dry-run=${dryRun}  force=${force}  limit=${limit}  batch=${batchSize}`);
  console.log(`  Roots: ${selected.map((r) => r.tag).join(', ')}`);

  const totals = {
    files_walked: 0,
    chunks_emitted: 0,
    chunks_unchanged: 0,
    chunks_errored: 0,
    files_skipped: {} as Record<string, number>,
  };

  const t0 = Date.now();
  for (const root of selected) {
    const stats = await indexRoot(root, {
      baseUrl,
      dryRun,
      force,
      limit,
      batchSize,
      emittedSoFar: () => totals.chunks_emitted,
    });
    totals.files_walked += stats.files_walked;
    totals.chunks_emitted += stats.chunks_emitted;
    totals.chunks_unchanged += stats.chunks_unchanged;
    totals.chunks_errored += stats.chunks_errored;
    for (const [k, v] of Object.entries(stats.files_skipped)) {
      totals.files_skipped[k] = (totals.files_skipped[k] ?? 0) + v;
    }
    console.log(
      `  ▸ [${root.tag}] files=${stats.files_walked}  skipped=${JSON.stringify(stats.files_skipped)}  emitted=${stats.chunks_emitted}  unchanged=${stats.chunks_unchanged}  errored=${stats.chunks_errored}  (${(stats.ms / 1000).toFixed(1)}s)`,
    );
  }

  const totalMs = Date.now() - t0;
  console.log(`\n▸ Totals (${(totalMs / 1000).toFixed(1)}s):`);
  console.log(`  files_walked    : ${totals.files_walked}`);
  console.log(`  files_skipped   : ${JSON.stringify(totals.files_skipped)}`);
  console.log(`  chunks_emitted  : ${totals.chunks_emitted}`);
  console.log(`  chunks_unchanged: ${totals.chunks_unchanged}`);
  console.log(`  chunks_errored  : ${totals.chunks_errored}`);
}

// Only run main when invoked directly. Bun's test runner imports the file
// to access exported helpers; we DON'T want the walker to fire during tests.
const isMainModule = import.meta.path === Bun.main;
if (isMainModule) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
