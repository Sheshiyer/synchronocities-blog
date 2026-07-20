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
import { requireReachability } from './lib/reachability';

// ─────────────────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const local = args.has('--local');
const dryRun = args.has('--dry-run');
const force = args.has('--force');
const all = args.has('--all');
const skipReachability = args.has('--skip-reachability-check');
const limitArg = [...args].find((a) => a.startsWith('--limit='));
const slugArg = [...args].find((a) => a.startsWith('--slug='));

const limit = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : 5;
const onlySlug = slugArg ? slugArg.split('=')[1] : null;

const BASE_URL = local
  ? 'http://localhost:8787'
  : 'https://synchronocities-ai.sheshnarayan-iyer.workers.dev';

// /expand/section is admin-gated (ISSUE-02) — fail fast without the key.
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
if (!ADMIN_API_KEY) {
  console.error('✗ ADMIN_API_KEY env var required. The Worker auth-gates /expand/* (X-Admin-Key header). Export it and retry.');
  process.exit(2);
}
const ADMIN_HEADERS = { 'X-Admin-Key': ADMIN_API_KEY };

// ─────────────────────────────────────────────────────────────────────────
// Pre-flight: verify the Worker's configured chat model is reachable
// before kicking off a full-batch pass. Catches catalog drift early.
// Pass --skip-reachability-check to bypass (e.g., in CI smoke tests).
// ─────────────────────────────────────────────────────────────────────────

async function preflight(): Promise<void> {
  const res = await fetch(`${BASE_URL}/healthz`);
  if (!res.ok) {
    console.error(`✗ /healthz returned ${res.status} — cannot verify Worker config. Bail.`);
    process.exit(2);
  }
  const data = (await res.json()) as { models?: { chat?: string } };
  const chatModel = data.models?.chat;
  if (!chatModel) {
    console.error(`✗ /healthz response missing models.chat. Cannot verify reachability.`);
    process.exit(2);
  }
  requireReachability(chatModel, { skipCheck: skipReachability, label: `chat model (${chatModel})` });
}

await preflight();

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

// Mirror of the server-side splitSections (in src/routes/expand.ts)
interface Section {
  header: string;
  content: string;
  full: string;
}

function splitSections(body: string): Section[] {
  const lines = body.split('\n');
  const sections: Section[] = [];
  let currentHeader = '';
  let currentContent: string[] = [];

  const flush = () => {
    const content = currentContent.join('\n').trim();
    if (currentHeader || content) {
      const full = currentHeader ? `${currentHeader}\n\n${content}` : content;
      sections.push({ header: currentHeader, content, full });
    }
  };

  for (const line of lines) {
    if (/^##\s+/.test(line) && !line.startsWith('###')) {
      flush();
      currentHeader = line;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  flush();

  return sections.filter((s) => s.header || s.content);
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

  // Filter: if not --force, skip posts already >= 4000 words (threshold)
  // The bg-agent posts started at ~1300-3000 words; 4000+ counts as
  // meaningfully expanded (3-5× over the typical starting size). Lowered
  // from 4500 because per-section failures can leave a post slightly under
  // the strict 4× target but still substantially expanded.
  const EXPANDED_THRESHOLD = 4000;
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
      // Client-side per-section orchestration. Avoids Cloudflare's 100s
      // inbound HTTP cap that hit /expand on slow posts.
      //
      // Steps:
      //   1. Split body locally on ## headers
      //   2. Fire 1 request per section to /expand/section (parallel, up to 4)
      //   3. Stitch back together with original headers
      //   4. Write to disk

      const sections = splitSections(post.body);
      if (sections.length === 0) {
        process.stdout.write('SKIP: no sections found\n');
        continue;
      }

      // Per-section concurrency: 4 in flight at once (each <60s typically)
      const PER_SECTION_CONCURRENCY = 4;
      const expandedSections: string[] = new Array(sections.length).fill('');
      let sectionFailures = 0;

      for (let s = 0; s < sections.length; s += PER_SECTION_CONCURRENCY) {
        const batch = sections.slice(s, s + PER_SECTION_CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (section, j) => {
            const idx = s + j;
            const ac = new AbortController();
            const timeout = setTimeout(() => ac.abort(), 4 * 60 * 1000);
            try {
              const res = await fetch(`${BASE_URL}/expand/section`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...ADMIN_HEADERS },
                body: JSON.stringify({
                  slug: post.slug,
                  title: post.title,
                  header: section.header,
                  content: section.content,
                }),
                signal: ac.signal,
              });
              if (!res.ok) {
                const text = await res.text();
                throw new Error(`HTTP ${res.status}: ${text.slice(0, 150)}`);
              }
              const data = (await res.json()) as { expanded_content: string };
              return { idx, expanded: data.expanded_content };
            } finally {
              clearTimeout(timeout);
            }
          }),
        );

        for (let j = 0; j < results.length; j++) {
          const r = results[j]!;
          const sectionIdx = s + j;
          const section = sections[sectionIdx]!;
          if (r.status === 'fulfilled') {
            // Stitch: header + expanded content
            expandedSections[sectionIdx] = section.header
              ? `${section.header}\n\n${r.value.expanded}`
              : r.value.expanded;
          } else {
            // Fail open: keep original section unchanged
            sectionFailures++;
            expandedSections[sectionIdx] = section.full;
          }
        }
      }

      const expandedBody = expandedSections.join('\n\n');
      const expandedWordCount = expandedBody.split(/\s+/).filter(Boolean).length;
      const elapsed = Date.now() - t;
      const actualMult = Math.round((expandedWordCount / Math.max(1, post.bodyWordCount)) * 100) / 100;
      const failNote = sectionFailures > 0 ? ` [${sectionFailures}/${sections.length} sections failed]` : '';

      // SAFETY GUARD: never write a result that would SHRINK the post.
      // The model sometimes returns refusals or truncated text that, when
      // stitched, totals fewer words than the original. Skip writing — the
      // post stays at its current size and gets retried on the next pass.
      const MIN_ACCEPT_MULTIPLIER = 1.5;
      if (actualMult < MIN_ACCEPT_MULTIPLIER) {
        process.stdout.write(
          `REJECTED (shrink/under-expand): ${post.bodyWordCount}w → ${expandedWordCount}w (${actualMult}×)${failNote} — keeping original\n`,
        );
        results.push({
          slug: post.slug,
          before: post.bodyWordCount,
          after: post.bodyWordCount,
          mult: 1,
          ms: elapsed,
          error: `rejected: ${actualMult}× below ${MIN_ACCEPT_MULTIPLIER}× threshold`,
        });
        continue;
      }

      const newContent = `${post.frontmatterRaw}\n\n${expandedBody.trim()}\n`;
      await writeFile(join(POSTS_DIR, `${post.slug}.md`), newContent);

      process.stdout.write(
        `${post.bodyWordCount}w → ${expandedWordCount}w (${actualMult}×, ${elapsed}ms)${failNote}\n`,
      );

      results.push({
        slug: post.slug,
        before: post.bodyWordCount,
        after: expandedWordCount,
        mult: actualMult,
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
