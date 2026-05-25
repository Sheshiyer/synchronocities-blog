#!/usr/bin/env bun
/**
 * A/B compare saturated-term counts between v1 (on-disk post) and v2
 * (output from `expand-v2-posts.ts --audit --emit-content`).
 *
 * Inputs:
 *   src/content/posts/<slug>.md            (v1 — current corpus)
 *   /tmp/v2ab/<slug>.log                   (v2 audit log with %%V2-EMIT blocks)
 *
 * Output (stdout, JSON):
 *   {
 *     slug,
 *     v1: { word_count, saturated_occurrences, density, term_counts },
 *     v2: { word_count, saturated_occurrences, density, term_counts },
 *     delta: { occurrences, words, density, per_term }
 *   }
 *
 * Usage:
 *   bun workers/scripts/ab-compare-saturation.ts <slug>
 *   bun workers/scripts/ab-compare-saturation.ts --all   # process all logs in /tmp/v2ab/
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import {
  countOccurrences,
  stripFrontmatter,
  countWords,
} from './compute-saturation';
import { SATURATION_TERMS, classify } from '../src/lib/saturation-terms';

const POSTS_DIR = join(import.meta.dir, '..', '..', 'src', 'content', 'posts');
const AUDIT_DIR = '/tmp/v2ab';
const SATURATION_MAP = join(import.meta.dir, '..', '.saturation-map.json');

interface SaturationMap {
  counts: Record<string, number>;
  saturated_terms: string[];
}

function loadSaturatedKeys(): Set<string> {
  const raw = readFileSync(SATURATION_MAP, 'utf8');
  const map = JSON.parse(raw) as SaturationMap;
  return new Set(map.saturated_terms);
}

/**
 * Extract the concatenated expanded body from an audit log. Looks for
 * %%V2-SECTION-BEGIN ... %%V2-SECTION-END blocks (excluding the marker
 * lines themselves) and joins them in idx order.
 */
function extractV2Body(logPath: string): string {
  const raw = readFileSync(logPath, 'utf8');
  const lines = raw.split('\n');
  const sections: Array<{ idx: number; body: string[] }> = [];
  let cur: { idx: number; body: string[] } | null = null;

  for (const line of lines) {
    const begin = line.match(/^%%V2-SECTION-BEGIN idx=(\d+)/);
    if (begin) {
      cur = { idx: parseInt(begin[1]!, 10), body: [] };
      continue;
    }
    if (line.startsWith('%%V2-SECTION-END')) {
      if (cur) sections.push(cur);
      cur = null;
      continue;
    }
    if (cur) cur.body.push(line);
  }

  sections.sort((a, b) => a.idx - b.idx);
  return sections.map((s) => s.body.join('\n').trim()).join('\n\n');
}

interface Side {
  word_count: number;
  saturated_occurrences: number;
  density: number;
  term_counts: Record<string, number>;
}

function summarize(text: string, saturatedKeys: Set<string>): Side {
  const counts = countOccurrences(text);
  const wordCount = countWords(text);
  const termCounts: Record<string, number> = {};
  let occ = 0;
  for (const [key, n] of Object.entries(counts)) {
    if (!saturatedKeys.has(key)) continue;
    termCounts[key] = n;
    occ += n;
  }
  return {
    word_count: wordCount,
    saturated_occurrences: occ,
    density: wordCount > 0 ? Math.round((occ / wordCount) * 10000) / 10000 : 0,
    term_counts: termCounts,
  };
}

interface AbResult {
  slug: string;
  v1: Side;
  v2: Side;
  delta: {
    occurrences: number;        // v2 - v1 (negative = improvement)
    words: number;              // v2 - v1
    density: number;            // v2 - v1
    per_term: Record<string, number>;
  };
}

function compare(slug: string, saturatedKeys: Set<string>): AbResult {
  const postPath = join(POSTS_DIR, `${slug}.md`);
  const logPath = join(AUDIT_DIR, `${slug}.log`);
  if (!existsSync(postPath)) throw new Error(`v1 post not found: ${postPath}`);
  if (!existsSync(logPath)) throw new Error(`v2 audit log not found: ${logPath}`);

  const v1Body = stripFrontmatter(readFileSync(postPath, 'utf8'));
  const v2Body = extractV2Body(logPath);
  if (!v2Body.trim()) {
    throw new Error(`v2 body empty for ${slug} — emit-content markers missing in log?`);
  }

  const v1 = summarize(v1Body, saturatedKeys);
  const v2 = summarize(v2Body, saturatedKeys);

  const perTerm: Record<string, number> = {};
  for (const key of saturatedKeys) {
    perTerm[key] = (v2.term_counts[key] ?? 0) - (v1.term_counts[key] ?? 0);
  }

  return {
    slug,
    v1,
    v2,
    delta: {
      occurrences: v2.saturated_occurrences - v1.saturated_occurrences,
      words: v2.word_count - v1.word_count,
      density: Math.round((v2.density - v1.density) * 10000) / 10000,
      per_term: perTerm,
    },
  };
}

async function main() {
  const saturatedKeys = loadSaturatedKeys();
  const args = process.argv.slice(2);

  let slugs: string[];
  if (args.includes('--all')) {
    slugs = readdirSync(AUDIT_DIR)
      .filter((f) => f.endsWith('.log'))
      .map((f) => basename(f, '.log'));
  } else {
    const slug = args.find((a) => !a.startsWith('--'));
    if (!slug) {
      console.error('Usage: ab-compare-saturation.ts <slug> | --all');
      process.exit(2);
    }
    slugs = [slug];
  }

  const results: AbResult[] = [];
  for (const slug of slugs) {
    try {
      results.push(compare(slug, saturatedKeys));
    } catch (err) {
      console.error(`✗ ${slug}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

if (import.meta.main) {
  await main();
}
