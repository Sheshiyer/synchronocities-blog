#!/usr/bin/env bun
/**
 * Walk all posts under src/content/posts/, count occurrences of each
 * brand-anchor term across the whole corpus, and write the result as
 * a JSON artifact for /expand/v2 to consume.
 *
 * Output:  workers/.saturation-map.json   (local artifact)
 *
 * Usage:
 *   bun workers/scripts/compute-saturation.ts
 *   bun workers/scripts/compute-saturation.ts --json              # print corpus aggregate only
 *   bun workers/scripts/compute-saturation.ts --upload            # push to R2
 *   bun workers/scripts/compute-saturation.ts --per-post          # per-post bloat ranking (table)
 *   bun workers/scripts/compute-saturation.ts --per-post --json   # same, JSON for jq
 *   bun workers/scripts/compute-saturation.ts --per-post --top=5  # only top N
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { SATURATION_TERMS, classify, THRESHOLDS } from '../src/lib/saturation-terms';

const POSTS_DIR = join(import.meta.dir, '..', '..', 'src', 'content', 'posts');
const OUT_PATH = join(import.meta.dir, '..', '.saturation-map.json');

export function countOccurrences(text: string): Record<string, number> {
  const lower = text.toLowerCase();
  const counts: Record<string, number> = {};
  for (const term of SATURATION_TERMS) {
    let total = 0;
    for (const pattern of term.patterns) {
      const escaped = pattern.toLowerCase().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'g');
      const matches = lower.match(re);
      total += matches ? matches.length : 0;
    }
    counts[term.key] = total;
  }
  return counts;
}

/**
 * Strip YAML frontmatter and return the markdown body so word counts
 * reflect actual prose, not frontmatter metadata.
 */
export function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return m ? (m[1] ?? '') : raw;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export interface PerPostEntry {
  slug: string;
  word_count: number;
  saturated_occurrences: number;
  saturated_density: number;
  top_terms: Array<{ key: string; count: number }>;
}

/**
 * Compute per-post saturation density. `saturatedKeys` is the set of term
 * keys that are saturated at the corpus level (>= saturatedStart). Density
 * is (sum of saturated-term occurrences in this post) / (word count of body).
 */
export function computePerPost(
  body: string,
  slug: string,
  saturatedKeys: Set<string>,
): PerPostEntry {
  const counts = countOccurrences(body);
  const wordCount = countWords(body);
  let saturatedOccurrences = 0;
  const termCounts: Array<{ key: string; count: number }> = [];
  for (const [key, n] of Object.entries(counts)) {
    if (!saturatedKeys.has(key)) continue;
    saturatedOccurrences += n;
    if (n > 0) termCounts.push({ key, count: n });
  }
  termCounts.sort((a, b) => b.count - a.count);
  const density = wordCount > 0
    ? Math.round((saturatedOccurrences / wordCount) * 10000) / 10000
    : 0;
  return {
    slug,
    word_count: wordCount,
    saturated_occurrences: saturatedOccurrences,
    saturated_density: density,
    top_terms: termCounts.slice(0, 5),
  };
}

/** Read CORPUS_VERSION from workers/wrangler.toml so the upload key matches the Worker. */
function readCorpusVersionFromWrangler(): string {
  const toml = readFileSync(join(import.meta.dir, '..', 'wrangler.toml'), 'utf8');
  const m = toml.match(/^CORPUS_VERSION\s*=\s*"([^"]+)"/m);
  if (!m?.[1]) throw new Error('CORPUS_VERSION not found in wrangler.toml');
  return m[1];
}

function parseTopArg(argv: string[]): number | null {
  const t = argv.find((a) => a.startsWith('--top='));
  if (!t) return null;
  const n = parseInt(t.split('=')[1] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
  const corpus: Record<string, number> = {};
  for (const t of SATURATION_TERMS) corpus[t.key] = 0;

  // Pass 1: corpus aggregate (needed in every mode — saturation tier is a
  // corpus-level property).
  const perFile: Array<{ slug: string; body: string }> = [];
  for (const file of files) {
    const raw = readFileSync(join(POSTS_DIR, file), 'utf8');
    const body = stripFrontmatter(raw);
    const slug = basename(file, '.md');
    perFile.push({ slug, body });
    const counts = countOccurrences(raw);
    for (const [key, n] of Object.entries(counts)) corpus[key] += n;
  }

  const saturatedKeys = new Set(
    Object.entries(corpus)
      .filter(([_k, v]) => classify(v) === 'saturated')
      .map(([k]) => k),
  );

  // Per-post mode — emit ranking and exit (no R2 upload, no map write).
  if (process.argv.includes('--per-post')) {
    const top = parseTopArg(process.argv);
    const entries = perFile
      .map(({ slug, body }) => computePerPost(body, slug, saturatedKeys))
      .sort((a, b) => b.saturated_density - a.saturated_density);
    const sliced = top ? entries.slice(0, top) : entries;

    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(sliced, null, 2));
      return;
    }
    // Human-readable table
    console.log(`Per-post saturation density (${sliced.length}/${entries.length} posts, threshold=${THRESHOLDS.saturatedStart}+):`);
    console.log('');
    console.log(`  rank  density  occ  words  slug`);
    console.log(`  ----  -------  ---  -----  ----`);
    sliced.forEach((e, i) => {
      const rank = String(i + 1).padStart(4);
      const density = e.saturated_density.toFixed(4).padStart(7);
      const occ = String(e.saturated_occurrences).padStart(3);
      const words = String(e.word_count).padStart(5);
      console.log(`  ${rank}  ${density}  ${occ}  ${words}  ${e.slug}`);
    });
    return;
  }

  const output = {
    computed_at: new Date().toISOString(),
    corpus_size: files.length,
    counts: corpus,
    classifications: Object.fromEntries(
      Object.entries(corpus).map(([k, v]) => [k, classify(v)]),
    ),
    saturated_terms: Object.entries(corpus)
      .filter(([_k, v]) => classify(v) === 'saturated')
      .map(([k]) => k),
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
    console.log(`Wrote ${OUT_PATH}`);
    console.log(`Corpus: ${files.length} posts`);
    console.log(`Saturated (75+): ${output.saturated_terms.length} terms`);
    console.log(`  ${output.saturated_terms.slice(0, 10).join(', ')}${output.saturated_terms.length > 10 ? '...' : ''}`);
  }

  if (process.argv.includes('--upload')) {
    const { execSync } = await import('node:child_process');
    const corpusVersion = process.env.CORPUS_VERSION ?? readCorpusVersionFromWrangler();
    // Guard against shell injection — `corpusVersion` is interpolated into a
    // shell command below. Restrict to alphanumeric/dot/dash/underscore.
    if (!/^[\w.-]+$/.test(corpusVersion)) {
      throw new Error(`Invalid CORPUS_VERSION (must match /^[\\w.-]+$/): ${corpusVersion}`);
    }
    const key = `saturation/v${corpusVersion}.json`;
    execSync(
      `wrangler r2 object put synchronocities-artifacts/${key} --file=${OUT_PATH} --content-type=application/json --remote`,
      { stdio: 'inherit', cwd: join(import.meta.dir, '..') },
    );
    console.log(`Uploaded to r2://synchronocities-artifacts/${key}`);
  }
}

if (import.meta.main) {
  await main();
}
