/**
 * Tests for /expand/v2/section.
 *
 * Unit tests pin two pure functions (always run):
 *   1. enforceSaturationCap — sentence-level saturation enforcement (Task 8).
 *      Strips sentences that introduce a saturated term NOT already in the
 *      source section; leaves terms already in the source alone.
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

test('enforceSaturationCap strips sentences that newly introduce a saturated term', () => {
  const original = 'The fire is the substrate. Containment matters.';
  const expanded =
    'The fire is the substrate. The kha-ba-la triad organizes this. Containment matters.';
  const result = enforceSaturationCap(expanded, original, ['kha-ba-la']);
  expect(result.text).not.toContain('kha-ba-la');
  expect(result.text).toContain('Containment matters');
  expect(result.text).toContain('The fire is the substrate');
  expect(result.termsBlocked).toEqual(['kha-ba-la']);
});

test('enforceSaturationCap keeps saturated terms already present in the source', () => {
  const original = 'The kha-ba-la triad organizes consciousness.';
  const expanded =
    'The kha-ba-la triad organizes consciousness. Each leg of kha-ba-la has its function.';
  const result = enforceSaturationCap(expanded, original, ['kha-ba-la']);
  // Both sentences mention kha-ba-la; original already had it → nothing strips.
  expect(result.text).toContain('Each leg of kha-ba-la');
  expect(result.termsBlocked).toEqual([]);
});

test('enforceSaturationCap returns input verbatim for empty saturated list', () => {
  const text = 'Some expanded section content. Another sentence.';
  const result = enforceSaturationCap(text, 'original section.', []);
  expect(result.text).toBe(text);
  expect(result.termsBlocked).toEqual([]);
});

test('enforceSaturationCap silently skips unknown term keys', () => {
  const original = 'A vessel is what holds.';
  const expanded = 'A vessel is what holds. The mystery word frobnicates.';
  // 'frobnicates' is not in SATURATION_TERMS — should not throw, should not strip.
  const result = enforceSaturationCap(expanded, original, ['nonexistent-key']);
  expect(result.text).toBe('A vessel is what holds. The mystery word frobnicates.');
  expect(result.termsBlocked).toEqual([]);
});

test('enforceSaturationCap matches alternate spellings via patterns array', () => {
  // pancha-kosha has patterns ['pancha-kosha', 'pancha kosha', 'panchakosha']
  const original = 'A vessel is what holds.';
  const expanded =
    'A vessel is what holds. The panchakosha framework nests selves. Containment matters.';
  const result = enforceSaturationCap(expanded, original, ['pancha-kosha']);
  expect(result.text).not.toContain('panchakosha');
  expect(result.text).toContain('Containment matters');
  expect(result.termsBlocked).toEqual(['pancha-kosha']);
});

test('enforceSaturationCap is case-insensitive', () => {
  const original = 'A vessel is what holds.';
  const expanded =
    'A vessel is what holds. The KHA-BA-LA triad sits above. Containment matters.';
  const result = enforceSaturationCap(expanded, original, ['kha-ba-la']);
  expect(result.text.toLowerCase()).not.toContain('kha-ba-la');
  expect(result.text).toContain('Containment matters');
  expect(result.termsBlocked).toEqual(['kha-ba-la']);
});

test('enforceSaturationCap deduplicates termsBlocked across multiple offending sentences', () => {
  const original = 'A vessel is what holds.';
  const expanded =
    'A vessel is what holds. The kha-ba-la triad opens. Another sentence about kha-ba-la. ' +
    'Yet more on kha ba la work.';
  const result = enforceSaturationCap(expanded, original, ['kha-ba-la']);
  expect(result.termsBlocked).toEqual(['kha-ba-la']);
  expect(result.text).not.toContain('kha-ba-la');
  expect(result.text).not.toContain('kha ba la');
});

test('enforceSaturationCap returns empty string if every sentence got stripped', () => {
  const original = 'A vessel is what holds.';
  const expanded = 'The kha-ba-la opens. The antar-agni burns.';
  const result = enforceSaturationCap(expanded, original, ['kha-ba-la', 'antar-agni']);
  expect(result.text).toBe('');
  expect(result.termsBlocked.sort()).toEqual(['antar-agni', 'kha-ba-la']);
});

test('enforceSaturationCap short-circuits on first matched term per sentence', () => {
  // When a single sentence introduces TWO saturated terms, the spec says
  // short-circuit after the first match. The sentence is dropped exactly
  // once (no duplication of work) and termsBlocked records the first term
  // encountered in the iteration. Iteration order of the termPatterns Map
  // mirrors the saturatedTerms argument order, so this is deterministic.
  const original = 'Plain original.';
  const expanded = 'Plain original. The kha-ba-la and antar-agni both appear here.';
  const result = enforceSaturationCap(expanded, original, ['kha-ba-la', 'antar-agni']);
  expect(result.text).toBe('Plain original.');
  expect(result.termsBlocked).toHaveLength(1);
  expect(result.termsBlocked).toEqual(['kha-ba-la']);
});

test('enforceSaturationCap preserves paragraph breaks between surviving sentences', () => {
  // Sentence splitter consumes any whitespace after `.!?` — including
  // `\n\n`. The rejoin MUST replay that whitespace, otherwise multi-
  // paragraph model output collapses into a wall of single-spaced prose,
  // a visible regression in the rendered blog.
  const original = 'A vessel is what holds.';
  const expanded = 'A vessel is what holds.\n\nContainment is the work.\n\nNothing more.';
  const result = enforceSaturationCap(expanded, original, []);
  expect(result.text).toBe(expanded.trim());
  // Specifically: paragraph breaks survive.
  expect(result.text).toContain('\n\n');
});

test('enforceSaturationCap preserves paragraph breaks even when a middle sentence is stripped', () => {
  // The stripped sentence AND its trailing separator both drop, so the
  // remaining sentences re-glue with their own original separators.
  const original = 'A vessel is what holds.';
  const expanded =
    'A vessel is what holds.\n\nThe kha-ba-la triad organizes this.\n\nContainment matters.';
  const result = enforceSaturationCap(expanded, original, ['kha-ba-la']);
  expect(result.text).not.toContain('kha-ba-la');
  expect(result.text).toContain('A vessel is what holds.');
  expect(result.text).toContain('Containment matters.');
  // The paragraph break between the two surviving sentences is preserved.
  expect(result.text).toBe('A vessel is what holds.\n\nContainment matters.');
});

test('enforceSaturationCap respects whole-word boundaries (no substring false positives)', () => {
  // 'vajra' is saturated; 'vajrayana' would be a substring but \\b boundaries should prevent a hit.
  // Wait — 'vajra' is in 'vajrayana' as a prefix, so \\bvajra\\b would NOT match 'vajrayana'.
  // That's the desired behavior — confirm here.
  const original = 'A vessel is what holds.';
  const expanded = 'A vessel is what holds. The vajrayana path is broader.';
  const result = enforceSaturationCap(expanded, original, ['vajra']);
  expect(result.text).toContain('vajrayana');
  expect(result.termsBlocked).toEqual([]);
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

const BASE_URL = 'https://synchronocities-ai.sheshnarayan-iyer.workers.dev';
const SKIP = process.env.SKIP_INTEGRATION === '1';

// /expand/* routes are admin-gated (ISSUE-02). Integration runs need the key.
const ADMIN_KEY = process.env.ADMIN_API_KEY;
const ADMIN_HEADERS: Record<string, string> = ADMIN_KEY ? { 'X-Admin-Key': ADMIN_KEY } : {};

const integrationTest = SKIP || !ADMIN_KEY ? test.skip : test;

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
      headers: { 'Content-Type': 'application/json', ...ADMIN_HEADERS },
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
    // Subset actually stripped from the model output by Task 8 enforcement.
    // May be empty (the prompt is good — model usually obeys) but if not,
    // none of those terms should still appear in expanded_content.
    expect(Array.isArray(data1.meta.saturated_terms_blocked)).toBe(true);
    expect(data1.meta.saturated_terms_blocked.length).toBeGreaterThanOrEqual(0);
    if (data1.meta.saturated_terms_blocked.length > 0) {
      const lower = data1.expanded_content.toLowerCase();
      for (const key of data1.meta.saturated_terms_blocked) {
        // The key itself is the canonical form; spot-check the canonical
        // spelling is gone (alternate spellings may also be present in the
        // taxonomy but the canonical is the most likely to leak).
        expect(lower).not.toContain(key.toLowerCase());
      }
    }
    expect(data1.meta.cache).toBe('miss');

    // Cloudflare KV writes are eventually consistent; ctx.waitUntil()
    // commits the cache AFTER the response returns. Give KV ~8s to
    // propagate before checking for a hit — empirically this is reliable
    // in the worker's home colo.
    await new Promise((r) => setTimeout(r, 8000));

    // Second identical call — expect cache hit
    const res2 = await fetch(`${BASE_URL}/expand/v2/section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ADMIN_HEADERS },
      body: JSON.stringify(payload),
    });
    expect(res2.status).toBe(200);
    const data2 = (await res2.json()) as typeof data1;
    expect(data2.meta.cache).toBe('hit');
    expect(data2.expanded_content).toBe(data1.expanded_content);
  },
  120_000,
);
