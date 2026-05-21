#!/usr/bin/env bun
/**
 * Expand bg-agent posts to ~4× their current length via the Worker's /expand
 * endpoint. Operates on the 30 bg-agent posts tracked in epic #242.
 *
 * Usage:
 *   bun scripts/expand-posts.ts                      # next 5 unexpanded posts
 *   bun scripts/expand-posts.ts --limit=1            # next 1 (single-post test)
 *   bun scripts/expand-posts.ts --slug=foo           # specific post
 *   bun scripts/expand-posts.ts --all                # all 30 (one batch at a time)
 *   bun scripts/expand-posts.ts --dry-run            # show what would be expanded, no writes
 *   bun scripts/expand-posts.ts --local              # use http://localhost:8787
 *   bun scripts/expand-posts.ts --force              # re-expand even if >= 4× threshold
 *
 * Idempotent — a post is considered "already expanded" if it's already
 * >= 4× its original bg-agent length. The script reads the current word
 * count from disk; if you bumped it by hand, the script won't re-expand.
 *
 * Posts are processed in batches of `concurrency` (default 5) to respect
 * the Worker's CPU budget per request and to avoid hammering NIM.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const local = args.has('--local');
const dryRun = args.has('--dry-run');
const force = args.has('--force');
const all = args.has('--all');
const limitArg = [...args].find((a) => a.startsWith('--limit='));
const slugArg = [...args].find((a) => a.startsWith('--slug='));

const limit = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : 5;
const onlySlug = slugArg ? slugArg.split('=')[1] : null;

const BASE_URL = local
  ? 'http://localhost:8787'
  : 'https://synchronocities-ai.tirak-court.workers.dev';

const POSTS_DIR = join(import.meta.dir, '..', '..', 'src', 'content', 'posts');

// The 30 bg-agent posts that need expansion (per epic #242)
const BG_AGENT_POSTS = new Set([
  'active-inference-prediction-engine',
  'bicameral-consciousness-patch',
  'bioelectric-protocol',
  'body-as-blockchain',
  'death-at-the-border',
  'docker-for-chakras',
  'fungal-intelligence-distributed-processing',
  'hidden-history-cultural-amnesia',
  'implosion-paradigm',
  'kubernetes-for-karma',
  'lorenz-kundli-protocol',
  'mantra-as-source-code',
  'model-temperature-and-tapas',
  'morphic-resonance-network-protocol',
  'noetic-aether-substrate',
  'pharmacos-protocol',
  'qualified-to-qualia-fied',
  'root-access-to-reality',
  'sacred-geometry-processing-units',
  'sacred-runtime-bali-padiyami',
  'semantic-trauma',
  'the-devil-in-the-detail',
  'the-ineffable-secrets-of-a-breathing-sprite',
  'the-sun-names-you',
  'three-modes-of-intelligence',
  'vortex-based-mathematics',
  'water-fourth-phase',
  'yantra-and-tantra-in-the-age-of-llms',
  'your-consciousness-needs-better-error-handling',
  'your-reality-is-a-smart-contract',
]);

// ─────────────────────────────────────────────────────────────────────────
// Frontmatter parsing (split, don't reformat — preserve user's YAML exactly)
// ─────────────────────────────────────────────────────────────────────────

interface ParsedPost {
  slug: string;
  frontmatterRaw: string;
  body: string;
  title: string;
  bodyWordCount: number;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function parsePost(raw: string, slug: string): ParsedPost {
  const match = raw.match(/^(---\n[\s\S]*?\n---)\n?([\s\S]*)$/);
  if (!match) throw new Error(`no frontmatter delimiter in ${slug}`);
  const [, frontmatterRaw, body] = match;

  // Extract title from frontmatter (minimal — just for the prompt context)
  const titleMatch = frontmatterRaw!.match(/^title:\s*['"]?(.*?)['"]?\s*$/m);
  const title = titleMatch ? titleMatch[1]!.trim() : slug;

  return {
    slug,
    frontmatterRaw: frontmatterRaw!,
    body: body ?? '',
    title,
    bodyWordCount: countWords(body ?? ''),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  const files = (await readdir(POSTS_DIR)).filter((f) => f.endsWith('.md'));
  const candidates: ParsedPost[] = [];

  for (const file of files) {
    const slug = basename(file, '.md');
    if (onlySlug) {
      if (slug !== onlySlug) continue;
    } else {
      if (!BG_AGENT_POSTS.has(slug)) continue;
    }

    try {
      const raw = await readFile(join(POSTS_DIR, file), 'utf8');
      const post = parsePost(raw, slug);
      candidates.push(post);
    } catch (err) {
      console.warn(`  ✗ skipped ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Sort by current word count (smallest first — those need the most expansion)
  candidates.sort((a, b) => a.bodyWordCount - b.bodyWordCount);

  // Filter: if not --force, skip posts already >= 4500 words (basic threshold)
  // The bg-agent posts started at ~1300-3000 words; 4500 is a fair "expanded" mark
  const EXPANDED_THRESHOLD = 4500;
  const unexpanded = force
    ? candidates
    : candidates.filter((p) => p.bodyWordCount < EXPANDED_THRESHOLD);

  const alreadyExpanded = candidates.length - unexpanded.length;
  if (alreadyExpanded > 0) {
    console.log(`▸ ${alreadyExpanded} post(s) already at ≥${EXPANDED_THRESHOLD} words — skipping (use --force to re-expand)`);
  }

  const queue = all ? unexpanded : unexpanded.slice(0, limit);
  if (queue.length === 0) {
    console.log('▸ Nothing to expand. Use --force to re-expand or --slug=X for a specific post.');
    return;
  }

  console.log(`▸ Expanding ${queue.length} post(s) via ${BASE_URL}/expand`);
  console.log(`  target multiplier: 4×, dry-run: ${dryRun}`);
  console.log('');

  const results: Array<{ slug: string; before: number; after: number; mult: number; ms: number; error?: string }> = [];

  for (let i = 0; i < queue.length; i++) {
    const post = queue[i]!;
    const t = Date.now();
    process.stdout.write(`  [${i + 1}/${queue.length}] ${post.slug} (${post.bodyWordCount}w) ... `);

    if (dryRun) {
      process.stdout.write(`would expand → ~${post.bodyWordCount * 4}w\n`);
      results.push({ slug: post.slug, before: post.bodyWordCount, after: post.bodyWordCount * 4, mult: 4, ms: 0 });
      continue;
    }

    try {
      const res = await fetch(`${BASE_URL}/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: post.slug,
          title: post.title,
          body: post.body,
          target_multiplier: 4,
          bypass_cache: force,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        slug: string;
        original_words: number;
        expanded_words: number;
        actual_multiplier: number;
        expanded_body: string;
        meta: { ms: number; sections_expanded: number; section_failures: number };
      };

      // Write back: original frontmatter + expanded body
      const newContent = `${post.frontmatterRaw}\n\n${data.expanded_body.trim()}\n`;
      await writeFile(join(POSTS_DIR, `${post.slug}.md`), newContent);

      const elapsed = Date.now() - t;
      const meta =
        data.meta.section_failures > 0
          ? ` [${data.meta.section_failures} section failures]`
          : '';
      process.stdout.write(
        `${data.original_words}w → ${data.expanded_words}w (${data.actual_multiplier}×, ${elapsed}ms)${meta}\n`,
      );

      results.push({
        slug: post.slug,
        before: data.original_words,
        after: data.expanded_words,
        mult: data.actual_multiplier,
        ms: elapsed,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`ERROR: ${msg.slice(0, 100)}\n`);
      results.push({
        slug: post.slug,
        before: post.bodyWordCount,
        after: 0,
        mult: 0,
        ms: Date.now() - t,
        error: msg.slice(0, 200),
      });
    }
  }

  // Summary
  console.log('');
  console.log('▸ Summary');
  const success = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);
  console.log(`  ${success.length} expanded, ${failed.length} failed`);
  if (success.length > 0) {
    const avgMult = success.reduce((s, r) => s + r.mult, 0) / success.length;
    const totalWordsAdded = success.reduce((s, r) => s + (r.after - r.before), 0);
    console.log(`  avg multiplier: ${avgMult.toFixed(2)}×`);
    console.log(`  total words added: ${totalWordsAdded.toLocaleString()}`);
  }
  if (failed.length > 0) {
    console.log('');
    console.log('  Failures:');
    for (const f of failed) {
      console.log(`    ✗ ${f.slug}: ${f.error}`);
    }
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
