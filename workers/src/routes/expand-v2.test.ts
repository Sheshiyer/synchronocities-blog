/**
 * Tests for /expand/v2/section.
 *
 * Unit tests pin two pure functions (always run):
 *   1. enforceSaturationCap — currently a no-op pass-through. Task 8 will
 *      replace its body; this test pins the contract callers depend on.
 *   2. stripLeadingHeader — removes both `## Markdown` headers and
 *      bare-text repeats of the source header.
 *
 * Integration test (skipped unless SKIP_INTEGRATION is unset) hits the
 * deployed Worker, verifies response shape, retrieval, saturation list,
 * and the cache miss → hit transition.
 */

import { test, expect } from 'bun:test';
import { enforceSaturationCap, stripLeadingHeader } from './expand-v2';

// ============================================================================
// Unit tests — pure functions, always run
// ============================================================================

test('enforceSaturationCap is a no-op pass-through (Task 7 contract)', () => {
  const text = 'A vessel is what holds. The fire of antar-agni is the substrate.';
  const saturated = ['antar-agni', 'kha-ba-la', 'lorenz-kundli'];
  expect(enforceSaturationCap(text, saturated)).toBe(text);
});

test('enforceSaturationCap returns input unchanged for empty saturated list', () => {
  const text = 'Some expanded section content.';
  expect(enforceSaturationCap(text, [])).toBe(text);
});

test('stripLeadingHeader removes a markdown header at the start', () => {
  const input = '## The Cavity Precedes the Flame\n\nA vessel is what holds.';
  const out = stripLeadingHeader(input, '## The Cavity Precedes the Flame');
  expect(out).toBe('A vessel is what holds.');
});

test('stripLeadingHeader removes a bare-text repeat of the source header', () => {
  const input = 'The Cavity Precedes the Flame\n\nA vessel is what holds.';
  const out = stripLeadingHeader(input, '## The Cavity Precedes the Flame');
  expect(out).toBe('A vessel is what holds.');
});

test('stripLeadingHeader strips markdown bold/italic on the bare repeat', () => {
  const input = '**The Cavity Precedes the Flame**\n\nA vessel is what holds.';
  const out = stripLeadingHeader(input, '## The Cavity Precedes the Flame');
  expect(out).toBe('A vessel is what holds.');
});

test('stripLeadingHeader leaves body intact when no header is present', () => {
  const input = 'A vessel is what holds. Not what it looks like.';
  const out = stripLeadingHeader(input, '## The Cavity Precedes the Flame');
  expect(out).toBe(input);
});

test('stripLeadingHeader stops scanning after a non-header line', () => {
  const input = 'A vessel is what holds.\n## Not a header to strip\nMore body.';
  const out = stripLeadingHeader(input, '## Original Header');
  expect(out).toBe(input);
});

test('stripLeadingHeader handles an empty original header without false positives', () => {
  const input = '\n\nA vessel is what holds.';
  const out = stripLeadingHeader(input, '');
  expect(out).toBe('A vessel is what holds.');
});

// ============================================================================
// Integration test — hits the deployed Worker.
// Skip with SKIP_INTEGRATION=1 for CI without a deployed Worker.
// ============================================================================

const BASE_URL = 'https://synchronocities-ai.tirak-court.workers.dev';
const SKIP = process.env.SKIP_INTEGRATION === '1';

const integrationTest = SKIP ? test.skip : test;

integrationTest(
  'POST /expand/v2/section returns valid shape with retrieved neighbors and cache miss→hit',
  async () => {
    const payload = {
      slug: 'vessel-prepare-ukha-sambharana',
      title: 'Vessel Prepare',
      header: '## The Cavity Precedes the Flame',
      // Use a slightly unique content tag so any prior cache entry from
      // ad-hoc curl probes doesn't bias the first-call cache status here.
      content:
        'A vessel is what holds. Not what it looks like. Not what it weighs. What it holds. ' +
        '[test-run unit:expand-v2.test ' +
        new Date().toISOString().slice(0, 10) +
        ']',
    };

    // First call — expect cache miss
    const res1 = await fetch(`${BASE_URL}/expand/v2/section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(200);
    const data1 = (await res1.json()) as {
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
    };

    expect(data1.slug).toBe(payload.slug);
    expect(data1.header).toBe(payload.header);
    expect(typeof data1.expanded_content).toBe('string');
    expect(data1.expanded_content.length).toBeGreaterThan(0);
    expect(data1.expanded_words).toBeGreaterThanOrEqual(data1.original_words);
    expect(Array.isArray(data1.meta.retrieved_neighbors)).toBe(true);
    expect(data1.meta.retrieved_neighbors.length).toBeGreaterThan(0);
    expect(data1.meta.retrieved_neighbors.length).toBeLessThanOrEqual(3);
    // Full saturation blacklist injected into the prompt — populated by
    // the R2 saturation map.
    expect(Array.isArray(data1.meta.saturated_terms)).toBe(true);
    expect(data1.meta.saturated_terms.length).toBeGreaterThan(0);
    // Subset actually stripped from the model output — empty under the
    // Task 7 no-op stub; Task 8 will populate this.
    expect(Array.isArray(data1.meta.saturated_terms_blocked)).toBe(true);
    expect(data1.meta.saturated_terms_blocked.length).toBe(0);
    expect(data1.meta.cache).toBe('miss');

    // Cloudflare KV writes are eventually consistent; ctx.waitUntil()
    // commits the cache AFTER the response returns. Give KV ~8s to
    // propagate before checking for a hit — empirically this is reliable
    // in the worker's home colo.
    await new Promise((r) => setTimeout(r, 8000));

    // Second identical call — expect cache hit
    const res2 = await fetch(`${BASE_URL}/expand/v2/section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res2.status).toBe(200);
    const data2 = (await res2.json()) as typeof data1;
    expect(data2.meta.cache).toBe('hit');
    expect(data2.expanded_content).toBe(data1.expanded_content);
  },
  120_000,
);
