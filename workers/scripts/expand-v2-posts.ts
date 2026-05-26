#!/usr/bin/env bun
/**
 * Expand bg-agent posts via the Worker's /expand/v2/section endpoint
 * (retrieval-grounded, saturation-aware). Mirrors the shape of
 * expand-posts.ts (v1) so the user can pattern-match between them, with
 * the following deliberate differences:
 *
 *   - Endpoint: /expand/v2/section (not /expand/section)
 *   - Request body: { slug, title, header, content } (already matched v1)
 *   - Per-section reporting now surfaces: retrieved_neighbors and
 *     saturated_terms_blocked counts.
 *   - No-shrink guard threshold dropped from 1.5× → 1.2× (v2 is expected
 *     to grow less aggressively — quality > quantity).
 *   - New --audit mode: single-post deep inspection. Implies --dry-run
 *     (no disk writes), prints per-section retrieval + enforcement detail.
 *
 * Usage:
 *   bun scripts/expand-v2-posts.ts                      # next 5 unexpanded posts
 *   bun scripts/expand-v2-posts.ts --limit=1            # next 1 (single-post test)
 *   bun scripts/expand-v2-posts.ts --slug=foo           # specific post
 *   bun scripts/expand-v2-posts.ts --all                # all bg-agent posts
 *   bun scripts/expand-v2-posts.ts --dry-run            # call endpoint, no writes
 *   bun scripts/expand-v2-posts.ts --slug=foo --audit   # detailed inspection (no writes)
 *   bun scripts/expand-v2-posts.ts --local              # use http://localhost:8787
 *   bun scripts/expand-v2-posts.ts --force              # re-expand even if >= threshold
 *
 * Notes:
 *   - The "already expanded" threshold (EXPANDED_THRESHOLD, 4000 words)
 *     is kept from v1 for batch-mode skip behavior. It is LEGACY in v2
 *     (v2's growth target is lower; quality-gated, not multiplier-gated)
 *     but left in place so users running large `--all` jobs still skip
 *     posts already grown to acceptable length. Use --force to override.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { requireReachability } from './lib/reachability';

// ─────────────────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const local = args.has('--local');
const force = args.has('--force');
const all = args.has('--all');
const audit = args.has('--audit');
// audit implies dry-run: never touch disk while inspecting.
const dryRun = args.has('--dry-run') || audit;
const skipReachability = args.has('--skip-reachability-check');
// When set in audit mode, prints the actual expanded section bodies between
// machine-parseable delimiters so downstream A/B-comparison tooling can
// extract v2 output without rerunning the endpoint. Only meaningful with --audit.
const emitContent = args.has('--emit-content');
// When set, the no-shrink guard accepts COMPRESSION outcomes (multiplier
// < 1.0) as legitimate, rejecting only catastrophic shrinkage below
// COMPRESSION_FLOOR (0.3×). Designed for the Task 12 reprocess of posts
// that were already v1-bloated — v2's correct behavior on those is to
// compress, but the default 1.2× guard would reject every one of them.
// Off by default to preserve the "expansion must actually expand" gate
// for genuinely-short input posts.
const allowCompression = args.has('--allow-compression');
const limitArg = [...args].find((a) => a.startsWith('--limit='));
const slugArg = [...args].find((a) => a.startsWith('--slug='));

const limit = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : 5;
const onlySlug = slugArg ? slugArg.split('=')[1] : null;

// Reject unrecognized tokens. Catches the common POSIX-style mistake
// `--slug foo` (two tokens) — without this, slugArg would be undefined,
// the lone bareword `foo` would be silently ignored, and the script would
// quietly run against the full BG_AGENT_POSTS list. Likewise catches
// typos like `--slu=foo` before they cause confusing behavior.
const KNOWN_FLAGS = new Set([
  '--local', '--force', '--all', '--audit', '--dry-run',
  '--skip-reachability-check', '--emit-content', '--allow-compression',
]);
const KNOWN_PREFIXES = ['--limit=', '--slug='];
for (const token of args) {
  if (KNOWN_FLAGS.has(token)) continue;
  if (KNOWN_PREFIXES.some((p) => token.startsWith(p))) continue;
  console.error(
    `✗ Unrecognized argument: '${token}'\n` +
      `  Hint: --slug and --limit use =-form: --slug=foo, --limit=10\n` +
      `  Known flags: ${[...KNOWN_FLAGS, ...KNOWN_PREFIXES.map((p) => `${p}<value>`)].join(', ')}`,
  );
  process.exit(2);
}

if (audit && !onlySlug) {
  console.error('✗ --audit requires --slug=<name> (audit operates on a single post).');
  process.exit(2);
}

if (emitContent && !audit) {
  console.error('✗ --emit-content requires --audit (only meaningful in audit mode).');
  process.exit(2);
}

const BASE_URL = local
  ? 'http://localhost:8787'
  : 'https://synchronocities-ai.tirak-court.workers.dev';

// ─────────────────────────────────────────────────────────────────────────
// Pre-flight: verify the Worker's configured chat model is reachable.
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

// The 30 bg-agent posts that need expansion (per epic #242).
// Same list as v1 — keeps the two scripts aligned.
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
// Frontmatter + section parsing (copied verbatim from v1 — corpus shape
// hasn't changed and we want the two scripts to agree on chunking).
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
// v2 response shape (mirror of workers/src/routes/expand-v2.ts)
// ─────────────────────────────────────────────────────────────────────────

interface ExpandV2Response {
  slug: string;
  header: string;
  original_words: number;
  expanded_words: number;
  expanded_content: string;
  meta: {
    ms: number;
    model: string;
    retrieved_neighbors: Array<{ slug: string; score: number }>;
    saturated_terms: string[];
    saturated_terms_blocked: string[];
    cache: 'hit' | 'miss';
  };
}

interface PerSectionResult {
  idx: number;
  header: string;
  originalWords: number;
  expandedWords: number;
  expanded: string;
  neighbors: Array<{ slug: string; score: number }>;
  saturatedTerms: string[];
  saturatedTermsBlocked: string[];
  cache: 'hit' | 'miss';
  ms: number;
  error?: string;
}

async function callV2Section(
  post: ParsedPost,
  section: Section,
  idx: number,
): Promise<PerSectionResult> {
  const t = Date.now();
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 4 * 60 * 1000);
  try {
    const res = await fetch(`${BASE_URL}/expand/v2/section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as ExpandV2Response;
    return {
      idx,
      header: section.header,
      originalWords: data.original_words,
      expandedWords: data.expanded_words,
      expanded: data.expanded_content,
      neighbors: data.meta.retrieved_neighbors,
      saturatedTerms: data.meta.saturated_terms,
      saturatedTermsBlocked: data.meta.saturated_terms_blocked,
      cache: data.meta.cache,
      ms: Date.now() - t,
    };
  } catch (err) {
    return {
      idx,
      header: section.header,
      originalWords: countWords(section.content),
      // Fail open: section.full is kept on disk in non-dry-run mode.
      // Reflect that in expandedWords too so audit-summary totals match
      // what would actually be written (the original text), rather than
      // 0 — which makes the post ratio look catastrophically wrong.
      expandedWords: countWords(section.full),
      expanded: section.full,
      neighbors: [],
      saturatedTerms: [],
      saturatedTermsBlocked: [],
      cache: 'miss',
      ms: Date.now() - t,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Audit mode — single post, sequential, verbose per-section report.
// ─────────────────────────────────────────────────────────────────────────

function shortHeader(header: string, content: string): string {
  const h = header.replace(/^#+\s+/, '').trim();
  if (h) return h;
  const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? '';
  return firstLine.slice(0, 60) + (firstLine.length > 60 ? '…' : '');
}

async function runAudit(post: ParsedPost): Promise<void> {
  const sections = splitSections(post.body);
  console.log('');
  console.log(`▸ AUDIT: ${post.slug}`);
  console.log(`  endpoint: ${BASE_URL}/expand/v2/section`);
  console.log(`  sections: ${sections.length}, original body: ${post.bodyWordCount}w`);
  console.log('');

  if (sections.length === 0) {
    console.log('  (no sections found — empty body)');
    return;
  }

  const perSection: PerSectionResult[] = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    process.stdout.write(`  [${i + 1}/${sections.length}] ${shortHeader(section.header, section.content)} ... `);
    const r = await callV2Section(post, section, i);
    perSection.push(r);
    if (r.error) {
      process.stdout.write(`ERROR: ${r.error.slice(0, 120)}\n`);
      continue;
    }
    const ratio = r.originalWords > 0
      ? Math.round((r.expandedWords / r.originalWords) * 100) / 100
      : 0;
    process.stdout.write(`${r.originalWords}w → ${r.expandedWords}w (${ratio}×, ${r.ms}ms, cache=${r.cache})\n`);
    const neighborStr = r.neighbors.length === 0
      ? '(none)'
      : r.neighbors.map((n) => `${n.slug} (${n.score.toFixed(3)})`).join(', ');
    console.log(`      neighbors: ${neighborStr}`);
    console.log(`      saturation blacklist (full): ${r.saturatedTerms.length} term(s)${r.saturatedTerms.length > 0 ? ` — [${r.saturatedTerms.join(', ')}]` : ''}`);
    if (r.saturatedTermsBlocked.length > 0) {
      console.log(`      ⚠ terms BLOCKED (sentences stripped): [${r.saturatedTermsBlocked.join(', ')}]`);
    } else {
      console.log(`      terms blocked: none`);
    }
  }

  // Audit summary
  const totalOrig = perSection.reduce((s, r) => s + r.originalWords, 0);
  const totalExp = perSection.reduce((s, r) => s + r.expandedWords, 0);
  const totalNeighbors = perSection.reduce((s, r) => s + r.neighbors.length, 0);
  const totalBlocked = perSection.reduce((s, r) => s + r.saturatedTermsBlocked.length, 0);
  const failures = perSection.filter((r) => r.error).length;
  const overallRatio = totalOrig > 0 ? Math.round((totalExp / totalOrig) * 100) / 100 : 0;

  console.log('');
  console.log('▸ AUDIT SUMMARY');
  console.log(`  sections: ${perSection.length} (${failures} failed)`);
  console.log(`  total: ${totalOrig}w → ${totalExp}w (${overallRatio}×)`);
  console.log(`  retrieved neighbors (sum): ${totalNeighbors}`);
  console.log(`  saturated terms blocked (sum across sections): ${totalBlocked}`);
  console.log(`  audit mode: NO DISK WRITES (--dry-run implied)`);

  if (emitContent) {
    // Emit expanded section bodies between machine-parseable delimiters.
    // Downstream A/B tooling reads stdout, slices on the delimiters,
    // and reconstructs the v2 body for comparison against on-disk v1.
    // Format is deliberately verbose (post-slug + section-idx in markers)
    // so partial logs / interleaved stderr can't break parsing.
    console.log('');
    console.log(`%%V2-EMIT-BEGIN slug=${post.slug}`);
    for (let i = 0; i < perSection.length; i++) {
      const r = perSection[i]!;
      const section = sections[i]!;
      const body = r.error ? section.full : r.expanded;
      console.log(`%%V2-SECTION-BEGIN idx=${i} header=${JSON.stringify(section.header)} error=${r.error ? 'true' : 'false'}`);
      console.log(body);
      console.log(`%%V2-SECTION-END idx=${i}`);
    }
    console.log(`%%V2-EMIT-END slug=${post.slug}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Main (batch/dry-run mode)
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

  if (audit) {
    if (candidates.length === 0) {
      console.error(`✗ no post found matching --slug=${onlySlug}`);
      process.exit(2);
    }
    await runAudit(candidates[0]!);
    return;
  }

  // Sort by current word count (smallest first — those need the most expansion)
  candidates.sort((a, b) => a.bodyWordCount - b.bodyWordCount);

  // LEGACY filter from v1: skip posts already >= 4000 words unless --force.
  // v2 is quality-gated rather than multiplier-gated, but for batch `--all`
  // ergonomics we keep the skip so re-runs don't reprocess already-grown
  // posts. The number is the same as v1.
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

  console.log(`▸ Expanding ${queue.length} post(s) via ${BASE_URL}/expand/v2/section`);
  console.log(`  dry-run: ${dryRun}`);
  console.log('');

  const results: Array<{
    slug: string;
    before: number;
    after: number;
    mult: number;
    ms: number;
    sections: number;
    failures: number;
    neighborsTotal: number;
    blockedTotal: number;
    /** Hard error: HTTP 500/502, parse error, timeout — NOT under-expansion. */
    error?: string;
    /** Soft rejection: expansion below MIN_ACCEPT_MULTIPLIER. Original kept. */
    rejected?: string;
  }> = [];

  for (let i = 0; i < queue.length; i++) {
    const post = queue[i]!;
    const t = Date.now();
    process.stdout.write(`  [${i + 1}/${queue.length}] ${post.slug} (${post.bodyWordCount}w) ... `);

    try {
      const sections = splitSections(post.body);
      if (sections.length === 0) {
        process.stdout.write('SKIP: no sections found\n');
        continue;
      }

      // Per-section concurrency: 4 in flight at once (same as v1)
      const PER_SECTION_CONCURRENCY = 4;
      const expandedSections: string[] = new Array(sections.length).fill('');
      const perSection: PerSectionResult[] = new Array(sections.length);
      let sectionFailures = 0;

      for (let s = 0; s < sections.length; s += PER_SECTION_CONCURRENCY) {
        const batch = sections.slice(s, s + PER_SECTION_CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map((section, j) => callV2Section(post, section, s + j)),
        );

        for (const r of batchResults) {
          perSection[r.idx] = r;
          const section = sections[r.idx]!;
          if (r.error) {
            sectionFailures++;
            expandedSections[r.idx] = section.full;
          } else {
            expandedSections[r.idx] = section.header
              ? `${section.header}\n\n${r.expanded}`
              : r.expanded;
          }
        }
      }

      const expandedBody = expandedSections.join('\n\n');
      const expandedWordCount = countWords(expandedBody);
      const elapsed = Date.now() - t;
      const actualMult = Math.round((expandedWordCount / Math.max(1, post.bodyWordCount)) * 100) / 100;
      const failNote = sectionFailures > 0 ? ` [${sectionFailures}/${sections.length} sections failed]` : '';
      const neighborsTotal = perSection.reduce((s, r) => s + (r?.neighbors.length ?? 0), 0);
      const blockedTotal = perSection.reduce((s, r) => s + (r?.saturatedTermsBlocked.length ?? 0), 0);

      // Two-mode no-shrink guard:
      //   default mode (allowCompression=false): reject anything below 1.2×.
      //     Designed for genuinely-short input posts where v2 is expected to
      //     expand. v1 used 1.5×; we lowered to 1.2× because v2 is
      //     quality-gated rather than multiplier-gated.
      //   compression mode (--allow-compression): accept [0.3×, ∞), reject
      //     only catastrophic shrinkage below 0.3×. Designed for the Task 12
      //     reprocess of already-v1-bloated posts where v2's correct
      //     behavior is to compress back to retrieval-grounded prose.
      //     The 0.3× floor catches pathological output (model returned
      //     two-sentence summary, or every section error-bounced to the
      //     original which somehow words-truncated). Empirically Task 10's
      //     5 worst-offender audits all landed in [0.42×, 0.66×].
      const MIN_ACCEPT_MULTIPLIER = allowCompression ? 0.3 : 1.2;
      const guardLabel = allowCompression ? 'catastrophic shrink' : 'under-expand';
      if (actualMult < MIN_ACCEPT_MULTIPLIER) {
        process.stdout.write(
          `REJECTED (${guardLabel}): ${post.bodyWordCount}w → ${expandedWordCount}w (${actualMult}×)${failNote} — keeping original\n`,
        );
        // Record the rejection as a SEPARATE category from a hard error.
        // A 1.1× expansion is meaningful signal during dry-run exploration
        // ("endpoint is producing weak output for this slug") whereas a
        // hard error is an HTTP/parse failure that needs different triage.
        results.push({
          slug: post.slug,
          before: post.bodyWordCount,
          // Report the actual would-be word count + ratio so the audit
          // shows what the endpoint produced, even though we discard it.
          after: expandedWordCount,
          mult: actualMult,
          ms: elapsed,
          sections: sections.length,
          failures: sectionFailures,
          neighborsTotal,
          blockedTotal,
          rejected: `${actualMult}× below ${MIN_ACCEPT_MULTIPLIER}× threshold`,
        });
        continue;
      }

      if (dryRun) {
        process.stdout.write(
          `DRY-RUN ${post.bodyWordCount}w → ${expandedWordCount}w (${actualMult}×, ${elapsed}ms) neighbors=${neighborsTotal} blocked=${blockedTotal}${failNote}\n`,
        );
        results.push({
          slug: post.slug,
          before: post.bodyWordCount,
          after: expandedWordCount,
          mult: actualMult,
          ms: elapsed,
          sections: sections.length,
          failures: sectionFailures,
          neighborsTotal,
          blockedTotal,
        });
        continue;
      }

      const newContent = `${post.frontmatterRaw}\n\n${expandedBody.trim()}\n`;
      await writeFile(join(POSTS_DIR, `${post.slug}.md`), newContent);

      process.stdout.write(
        `${post.bodyWordCount}w → ${expandedWordCount}w (${actualMult}×, ${elapsed}ms) neighbors=${neighborsTotal} blocked=${blockedTotal}${failNote}\n`,
      );

      results.push({
        slug: post.slug,
        before: post.bodyWordCount,
        after: expandedWordCount,
        mult: actualMult,
        ms: elapsed,
        sections: sections.length,
        failures: sectionFailures,
        neighborsTotal,
        blockedTotal,
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
        sections: 0,
        failures: 0,
        neighborsTotal: 0,
        blockedTotal: 0,
        error: msg.slice(0, 200),
      });
    }
  }

  // Summary
  console.log('');
  console.log('▸ Summary');
  // Three disjoint categories: expanded (would-write), rejected
  // (under-expansion, original kept), failed (hard error, original kept).
  const expanded = results.filter((r) => !r.error && !r.rejected);
  const rejected = results.filter((r) => r.rejected);
  const failed = results.filter((r) => r.error);
  const parts: string[] = [`${expanded.length} expanded`];
  if (rejected.length > 0) parts.push(`${rejected.length} rejected (under-expand)`);
  parts.push(`${failed.length} failed`);
  console.log(`  ${parts.join(', ')}${dryRun ? ' (dry-run — no disk writes)' : ''}`);
  if (expanded.length > 0) {
    const avgMult = expanded.reduce((s, r) => s + r.mult, 0) / expanded.length;
    const totalWordsAdded = expanded.reduce((s, r) => s + (r.after - r.before), 0);
    const totalNeighbors = expanded.reduce((s, r) => s + r.neighborsTotal, 0);
    const totalBlocked = expanded.reduce((s, r) => s + r.blockedTotal, 0);
    console.log(`  avg multiplier: ${avgMult.toFixed(2)}×`);
    console.log(`  total words added: ${totalWordsAdded.toLocaleString()}`);
    console.log(`  retrieved neighbors (sum): ${totalNeighbors}`);
    console.log(`  saturated terms blocked (sum): ${totalBlocked}`);
  }
  if (rejected.length > 0) {
    console.log('');
    console.log('  Rejections (under-expansion — original kept on disk):');
    for (const r of rejected) {
      console.log(`    ⚠ ${r.slug}: ${r.rejected}`);
    }
  }
  if (failed.length > 0) {
    console.log('');
    console.log('  Failures (hard errors):');
    for (const f of failed) {
      console.log(`    ✗ ${f.slug}: ${f.error}`);
    }
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
