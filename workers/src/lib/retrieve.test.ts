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
 *
 * Both tests in this file hit the live deployed Worker. They are skipped
 * when SKIP_INTEGRATION=1 (the default `npm test` script sets it) — matching
 * the gate in src/routes/expand-v2.test.ts. Skipping also avoids leaving the
 * fetch keep-alive socket to the live origin open after the run.
 */

import { test, expect } from 'bun:test';

const BASE_URL = 'https://synchronocities-ai.sheshnarayan-iyer.workers.dev';
const SKIP = process.env.SKIP_INTEGRATION === '1';

// /test/* routes are admin-gated (ISSUE-02). Integration runs need the key.
const ADMIN_KEY = process.env.ADMIN_API_KEY;
const ADMIN_HEADERS: Record<string, string> = ADMIN_KEY ? { 'X-Admin-Key': ADMIN_KEY } : {};

const integrationTest = SKIP || !ADMIN_KEY ? test.skip : test;

integrationTest('GET /test/retrieve returns top-3 neighbors from OTHER posts', async () => {
  const res = await fetch(`${BASE_URL}/test/retrieve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...ADMIN_HEADERS },
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
  expect(data.neighbors.length).toBeGreaterThan(0); // body_excerpt populated as of CORPUS_VERSION=3
  expect(data.neighbors.every((n) => n.slug !== 'vessel-prepare-ukha-sambharana')).toBe(true);
  expect(data.neighbors[0]).toHaveProperty('passage_text');
  expect(data.neighbors[0]).toHaveProperty('score');
  expect(data.neighbors[0]).toHaveProperty('slug');
  expect(data.neighbors[0]).toHaveProperty('title');
}, 60_000);

integrationTest('POST /test/retrieve handles section text well over the embed model token cap', async () => {
  // The e5 family caps input at 512 tokens. `retrieveNeighbors` truncates
  // to ~1800 chars (~450–510 tokens) before calling embed(). Without that
  // truncation, NIM returns 400 "Input length N exceeds maximum allowed
  // token size 512" and the whole /expand/v2 pipeline 500s. This test
  // pins the fix: an oversize section must STILL produce neighbors.
  const oversizeSection =
    'The cavity precedes the flame. Containment is the work. '.repeat(80); // ~4500 chars, ~1100 tokens
  const res = await fetch(`${BASE_URL}/test/retrieve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...ADMIN_HEADERS },
    body: JSON.stringify({
      section_text: oversizeSection,
      exclude_slug: 'vessel-prepare-ukha-sambharana',
    }),
  });
  expect(res.status).toBe(200);
  const data = (await res.json()) as {
    neighbors: Array<{ slug: string; score: number }>;
  };
  expect(Array.isArray(data.neighbors)).toBe(true);
  expect(data.neighbors.length).toBeGreaterThan(0);
}, 60_000);
