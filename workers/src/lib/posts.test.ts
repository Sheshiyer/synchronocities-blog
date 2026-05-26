/**
 * Unit tests for posts.ts helpers — focused on the body-cleaning pipeline
 * and the metadata shape we round-trip through Vectorize.
 */

import { describe, test, expect } from 'bun:test';
import {
  buildVectorMetadata,
  cleanBodyForEmbedding,
  type PostMetadata,
} from './posts';

const sampleBody = `# The Matched Cavity

A cavity must precede the flame. This is the first principle.

## Section two

\`\`\`ts
const ignored = "code blocks should be stripped";
\`\`\`

- list marker one
- list marker two

See [the source post](/posts/source) for context. The cavity holds.

Another paragraph of prose that should survive cleaning intact, so that
when we ship body_excerpt into Vectorize metadata the reranker has real
content to judge against rather than a marketing one-liner.`;

describe('cleanBodyForEmbedding', () => {
  test('strips headers, code blocks, list markers, link syntax', () => {
    const cleaned = cleanBodyForEmbedding(sampleBody);
    expect(cleaned.startsWith('#')).toBe(false);
    expect(cleaned).not.toContain('```');
    expect(cleaned).not.toContain('const ignored');
    expect(cleaned).not.toContain('- list marker');
    expect(cleaned).toContain('list marker one');
    expect(cleaned).not.toContain('](/posts/source)');
    expect(cleaned).toContain('the source post');
    expect(cleaned).toContain('cavity must precede the flame');
  });

  test('collapses 3+ blank lines to double newline', () => {
    const cleaned = cleanBodyForEmbedding('para one\n\n\n\n\npara two');
    expect(cleaned).toBe('para one\n\npara two');
  });

  test('returns empty string for empty input', () => {
    expect(cleanBodyForEmbedding('')).toBe('');
  });

  test('removes fenced code blocks whole — header- and list-like lines inside a fence do not leak out', () => {
    const body = [
      'Some prose before.',
      '',
      '```bash',
      '# install deps',
      '- not a real list item',
      'npm install',
      '```',
      '',
      'Some prose after.',
    ].join('\n');
    const cleaned = cleanBodyForEmbedding(body);
    expect(cleaned).toContain('Some prose before.');
    expect(cleaned).toContain('Some prose after.');
    // Nothing from inside the fence should survive (with or without the `#`/`-`).
    expect(cleaned).not.toContain('install deps');
    expect(cleaned).not.toContain('not a real list item');
    expect(cleaned).not.toContain('npm install');
  });
});

describe('buildVectorMetadata', () => {
  const basePost: PostMetadata = {
    slug: 'matched-cavity-principle',
    title: 'The Matched Cavity Principle',
    body: sampleBody,
    excerpt: 'A short author-written marketing line.',
    date: '2026-05-01',
    tags: ['vessel', 'flame'],
    contentHash: 'abc123',
  };

  test('adds body_excerpt with cleaned body content', () => {
    const md = buildVectorMetadata(basePost);
    expect(md.body_excerpt).toBeDefined();
    expect(typeof md.body_excerpt).toBe('string');
    const be = md.body_excerpt as string;
    expect(be).toContain('cavity must precede the flame');
    // No structural markdown noise
    expect(be).not.toContain('```');
    expect(be.startsWith('#')).toBe(false);
    expect(be).not.toContain('](/posts/source)');
    // Starts with actual prose, not a code fence or list marker
    expect(/^[A-Za-z]/.test(be)).toBe(true);
  });

  test('body_excerpt is bounded to <=500 chars', () => {
    const longBody = 'word '.repeat(500); // 2500 chars
    const md = buildVectorMetadata({ ...basePost, body: longBody });
    const be = md.body_excerpt as string;
    expect(be.length).toBeLessThanOrEqual(500);
    expect(be.length).toBeGreaterThan(0);
  });

  test('omits body_excerpt for posts with empty body', () => {
    const md = buildVectorMetadata({ ...basePost, body: '' });
    expect(md.body_excerpt).toBeUndefined();
  });

  test('omits body_excerpt if cleaning yields empty string', () => {
    // Body that is ONLY a fenced code block plus blank lines — after fence
    // removal and trim, cleaned text is the empty string.
    const noiseOnly = '\n\n```\ncode block with no surrounding prose\n```\n\n';
    const md = buildVectorMetadata({ ...basePost, body: noiseOnly });
    // body_excerpt must be omitted entirely (not set to an empty string).
    expect(md.body_excerpt).toBeUndefined();
  });

  test('preserves existing fields (slug, title, content_hash, excerpt)', () => {
    const md = buildVectorMetadata(basePost);
    expect(md.slug).toBe('matched-cavity-principle');
    expect(md.title).toBe('The Matched Cavity Principle');
    expect(md.content_hash).toBe('abc123');
    expect(md.excerpt).toBe('A short author-written marketing line.');
    expect(md.tags).toBe('vessel,flame');
    expect(md.date).toBe('2026-05-01');
  });

  test('emits source_type + source_path when present', () => {
    const md = buildVectorMetadata({
      ...basePost,
      source_type: 'noesis',
      source_path: '/Users/sheshnarayaniyer/Documents/noesis/Research/foo.md',
    });
    expect(md.source_type).toBe('noesis');
    expect(md.source_path).toBe('/Users/sheshnarayaniyer/Documents/noesis/Research/foo.md');
  });

  test('omits source_type + source_path when absent (legacy posts)', () => {
    const md = buildVectorMetadata(basePost);
    expect(md.source_type).toBeUndefined();
    expect(md.source_path).toBeUndefined();
  });
});
