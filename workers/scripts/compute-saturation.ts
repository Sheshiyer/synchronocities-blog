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
 *   bun workers/scripts/compute-saturation.ts --json     # print only
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SATURATION_TERMS, classify } from '../src/lib/saturation-terms';

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

async function main() {
  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
  const corpus: Record<string, number> = {};
  for (const t of SATURATION_TERMS) corpus[t.key] = 0;

  for (const file of files) {
    const text = readFileSync(join(POSTS_DIR, file), 'utf8');
    const counts = countOccurrences(text);
    for (const [key, n] of Object.entries(counts)) corpus[key] += n;
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
}

if (import.meta.main) {
  await main();
}
