/**
 * Tests for lib/auth.ts — the ISSUE-02 admin gate + CORS allowlist.
 *
 * Covers the contract the fetch wrapper in index.ts relies on:
 *   - route classification (admin vs public, incl. the GET/POST split on
 *     /maps/cluster)
 *   - key extraction (X-Admin-Key, Authorization: Bearer)
 *   - requireAdmin: 401 without key, null (pass) with key, 500 fail-CLOSED
 *     when ADMIN_API_KEY is unset
 *   - timingSafeEqual basics
 *   - CORS allowlist: prod origin + localhost dev origins only
 */

import { test, expect } from 'bun:test';
import {
  isAdminRoute,
  extractAdminKey,
  timingSafeEqual,
  requireAdmin,
  allowedOrigin,
  applyCors,
  handleOptions,
} from './auth';

const KEY = 'test-admin-key-0123456789abcdef';

function req(
  path: string,
  init: { method?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request(`https://synchronocities-ai.example.workers.dev${path}`, init);
}

// ============================================================================
// Route classification
// ============================================================================

test('isAdminRoute: admin POST routes', () => {
  for (const p of ['/embed/batch', '/expand', '/expand/section', '/expand/v2/section', '/generate/summary']) {
    expect(isAdminRoute('POST', p)).toBe(true);
  }
});

test('isAdminRoute: all /test/* routes are admin regardless of method', () => {
  expect(isAdminRoute('GET', '/test/probe-one')).toBe(true);
  expect(isAdminRoute('POST', '/test/eval-embed')).toBe(true);
  expect(isAdminRoute('GET', '/test/saturation')).toBe(true);
});

test('isAdminRoute: /vectorize/info is admin', () => {
  expect(isAdminRoute('GET', '/vectorize/info')).toBe(true);
});

test('isAdminRoute: POST /maps/cluster admin, GET public', () => {
  expect(isAdminRoute('POST', '/maps/cluster')).toBe(true);
  expect(isAdminRoute('GET', '/maps/cluster')).toBe(false);
});

test('isAdminRoute: public routes stay public', () => {
  expect(isAdminRoute('GET', '/')).toBe(false);
  expect(isAdminRoute('GET', '/healthz')).toBe(false);
  expect(isAdminRoute('GET', '/models')).toBe(false);
  expect(isAdminRoute('GET', '/search')).toBe(false);
  expect(isAdminRoute('GET', '/related/some-slug')).toBe(false);
  expect(isAdminRoute('POST', '/chat')).toBe(false);
});

// ============================================================================
// Key extraction + comparison
// ============================================================================

test('extractAdminKey: prefers X-Admin-Key header', () => {
  const r = req('/embed/batch', { headers: { 'X-Admin-Key': KEY } });
  expect(extractAdminKey(r)).toBe(KEY);
});

test('extractAdminKey: accepts Authorization: Bearer', () => {
  const r = req('/embed/batch', { headers: { Authorization: `Bearer ${KEY}` } });
  expect(extractAdminKey(r)).toBe(KEY);
});

test('extractAdminKey: null when neither header present', () => {
  expect(extractAdminKey(req('/embed/batch'))).toBeNull();
});

test('extractAdminKey: null for empty / non-Bearer values', () => {
  expect(extractAdminKey(req('/x', { headers: { 'X-Admin-Key': '   ' } }))).toBeNull();
  expect(extractAdminKey(req('/x', { headers: { Authorization: 'Basic abc' } }))).toBeNull();
});

test('timingSafeEqual: equal strings match, different do not', () => {
  expect(timingSafeEqual(KEY, KEY)).toBe(true);
  expect(timingSafeEqual(KEY, KEY + 'x')).toBe(false);
  expect(timingSafeEqual(KEY, KEY.slice(0, -1))).toBe(false);
  expect(timingSafeEqual(KEY, KEY.replace('0', '1'))).toBe(false);
  expect(timingSafeEqual('', '')).toBe(true);
});

// ============================================================================
// requireAdmin — the gate itself
// ============================================================================

test('requireAdmin: 401 unauthorized without a key', async () => {
  const res = requireAdmin(req('/embed/batch', { method: 'POST' }), { ADMIN_API_KEY: KEY });
  expect(res).not.toBeNull();
  expect(res!.status).toBe(401);
  expect(await res!.json()).toEqual({ error: 'unauthorized' });
});

test('requireAdmin: 401 unauthorized with the wrong key', () => {
  const res = requireAdmin(
    req('/embed/batch', { method: 'POST', headers: { 'X-Admin-Key': 'wrong' } }),
    { ADMIN_API_KEY: KEY },
  );
  expect(res!.status).toBe(401);
});

test('requireAdmin: null (authorized) with the correct X-Admin-Key', () => {
  const res = requireAdmin(
    req('/embed/batch', { method: 'POST', headers: { 'X-Admin-Key': KEY } }),
    { ADMIN_API_KEY: KEY },
  );
  expect(res).toBeNull();
});

test('requireAdmin: null (authorized) with the correct Bearer token', () => {
  const res = requireAdmin(
    req('/embed/batch', { method: 'POST', headers: { Authorization: `Bearer ${KEY}` } }),
    { ADMIN_API_KEY: KEY },
  );
  expect(res).toBeNull();
});

test('requireAdmin: fails CLOSED with 500 when ADMIN_API_KEY is unset', async () => {
  // Even a would-be-correct key must not open the gate when the server has
  // no key configured — a misconfigured Worker must never be an open Worker.
  const res = requireAdmin(
    req('/embed/batch', { method: 'POST', headers: { 'X-Admin-Key': KEY } }),
    {},
  );
  expect(res).not.toBeNull();
  expect(res!.status).toBe(500);
  expect(await res!.json()).toEqual({ error: 'server_misconfigured' });
});

// ============================================================================
// CORS allowlist
// ============================================================================

test('allowedOrigin: production blog origin allowed', () => {
  const r = req('/chat', { headers: { Origin: 'https://synchronocities.tryambakam.com' } });
  expect(allowedOrigin(r)).toBe('https://synchronocities.tryambakam.com');
});

test('allowedOrigin: localhost + 127.0.0.1 on any port allowed (dev)', () => {
  for (const o of ['http://localhost:4321', 'http://localhost:8788', 'http://127.0.0.1:3000']) {
    expect(allowedOrigin(req('/chat', { headers: { Origin: o } }))).toBe(o);
  }
});

test('allowedOrigin: everything else rejected', () => {
  for (const o of [
    'https://evil.example.com',
    'https://synchronocities.tryambakam.com.evil.com',
    'https://localhost:4321', // https localhost is NOT in the dev allowance
    'http://192.168.1.10:4321',
  ]) {
    expect(allowedOrigin(req('/chat', { headers: { Origin: o } }))).toBeNull();
  }
  // No Origin header at all (curl, scripts) → null, no CORS needed
  expect(allowedOrigin(req('/chat'))).toBeNull();
});

test('applyCors: strips legacy wildcard and echoes allowed origin', () => {
  const r = req('/chat', { headers: { Origin: 'https://synchronocities.tryambakam.com' } });
  const legacy = new Response('{}', {
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
  });
  const out = applyCors(r, legacy);
  expect(out.headers.get('Access-Control-Allow-Origin')).toBe('https://synchronocities.tryambakam.com');
  expect(out.headers.get('Vary')).toBe('Origin');
  expect(out.headers.get('Content-Type')).toBe('application/json');
});

test('applyCors: no CORS headers for disallowed origins', () => {
  const r = req('/chat', { headers: { Origin: 'https://evil.example.com' } });
  const legacy = new Response('{}', { headers: { 'Access-Control-Allow-Origin': '*' } });
  const out = applyCors(r, legacy);
  expect(out.headers.get('Access-Control-Allow-Origin')).toBeNull();
});

test('handleOptions: preflight answers allowed origin, bare 204 otherwise', () => {
  const ok = handleOptions(
    req('/chat', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:4321' },
    }),
  );
  expect(ok.status).toBe(204);
  expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4321');
  expect(ok.headers.get('Access-Control-Allow-Headers')).toContain('X-Admin-Key');
  expect(ok.headers.get('Access-Control-Allow-Methods')).toContain('POST');

  const denied = handleOptions(
    req('/chat', { method: 'OPTIONS', headers: { Origin: 'https://evil.example.com' } }),
  );
  expect(denied.status).toBe(204);
  expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
});
