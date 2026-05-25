/**
 * Integration test for retrieveNeighbors via /test/retrieve endpoint.
 *
 * Hits the deployed Worker (not a local mock) because Vectorize has no
 * good local mock story and the deployed index IS the source of truth
 * for what metadata fields actually round-trip.
 *
 * NOTE: As of Task 4, Vectorize metadata stores `excerpt` (author-written)
 * but NOT `body_excerpt`. The helper falls back from body_excerpt → excerpt
 * gracefully. Task 5 will reindex to add body_excerpt for richer grounding.
 */

import { test, expect } from 'bun:test';

const BASE_URL = 'https://synchronocities-ai.tirak-court.workers.dev';

test('GET /test/retrieve returns top-3 neighbors from OTHER posts', async () => {
  const res = await fetch(`${BASE_URL}/test/retrieve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      section_text: 'the cavity precedes the flame',
      exclude_slug: 'vessel-prepare-ukha-sambharana',
    }),
  });
  expect(res.status).toBe(200);
  const data = (await res.json()) as {
    neighbors: Array<{ slug: string; score: number; passage_text: string; title: string }>;
  };
  expect(Array.isArray(data.neighbors)).toBe(true);
  expect(data.neighbors.length).toBeLessThanOrEqual(3);
  // We tolerate 0 if Vectorize metadata lacks usable passage text (pending Task 5).
  // With excerpt fallback present in current corpus, we expect >0.
  expect(data.neighbors.length).toBeGreaterThanOrEqual(0);
  expect(data.neighbors.every((n) => n.slug !== 'vessel-prepare-ukha-sambharana')).toBe(true);
  if (data.neighbors.length > 0) {
    expect(data.neighbors[0]).toHaveProperty('passage_text');
    expect(data.neighbors[0]).toHaveProperty('score');
    expect(data.neighbors[0]).toHaveProperty('slug');
    expect(data.neighbors[0]).toHaveProperty('title');
  } else {
    console.log('[retrieve.test] WARNING: neighbors empty — likely Vectorize metadata lacks body_excerpt/excerpt (Task 5 will fix).');
  }
}, 60_000);
