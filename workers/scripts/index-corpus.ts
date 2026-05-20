#!/usr/bin/env bun
/**
 * Read all posts in ../src/content/posts/, parse frontmatter + body,
 * compute content hashes, and POST batches to /embed/batch on the
 * deployed Worker (or local wrangler dev).
 *
 * Usage:
 *   bun scripts/index-corpus.ts                          # uses deployed Worker
 *   bun scripts/index-corpus.ts --local                  # uses http://localhost:8787
 *   bun scripts/index-corpus.ts --force                  # re-embed all posts
 *   bun scripts/index-corpus.ts --limit=5                # only first 5 posts (testing)
 *   bun scripts/index-corpus.ts --slug=vessel-prepare-ukha-sambharana
 *
 * Idempotent on the server side — only posts whose contentHash differs
 * from the stored hash get re-embedded.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const local = args.has('--local');
const force = args.has('--force');
const limitArg = [...args].find((a) => a.startsWith('--limit='));
const slugArg = [...args].find((a) => a.startsWith('--slug='));
const batchSizeArg = [...args].find((a) => a.startsWith('--batch-size='));

const limit = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : Infinity;
const onlySlug = slugArg ? slugArg.split('=')[1] : null;
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]!, 10) : 20;

const BASE_URL = local
  ? 'http://localhost:8787'
  : 'https://synchronocities-ai.tirak-court.workers.dev';

const POSTS_DIR = join(import.meta.dir, '..', '..', 'src', 'content', 'posts');

// ─────────────────────────────────────────────────────────────────────────
// Frontmatter parsing (minimal — avoid bringing in js-yaml just for this)
// ─────────────────────────────────────────────────────────────────────────

interface ParsedPost {
  slug: string;
  title: string;
  body: string;
  excerpt?: string;
  date?: string;
  draft?: boolean;
  hidden?: boolean;
  tags?: string[];
  concepts?: string[];
  kosha?: string;
  contentHash: string;
}

function parseFrontmatter(raw: string): { fm: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fm: {}, body: raw };
  const [, fmBlock, body] = match;

  const fm: Record<string, unknown> = {};
  // Very simple YAML — handles: key: value, key: [a, b, c], booleans, folded scalars (>)
  const lines = fmBlock!.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }
    // Top-level keys only (no nested object support — we don't need it)
    const m = line.match(/^([a-z_][\w-]*):\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const [, key, valRaw] = m;
    let val: unknown = valRaw!.trim();

    if (val === '>' || val === '|') {
      // Folded/literal scalar — collect indented continuation lines
      const folded: string[] = [];
      i++;
      while (i < lines.length && /^\s{2}/.test(lines[i]!)) {
        folded.push(lines[i]!.trim());
        i++;
      }
      val = folded.join(val === '>' ? ' ' : '\n');
    } else if (val === '') {
      // List items follow indented
      const items: string[] = [];
      i++;
      while (i < lines.length && /^\s+-\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s+-\s+/, '').trim().replace(/^['"]|['"]$/g, ''));
        i++;
      }
      val = items;
      fm[key!] = val;
      continue;
    } else if (val === 'true' || val === 'false') {
      val = val === 'true';
    } else if (typeof val === 'string') {
      // Strip surrounding quotes
      val = (val as string).replace(/^['"]|['"]$/g, '');
    }
    fm[key!] = val;
    i++;
  }

  return { fm, body: body ?? '' };
}

async function loadPost(filepath: string): Promise<ParsedPost> {
  const raw = await readFile(filepath, 'utf8');
  const { fm, body } = parseFrontmatter(raw);
  const slug = basename(filepath, '.md');
  const cleanBody = body
    .replace(/^#.*$/m, '') // strip first H1 (usually the title)
    .trim();
  const hash = createHash('sha256').update(cleanBody).digest('hex').slice(0, 16);

  return {
    slug,
    title: String(fm.title ?? slug),
    body: cleanBody,
    excerpt: fm.excerpt ? String(fm.excerpt) : undefined,
    date: fm.date ? String(fm.date) : undefined,
    draft: fm.draft === true,
    hidden: fm.hidden === true,
    tags: Array.isArray(fm.tags) ? fm.tags : undefined,
    concepts: Array.isArray(fm.concepts) ? fm.concepts : undefined,
    kosha: fm.kosha ? String(fm.kosha) : undefined,
    contentHash: hash,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`▸ Reading posts from ${POSTS_DIR}`);
  const files = (await readdir(POSTS_DIR)).filter((f) => f.endsWith('.md'));
  console.log(`  found ${files.length} markdown files`);

  let posts: ParsedPost[] = [];
  for (const file of files) {
    try {
      const post = await loadPost(join(POSTS_DIR, file));
      if (onlySlug && post.slug !== onlySlug) continue;
      posts.push(post);
    } catch (err) {
      console.warn(`  ✗ skipped ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (posts.length > limit) posts = posts.slice(0, limit);

  console.log(`▸ Indexing ${posts.length} post(s)`);
  console.log(`  target: ${BASE_URL}/embed/batch`);
  console.log(`  force: ${force}  batch_size: ${batchSize}`);
  if (onlySlug) console.log(`  slug filter: ${onlySlug}`);

  let totalEmbedded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (let i = 0; i < posts.length; i += batchSize) {
    const batch = posts.slice(i, i + batchSize);
    const t = Date.now();

    const res = await fetch(`${BASE_URL}/embed/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts: batch, force }),
    });

    if (!res.ok) {
      console.error(`  ✗ batch ${i / batchSize + 1} failed: HTTP ${res.status}`);
      console.error(`    ${await res.text()}`);
      totalErrors += batch.length;
      continue;
    }

    const result = await res.json() as {
      total: number;
      embedded: number;
      skipped_unchanged: number;
      skipped_draft: number;
      errors: Array<{ slug: string; reason: string }>;
      ms: number;
    };

    totalEmbedded += result.embedded;
    totalSkipped += result.skipped_unchanged + result.skipped_draft;
    totalErrors += result.errors.length;

    console.log(
      `  batch ${i / batchSize + 1}: ${result.embedded} embedded, ` +
        `${result.skipped_unchanged} unchanged, ${result.skipped_draft} draft, ` +
        `${result.errors.length} errors (${Date.now() - t}ms)`,
    );

    for (const err of result.errors) {
      console.warn(`    ✗ ${err.slug}: ${err.reason}`);
    }
  }

  console.log(`\n▸ Done. ${totalEmbedded} embedded, ${totalSkipped} skipped, ${totalErrors} errors.`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
