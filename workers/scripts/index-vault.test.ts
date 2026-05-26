/**
 * Unit tests for the pure-function pieces of index-vault.ts.
 *
 * Run with:
 *   SKIP_INTEGRATION=1 bun test scripts/index-vault.test.ts
 *
 * No live POSTs happen in this file. We exercise:
 *   1. chunkBody(body, maxChars)           — H2-split + window-fallback chunking
 *   2. shouldSkipFile(path, stats, body)   — filter pipeline (size, blacklist, image-heavy)
 *   3. buildVaultSlug(type, path, idx)     — deterministic slug shape
 */

import { describe, test, expect } from 'bun:test';
import {
  chunkBody,
  shouldSkipFile,
  buildVaultSlug,
  stripFrontmatter,
  isImageHeavy,
} from './index-vault';

// ───────────────────────────────────────────────────────────────────────────
// chunkBody
// ───────────────────────────────────────────────────────────────────────────

describe('chunkBody', () => {
  test('returns one chunk for a short-ish doc with no H2', () => {
    // Body well over the 200-char MIN_CHUNK_CHARS floor but under 1800.
    const body = 'A short body of prose. Just one paragraph and nothing more. '.repeat(8);
    const chunks = chunkBody(body, 1800);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('one paragraph');
  });

  test('splits into one chunk per H2 section', () => {
    // Each section must be >= 200 chars to clear MIN_CHUNK_CHARS.
    const filler = (label: string): string =>
      `${label}. ` + 'Sentence content with enough words to clear the floor. '.repeat(6);
    const body = [
      '## Section one',
      filler('Body of section one'),
      '',
      '## Section two',
      filler('Body of section two'),
      '',
      '## Section three',
      filler('Body of section three'),
    ].join('\n');
    const chunks = chunkBody(body, 1800);
    expect(chunks.length).toBe(3);
    // Each H2 chunk should carry its heading
    expect(chunks.some((c) => c.includes('Section one'))).toBe(true);
    expect(chunks.some((c) => c.includes('Section two'))).toBe(true);
    expect(chunks.some((c) => c.includes('Section three'))).toBe(true);
  });

  test('sub-splits an H2 section that exceeds maxChars into overlapping windows', () => {
    const longParagraph = 'word '.repeat(800); // ~4000 chars
    const body = `## Long section\n${longParagraph}`;
    const chunks = chunkBody(body, 1800);
    // 4000 chars with 1800 window + 200 overlap → 3 windows
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1800);
    }
  });

  test('windowed-splits a long no-H2 doc', () => {
    const body = 'word '.repeat(800); // ~4000 chars, no headings
    const chunks = chunkBody(body, 1800);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1800);
    }
  });

  test('returns zero chunks for empty body', () => {
    expect(chunkBody('', 1800)).toEqual([]);
    expect(chunkBody('   \n\n  ', 1800)).toEqual([]);
  });

  test('drops chunks under 200 chars (trailing partials)', () => {
    // Section one is generously long; section two is a stub.
    const body = [
      '## Section one',
      'A '.repeat(150), // 300 chars
      '',
      '## Section two',
      'stub.', // ~5 chars
    ].join('\n');
    const chunks = chunkBody(body, 1800);
    // Stub section dropped
    expect(chunks.some((c) => c.includes('stub.'))).toBe(false);
    expect(chunks.some((c) => c.includes('Section one'))).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// shouldSkipFile
// ───────────────────────────────────────────────────────────────────────────

describe('shouldSkipFile', () => {
  test('skips files >200KB', () => {
    const res = shouldSkipFile('/foo/bar.md', { size: 250_000 }, 'a long body');
    expect(res.skip).toBe(true);
    expect(res.reason).toBe('too-big');
  });

  test('skips files with body <200 chars after frontmatter strip', () => {
    const res = shouldSkipFile('/foo/bar.md', { size: 500 }, 'tiny');
    expect(res.skip).toBe(true);
    expect(res.reason).toBe('too-small');
  });

  test('skips _inbox paths', () => {
    const res = shouldSkipFile(
      '/Volumes/madara/2026/twc-vault/03-Resources/_inbox/foo.md',
      { size: 5000 },
      'a'.repeat(500),
    );
    expect(res.skip).toBe(true);
    expect(res.reason).toBe('blacklist');
  });

  test('skips _nightly-builds paths', () => {
    const res = shouldSkipFile(
      '/some/_nightly-builds/dump.md',
      { size: 5000 },
      'a'.repeat(500),
    );
    expect(res.skip).toBe(true);
    expect(res.reason).toBe('blacklist');
  });

  test('skips Zero-One paths (anywhere in tree, case-insensitive)', () => {
    expect(
      shouldSkipFile('/x/Zero-One/y.md', { size: 5000 }, 'a'.repeat(500)).skip,
    ).toBe(true);
    expect(
      shouldSkipFile('/x/zero-one/y.md', { size: 5000 }, 'a'.repeat(500)).skip,
    ).toBe(true);
  });

  test('skips .bak files and AIPRM exports', () => {
    expect(
      shouldSkipFile('/x/foo.bak.md', { size: 5000 }, 'a'.repeat(500)).skip,
    ).toBe(true);
    expect(
      shouldSkipFile('/x/some-thread-export-2024.md', { size: 5000 }, 'a'.repeat(500)).skip,
    ).toBe(true);
  });

  test('skips image-heavy bodies', () => {
    // Body that is ~all image embeds: 1000 chars of `![alt](url)` patterns
    const imageHeavy = '![a](url)'.repeat(120) + ' tiny prose';
    const res = shouldSkipFile('/x/y.md', { size: 5000 }, imageHeavy);
    expect(res.skip).toBe(true);
    expect(res.reason).toBe('image-heavy');
  });

  test('does NOT skip an ordinary prose file', () => {
    const body = 'A '.repeat(500); // 1000 chars of clean prose
    const res = shouldSkipFile('/x/y.md', { size: 5000 }, body);
    expect(res.skip).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// buildVaultSlug
// ───────────────────────────────────────────────────────────────────────────

describe('buildVaultSlug', () => {
  test('produces a deterministic slug for the same inputs', () => {
    const a = buildVaultSlug('area', '/Volumes/foo/bar.md', 0);
    const b = buildVaultSlug('area', '/Volumes/foo/bar.md', 0);
    expect(a).toBe(b);
  });

  test('encodes source_type + chunk_idx in the slug shape', () => {
    const slug = buildVaultSlug('noesis', '/x/y.md', 3);
    expect(slug.startsWith('vault:noesis:')).toBe(true);
    expect(slug.endsWith('#chunk-3')).toBe(true);
  });

  test('different paths produce different slugs', () => {
    const a = buildVaultSlug('area', '/x/a.md', 0);
    const b = buildVaultSlug('area', '/x/b.md', 0);
    expect(a).not.toBe(b);
  });

  test('different chunk indices produce different slugs', () => {
    const a = buildVaultSlug('area', '/x/a.md', 0);
    const b = buildVaultSlug('area', '/x/a.md', 1);
    expect(a).not.toBe(b);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// stripFrontmatter
// ───────────────────────────────────────────────────────────────────────────

describe('stripFrontmatter', () => {
  test('returns body unchanged when no frontmatter present', () => {
    const body = '# A heading\n\nSome prose without any YAML preamble.';
    expect(stripFrontmatter(body)).toBe(body);
  });

  test('strips YAML frontmatter and returns body only', () => {
    const raw = '---\ntitle: Foo\ntags: [a, b]\n---\nReal body starts here.';
    const out = stripFrontmatter(raw);
    expect(out).toBe('Real body starts here.');
  });

  test('handles frontmatter with no trailing newline gracefully', () => {
    const raw = '---\ntitle: X\n---';
    const out = stripFrontmatter(raw);
    expect(out.trim()).toBe('');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// isImageHeavy (regression on the heuristic)
// ───────────────────────────────────────────────────────────────────────────

describe('isImageHeavy', () => {
  test('returns true when >80% of non-whitespace bytes are inside image embeds', () => {
    const heavy = '![x](u)'.repeat(50) + 'word';
    expect(isImageHeavy(heavy)).toBe(true);
  });

  test('returns false on prose-heavy docs with a few images', () => {
    const proseHeavy =
      'Lorem ipsum dolor sit amet, '.repeat(40) + '![one](url) ' + 'consectetur adipiscing elit.'.repeat(10);
    expect(isImageHeavy(proseHeavy)).toBe(false);
  });

  test('returns false on empty body (avoid divide-by-zero)', () => {
    expect(isImageHeavy('')).toBe(false);
  });
});
